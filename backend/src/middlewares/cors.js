import cors from "cors";
import { config } from "../config.js";

/**
 * CORS middleware. FRONTEND_ORIGIN may be a comma-separated allow-list
 * (prod). In dev we also accept ANY localhost / 127.0.0.1 origin
 * regardless of port (Vite falls back to 5174+ when 5173 is busy, and
 * "127.0.0.1" is a different origin from "localhost").
 */
const allowedOrigins = new Set(
  (config.frontendOrigin || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
);

const isLocalOrigin = (o) =>
  /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(o);

export const corsMiddleware = cors({
  origin(origin, cb) {
    // No Origin header → non-browser client (curl, server-to-server).
    if (!origin) return cb(null, true);
    if (allowedOrigins.has(origin) || isLocalOrigin(origin)) {
      return cb(null, true);
    }
    return cb(new Error(`Origin not allowed by CORS: ${origin}`));
  },
  credentials: true,
});
