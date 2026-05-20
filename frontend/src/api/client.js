import axios from "axios";

/**
 * Axios instance for all backend calls.
 *
 * Phase 1 (Q-BE-01 resolved): unused at runtime — resource modules
 * short-circuit to mock data when VITE_USE_MOCK_DATA === "true".
 * Configured now so Phase-2 backend integration is a one-flag switch.
 *
 * Response shape (target — see docs/api-contract.md):
 *   success: { "data": ... }
 *   error:   { "error": { code, message, details } }
 *
 * The response interceptor unwraps the `data` envelope so callers get
 * the payload directly. Errors reject with an Error whose .code,
 * .message, and .details mirror the contract.
 */
const client = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
  headers: { "Content-Type": "application/json" },
});

client.interceptors.response.use(
  (response) => {
    if (
      response.data &&
      Object.prototype.hasOwnProperty.call(response.data, "data")
    ) {
      return response.data.data;
    }
    return response.data;
  },
  (error) => {
    const envelope = error.response?.data?.error;
    if (envelope) {
      const err = new Error(envelope.message ?? "Request failed");
      err.code = envelope.code;
      err.details = envelope.details;
      err.status = error.response.status;
      return Promise.reject(err);
    }
    return Promise.reject(error);
  },
);

export default client;
