/**
 * One-line request log with duration.
 *
 * Duration is the point: there was no timing anywhere in the service, so
 * "the dashboard is slow" could not be measured, attributed to the upstream
 * API vs our own work, or shown to have improved. Logged on `finish` so the
 * number covers the whole handler including the upstream round-trip.
 */
export function requestLogger(req, res, next) {
  const startedAt = process.hrtime.bigint();
  res.on("finish", () => {
    const ms = Number(process.hrtime.bigint() - startedAt) / 1e6;
    // `warm` marks a background warm replay so it is not mistaken for a real
    // user request when reading the log.
    const tag = req.headers["x-cache-warm"] ? " warm" : "";
    // eslint-disable-next-line no-console
    console.log(
      `[${new Date().toISOString()}] ${req.method} ${req.originalUrl} ${res.statusCode} ${ms.toFixed(1)}ms${tag}`,
    );
  });
  next();
}
