import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  fetchCurrentUser,
  loginRequest,
  logoutRequest,
  refreshRequest,
} from "@/api/auth.js";

const ACCESS_KEY = "jkdash.accessToken";
const REFRESH_KEY = "jkdash.refreshToken";
const USER_KEY = "jkdash.user";

const AuthContext = createContext(null);

export { AuthContext };

function readStored(key) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStored(key, value) {
  try {
    if (value === null || value === undefined) {
      window.localStorage.removeItem(key);
    } else {
      window.localStorage.setItem(key, value);
    }
  } catch {
    /* localStorage unavailable — silent no-op */
  }
}

/**
 * Top-level auth state. Wraps the entire app from <App /> so every
 * router branch can read `useAuth()`. On mount we hydrate the user
 * either from localStorage (instant) or via /auth/current-user
 * (validates the access token is still good).
 */
export function AuthProvider({ children }) {
  const [accessToken, setAccessToken] = useState(() => readStored(ACCESS_KEY));
  const [refreshToken, setRefreshToken] = useState(() =>
    readStored(REFRESH_KEY),
  );
  const [user, setUser] = useState(() => {
    const raw = readStored(USER_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  });
  const [bootstrapStatus, setBootstrapStatus] = useState(
    accessToken ? "loading" : "anonymous",
  );
  const refreshedOnceRef = useRef(false);

  // Persist + broadcast token changes so the axios interceptor can
  // pick them up without re-importing this module.
  useEffect(() => {
    writeStored(ACCESS_KEY, accessToken);
    writeStored(REFRESH_KEY, refreshToken);
    writeStored(USER_KEY, user ? JSON.stringify(user) : null);
    window.dispatchEvent(new CustomEvent("jkdash:auth-change"));
  }, [accessToken, refreshToken, user]);

  const clearAuth = useCallback(() => {
    setAccessToken(null);
    setRefreshToken(null);
    setUser(null);
  }, []);

  const login = useCallback(async ({ email, password }) => {
    const payload = await loginRequest({ email, password });
    const nextUser = payload?.user ?? null;
    const nextAccess = payload?.accessToken ?? null;
    const nextRefresh = payload?.refreshToken ?? null;
    setAccessToken(nextAccess);
    setRefreshToken(nextRefresh);
    setUser(nextUser);
    setBootstrapStatus("authenticated");
    return nextUser;
  }, []);

  const logout = useCallback(async () => {
    // Fire-and-forget — even if the backend call fails we always
    // clear local state so the user lands on /login.
    try {
      await logoutRequest();
    } catch {
      /* ignore */
    }
    clearAuth();
    setBootstrapStatus("anonymous");
  }, [clearAuth]);

  const refresh = useCallback(async () => {
    if (!refreshToken) throw new Error("No refresh token available");
    const payload = await refreshRequest(refreshToken);
    const nextAccess = payload?.accessToken ?? null;
    const nextRefresh = payload?.refreshToken ?? null;
    if (nextAccess) setAccessToken(nextAccess);
    if (nextRefresh) setRefreshToken(nextRefresh);
    refreshedOnceRef.current = true;
    return nextAccess;
  }, [refreshToken]);

  // Bootstrap: if we have a token in localStorage but no user
  // payload (cold reload), hit /auth/current-user to validate it.
  useEffect(() => {
    if (bootstrapStatus !== "loading") return undefined;
    let cancelled = false;
    (async () => {
      try {
        const payload = await fetchCurrentUser();
        if (cancelled) return;
        setUser(payload?.user ?? null);
        setBootstrapStatus("authenticated");
      } catch {
        if (cancelled) return;
        clearAuth();
        setBootstrapStatus("anonymous");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [bootstrapStatus, clearAuth]);

  const value = useMemo(
    () => ({
      accessToken,
      refreshToken,
      user,
      isAuthenticated: Boolean(accessToken && user),
      isBootstrapping: bootstrapStatus === "loading",
      login,
      logout,
      refresh,
    }),
    [accessToken, refreshToken, user, bootstrapStatus, login, logout, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
