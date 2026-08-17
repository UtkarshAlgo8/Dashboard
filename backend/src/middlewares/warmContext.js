import { runAsRefresh } from "../utils/cache.js";

/**
 * Marks a warm-cycle request so the cache overwrites instead of reading.
 *
 * The warmer replays real HTTP requests against this same server rather than
 * calling loaders directly. That is what guarantees the warmed cache key is
 * byte-identical to the one a browser produces: the request travels the exact
 * same controller path, so there is no second implementation of the key to
 * drift out of sync.
 *
 * Requests carrying `x-cache-warm` therefore need `cached()` to skip its read
 * (otherwise the replay would just be served the existing entry and refresh
 * nothing). `runAsRefresh` sets that flag for the whole downstream async chain.
 *
 * Restricted to loopback: forcing a cache refresh is an upstream-cost amplifier,
 * so it must not be reachable from outside the box.
 */

function isLoopback(req) {
  const addr = req.socket?.remoteAddress ?? "";
  return (
    addr === "127.0.0.1" ||
    addr === "::1" ||
    addr === "::ffff:127.0.0.1" ||
    addr.startsWith("127.")
  );
}

export function warmContext(req, res, next) {
  if (!req.headers["x-cache-warm"] || !isLoopback(req)) {
    next();
    return;
  }
  res.setHeader("x-cache-warmed", "1");
  runAsRefresh(() => next());
}
