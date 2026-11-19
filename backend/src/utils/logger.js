import winston from "winston";
import { sanitizeUrl } from "./telemetry-sanitize.js";

// Winston instrumentation injects trace_id/span_id and forwards these records
// to the OTel Logs SDK when enabled; otherwise only the console transport runs.
const transport = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json(),
  ),
  transports: [new winston.transports.Console()],
});

const message = (args) =>
  args
    .map((value) => {
      // Never serialize arbitrary errors, which can include SQL, credentials or
      // upstream request/response bodies. The span records the error type.
      if (value instanceof Error) return value.name;
      if (typeof value === "string")
        return value
          .replace(/(?:https?|rediss?):\/\/[^\s]+/gi, sanitizeUrl)
          .replace(/(\/reset-password\/)[^/\s]+/gi, "$1[redacted]");
      if (value === null || typeof value !== "object") return String(value);
      return "[object]";
    })
    .join(" ");

export const logger = {
  info: (...args) => transport.info(message(args)),
  warn: (...args) => transport.warn(message(args)),
  error: (...args) => transport.error(message(args)),
};
