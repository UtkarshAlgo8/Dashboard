import axios from "axios";

/**
 * Axios instance for all backend calls.
 *
 * Response shape (target — see docs/api-contract.md):
 *   success: { "data": ... }
 *   error:   { "error": { code, message, details } }
 *   auth success: { statusCode, data: { user, accessToken, … }, message }
 *
 * The auth slice uses an ApiResponse envelope, so the interceptor
 * unwraps both shapes — `{ data }` first (production), then falls
 * back to the response body (auth). Errors reject with an Error
 * whose .code, .message, and .status mirror the contract.
 *
 * Auth header is attached on every request by reading the token
 * from localStorage (the AuthContext keeps it in sync). 401s
 * trigger a single refresh attempt; on failure we hard-redirect
 * to /login so the user lands back on the gate.
 */

const ACCESS_KEY = "jkdash.accessToken";

function readAccessToken() {
  try {
    return window.localStorage.getItem(ACCESS_KEY);
  } catch {
    return null;
  }
}

const client = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
  headers: { "Content-Type": "application/json" },
});

// Requests in flight, so low-priority work (the drill prefetch) can wait until
// the page's own requests are done instead of queueing ahead of them.
let inFlight = 0;
let idleWaiters = [];

function requestDone() {
  inFlight -= 1;
  if (inFlight > 0) return;
  const waiters = idleWaiters;
  idleWaiters = [];
  for (const resolve of waiters) resolve();
}

/** Resolves once no request has been in flight for `quietMs`. */
export async function whenIdle(quietMs = 1000) {
  for (;;) {
    if (inFlight > 0) await new Promise((resolve) => idleWaiters.push(resolve));
    await new Promise((resolve) => setTimeout(resolve, quietMs));
    if (inFlight === 0) return;
  }
}

client.interceptors.request.use((config) => {
  inFlight += 1;
  return config;
});
client.interceptors.response.use(
  (response) => {
    requestDone();
    return response;
  },
  (error) => {
    requestDone();
    return Promise.reject(error);
  },
);

// Keep the in-memory token mirror in sync with localStorage so
// request headers are always current even before AuthProvider's
// effect has flushed.
client.interceptors.request.use((config) => {
  const token = readAccessToken();
  if (token) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

let refreshing = null;

client.interceptors.response.use(
  (response) => {
    // new_change.md C10/C15: /dashboard/kpi-data now answers with SIBLINGS of
    // the row array — `truncated` (the row cap was hit, so the total is
    // incomplete) and `baseline` / `baselineWindow` (the preceding comparison
    // window). Unwrapping to `.data` throws those away, so a caller that needs
    // them passes `{ rawEnvelope: true }` and receives the whole body.
    if (response.config?.rawEnvelope) return response.data;
    if (
      response.data &&
      Object.prototype.hasOwnProperty.call(response.data, "data")
    ) {
      return response.data.data;
    }
    return response.data;
  },
  async (error) => {
    const original = error.config || {};
    const status = error.response?.status;

    // 401 from a non-auth endpoint → try to refresh once.
    const isAuthFree =
      typeof original.url === "string" &&
      (original.url.includes("/auth/login") ||
        original.url.includes("/auth/refresh-token") ||
        original.url.includes("/auth/forgot-password") ||
        original.url.includes("/auth/reset-password"));
    if (status === 401 && !original.__isRetry && !isAuthFree) {
      const refreshToken = (() => {
        try {
          return window.localStorage.getItem("jkdash.refreshToken");
        } catch {
          return null;
        }
      })();
      if (refreshToken && !refreshing) {
        try {
          refreshing = axios.post(
            `${import.meta.env.VITE_API_BASE_URL}/auth/refresh-token`,
            { refreshToken },
          );
          const resp = await refreshing;
          refreshing = null;
          const nextAccess = resp.data?.data?.accessToken;
          const nextRefresh = resp.data?.data?.refreshToken;
          if (nextAccess) {
            window.localStorage.setItem("jkdash.accessToken", nextAccess);
          }
          if (nextRefresh) {
            window.localStorage.setItem("jkdash.refreshToken", nextRefresh);
          }
          // Replay original request with the fresh token.
          original.__isRetry = true;
          original.headers = original.headers ?? {};
          original.headers.Authorization = `Bearer ${nextAccess}`;
          return client.request(original);
        } catch {
          refreshing = null;
          // Fall through to hard redirect below.
        }
      }
      // No refresh token, or refresh failed — wipe + redirect.
      try {
        window.localStorage.removeItem("jkdash.accessToken");
        window.localStorage.removeItem("jkdash.refreshToken");
        window.localStorage.removeItem("jkdash.user");
      } catch {
        /* ignore */
      }
      if (
        typeof window !== "undefined" &&
        window.location.pathname !== "/login"
      ) {
        const next = encodeURIComponent(
          window.location.pathname + window.location.search,
        );
        window.location.assign(`/login?next=${next}`);
      }
    }

    const envelope = error.response?.data?.error ?? error.response?.data;
    if (envelope && (envelope.message || envelope.code !== undefined)) {
      const err = new Error(envelope.message ?? "Request failed");
      err.code = envelope.code;
      err.details = envelope.details;
      err.status = error.response?.status;
      return Promise.reject(err);
    }
    return Promise.reject(error);
  },
);

export default client;
