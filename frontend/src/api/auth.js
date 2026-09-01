/**
 * Auth-related backend calls. Mirrors the backend's `/api/v1/auth`
 * router shape — every function returns the unwrapped payload thanks
 * to the response interceptor on `client`.
 */
import client from "./client.js";

export const loginRequest = ({ email, password }) =>
  client.post("/auth/login", { email, password });

export const logoutRequest = () =>
  client.post("/auth/logout", {}, { withCredentials: true });

export const refreshRequest = (refreshToken) =>
  client.post("/auth/refresh-token", { refreshToken });

export const fetchCurrentUser = () => client.get("/auth/current-user");

export const changePasswordRequest = ({ oldPassword, newPassword }) =>
  client.post("/auth/change-password", { oldPassword, newPassword });
