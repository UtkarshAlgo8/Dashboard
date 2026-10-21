import { cached, buildCacheKey } from "../utils/cache.js";
import { runQuery } from "../utils/upstream.js";
import {
  liveRunningSkusQuery,
  LIVE_RUNNING_SKU_TABLES,
} from "../queries/live-running-skus.js";

const LIVE_TTL_MS = 60_000;

/** A live Silver snapshot, deliberately independent of all header filters. */
export async function getLiveRunningSkus(_req, res, next) {
  try {
    const data = await cached(
      buildCacheKey("/dashboard/live-running-skus", { version: 1 }),
      async () => {
        const rows = await runQuery(liveRunningSkusQuery(), {
          engine: "databricks",
          tables: LIVE_RUNNING_SKU_TABLES,
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
    );
    res.json({ data });
  } catch (error) {
    next(error);
  }
}
