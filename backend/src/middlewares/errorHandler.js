import { UpstreamError } from "../utils/upstream.js";
import { QueryValidationError } from "../queries/dashboard-query.js";

/** Central error handler — maps known errors to envelopes. */
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, _req, res, _next) {
  if (err instanceof UpstreamError) {
    res
      .status(err.status)
      .json({ error: { code: err.type, message: err.message } });
    return;
  }
  if (err instanceof QueryValidationError) {
    res
      .status(400)
      .json({ error: { code: "VALIDATION_ERROR", message: err.message } });
    return;
  }
  // eslint-disable-next-line no-console
  console.error("Unhandled error:", err);
  res.status(500).json({
    error: {
      code: "INTERNAL_ERROR",
      message: "Something went wrong on the server.",
    },
  });
}
