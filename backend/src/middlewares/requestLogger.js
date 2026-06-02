/** One-line request log for dev. */
export function requestLogger(req, _res, next) {
  // eslint-disable-next-line no-console
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  next();
}
