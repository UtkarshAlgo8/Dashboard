/**
 * Quality cross-family controllers (Backend FRD §A).
 *
 * Family-agnostic endpoints that don't belong to a single tab (Process /
 * SPC / …). Currently just the as-of date so every tab's date picker can
 * anchor to the latest data without reaching into a sibling's controller.
 *
 * Same shape as Production's controllers: cached MAX(date) over the gold
 * table, `{ data }` envelope, with `CACHE_TTL.AS_OF` (15 min).
 */
import { CACHE_TTL, cached, buildCacheKey } from "../../utils/cache.js";
import { runQuery } from "../datasource/index.js";
import { DATE_YYYYMMDD } from "../normalize.js";

/**
 * GET /quality/as-of
 *
 * Latest available date in the Quality gold rows. Mirrors Production's
 * `getAsOf` but unscoped — the gold workbook is plant-agnostic (Process rows
 * are labelled BTP, SPC rows BANMORE, so a plant filter would undercount).
 * Returns ISO yyyy-mm-dd (was YYYYMMDD in the DB).
 */
export async function getQualityAsOf(req, res, next) {
  try {
    const key = buildCacheKey("/quality/as-of", {});
    const data = await cached(key, async () => {
      const rows = await runQuery(`SELECT MAX(${DATE_YYYYMMDD}) AS d`);
      const raw = rows?.[0] ? Object.values(rows[0])[0] : null;
      const s = raw == null ? "" : String(raw);
      const asOf = /^\d{8}$/.test(s)
        ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`
        : null;
      return { asOf };
    }, CACHE_TTL.AS_OF);
    res.json({ data });
  } catch (err) {
    next(err);
  }
}