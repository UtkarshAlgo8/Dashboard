import { config } from "../config.js";
import { cacheStats } from "../utils/cache.js";
import { warmCycle } from "../utils/warmer.js";
// Composed here rather than inside cacheStats() — warm-recorder imports
// cache.js, so the reverse import would be a cycle.
import { loadRecorded, recordedSummary } from "../utils/warm-recorder.js";

/**
 * Cache observability.
 *
 * Without this the warmer is unfalsifiable: a warmer that fills keys nobody
 * reads looks exactly like a warmer that works. `hitRate` plus the last warm
 * cycle's outcome is what tells the two apart.
 */
export async function getCacheStats(_req, res, next) {
  try {
    await loadRecorded();
    res.json({
      data: {
        ...(await cacheStats()),
        // Which dashboard views the next cycle will replay. Makes "is the
        // right thing being warmed?" answerable in production.
        recorded: recordedSummary(config.warm.maxRecorded),
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Trigger a warm cycle by hand — useful straight after a deploy instead of
 * waiting for the boot delay, and for verifying the warm set locally.
 * Loopback-only: it costs real upstream queries.
 */
export async function postWarmNow(req, res, next) {
  const addr = req.socket?.remoteAddress ?? "";
  const loopback =
    addr === "::1" || addr === "::ffff:127.0.0.1" || addr.startsWith("127.");
  if (!loopback) {
    res.status(403).json({
      error: { code: "FORBIDDEN", message: "Warm trigger is loopback-only." },
    });
    return;
  }
  try {
    res.json({ data: await warmCycle() });
  } catch (err) {
    next(err);
  }
}
