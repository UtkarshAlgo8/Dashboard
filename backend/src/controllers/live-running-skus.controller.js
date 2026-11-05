import { cached, cacheGet, cacheSet, buildCacheKey } from "../utils/cache.js";
import { runQuery, UpstreamError } from "../utils/upstream.js";
import { liveRunningSkusQuery } from "../queries/live-running-skus.js";

const LIVE_TTL_MS = 60_000;

/**
 * How long a failed snapshot is remembered. An unavailable Athena source
 * must not be queried again for every viewer's 60 s poll. Clients still
 * receive the real error, never a partial or fabricated snapshot.
 */
const LIVE_FAILURE_TTL_MS = 5 * 60_000;
const FAILURE_KEY = buildCacheKey("/dashboard/live-running-skus:failure", {
  version: 2,
});

/** A live Silver snapshot, deliberately independent of all header filters. */
export async function getLiveRunningSkus(_req, res, next) {
  try {
    const failure = await cacheGet(FAILURE_KEY);
    if (failure) {
      throw new UpstreamError(failure.message, {
        type: failure.type,
        status: failure.status,
      });
    }
    const data = await cached(
      buildCacheKey("/dashboard/live-running-skus", { version: 2 }),
      async () => {
        const rows = await runQuery(liveRunningSkusQuery(), {
          // This KPI must use Athena even if a legacy engine is configured.
          // All sources are schema-qualified in SQL; no Delta path loading.
          engine: "athena",
          tables: [],
        });
        const machines = rows.map((row) => ({
          ...row,
          // Preserve the snapshot's audit fields, but never expose an old SKU
          // as live when the feed or machine is no longer Running.
          live_sku: row.machine_status === "Running" ? row.live_sku : null,
          live_sku_description:
            row.machine_status === "Running" ? row.live_sku_description : null,
        }));
        const clock = new Intl.DateTimeFormat("sv-SE", {
          timeZone: "Asia/Kolkata",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hourCycle: "h23",
        }).format(new Date());
        return {
          as_of: machines[0]?.as_of ?? clock,
          timezone: "Asia/Kolkata",
          lookback_days: 7,
          feed_stale_min: 90,
          machines,
        };
      },
      LIVE_TTL_MS,
    ).catch(async (error) => {
      // Only upstream failures are remembered; a bug in this module must
      // surface on the next request rather than be replayed for minutes.
      if (error instanceof UpstreamError) {
        await cacheSet(
          FAILURE_KEY,
          { message: error.message, type: error.type, status: error.status },
          LIVE_FAILURE_TTL_MS,
        );
      }
      throw error;
    });
    res.json({ data });
  } catch (error) {
    next(error);
  }
}
