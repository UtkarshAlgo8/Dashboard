import { withUpstreamTiming } from "../utils/upstream.js";

/**
 * One-line request log with duration.
 *
 * Duration is the point: there was no timing anywhere in the service, so
 * "the dashboard is slow" could not be measured, attributed to the upstream
 * API vs our own work, or shown to have improved. Logged on `finish` so the
 * number covers the whole handler including the upstream round-trip.
 *
 * The same split is sent to the browser as a Server-Timing header (Network →
 * Timing tab): `upstream` is the slowest upstream call (Athena + the upstream
 * API's own queue), `athena` that same call's Athena time, `total` our whole
 * handler. No upstream entry means the answer came from the cache.
 */
export function requestLogger(req, res, next) {
  const startedAt = process.hrtime.bigint();
  const elapsedMs = () => Number(process.hrtime.bigint() - startedAt) / 1e6;
  const upstream = { queries: 0, upstreamMs: 0, athenaMs: 0 };

  // Node sends the headers through writeHead (also for res.json / res.end), so
  // this is the last moment the header can still be added.
  const writeHead = res.writeHead;
  res.writeHead = function (...args) {
    const entries = [];
    if (upstream.queries > 0) {
      if (upstream.athenaMs != null) {
        entries.push(`athena;dur=${upstream.athenaMs.toFixed(0)}`);
      }
      entries.push(
        `upstream;dur=${upstream.upstreamMs.toFixed(0)};desc="${upstream.queries} queries"`,
      );
    }
    entries.push(`total;dur=${elapsedMs().toFixed(0)}`);
    res.setHeader("Server-Timing", entries.join(", "));
    return writeHead.apply(this, args);
  };

  res.on("finish", () => {
    const ms = elapsedMs();
    // `warm` marks a background warm replay so it is not mistaken for a real
    // user request when reading the log.
    const tag = req.headers["x-cache-warm"] ? " warm" : "";
    const split =
      upstream.queries > 0
        ? ` (upstream ${upstream.upstreamMs.toFixed(0)}ms, athena ${upstream.athenaMs?.toFixed(0) ?? "?"}ms, ${upstream.queries} queries)`
        : "";
    // eslint-disable-next-line no-console
    console.log(
      `[${new Date().toISOString()}] ${req.method} ${req.originalUrl} ${res.statusCode} ${ms.toFixed(1)}ms${split}${tag}`,
    );
  });
  withUpstreamTiming(upstream, next);
}
