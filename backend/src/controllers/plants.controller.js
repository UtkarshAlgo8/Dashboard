import { CACHE_TTL, cached, buildCacheKey } from "../utils/cache.js";
import { runQuery } from "../utils/upstream.js";
import { escapeLiteral } from "../queries/queries.js";
import { DATE_YYYYMMDD } from "../queries/dashboard-query.js";
import { goldSource } from "../queries/gold-source.js";
import {
  plantDepartmentPredicate,
  normalizePlantId,
  plantScope,
  excludeUnknownKpiPredicate,
  normalizeGranularity,
  DEFAULT_GRANULARITY,
  emptyColumnPredicate,
  isEmptyValue,
} from "../utils/normalize.js";

// Always-on core filter (realdata.md §1/§2/§9).
const coreFilter = (plantId) =>
  `${plantDepartmentPredicate(plantId)} AND ${excludeUnknownKpiPredicate()}`;

/** ISO yyyy-mm-dd → sortable "YYYYMMDD"; null / malformed → null. */
function isoToYmd(iso) {
  if (typeof iso !== "string") return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso.trim());
  return m ? `${m[1]}${m[2]}${m[3]}` : null;
}

/**
 * Resolve the selected [from, to] window (either bound optional) to
 * YYYYMMDD keys, for both the SQL clamp below and goldSource's table
 * resolution.
 */
function windowKeys(from, to) {
  return { fromKey: isoToYmd(from), toKey: isoToYmd(to) };
}

/**
 * SQL fragment restricting the date column to [fromKey, toKey] (either
 * bound optional). Empty string when no window is given, so the caller
 * falls back to "latest overall". Lets the OEE endpoints track the chosen
 * month instead of always showing the newest row.
 */
function dateWindowSql(fromKey, toKey) {
  const parts = [];
  if (fromKey) parts.push(`${DATE_YYYYMMDD} >= '${fromKey}'`);
  if (toKey) parts.push(`${DATE_YYYYMMDD} <= '${toKey}'`);
  return parts.length ? ` AND ${parts.join(" AND ")}` : "";
}

/**
 * Plant-scoped controllers: one plant, summary, as-of date, per-section OEE.
 */

export const ENABLED_PLANTS = new Set(["banmore", "chennai"]);

// Returns true (and sends a 404) when the plant isn't the Phase-1 plant.
function notPhase1Plant(req, res, message) {
  const plantId = normalizePlantId(req.params.plantId);
  if (plantId && ENABLED_PLANTS.has(plantId)) {
    req.plantId = plantId;
    return false;
  }
  res.status(404).json({
    error: {
      code: "PLANT_NOT_AVAILABLE",
      message: message ?? `Plant '${req.params.plantId}' is not enabled in Phase 1.`,
    },
  });
  return true;
}

export function getPlant(req, res) {
  if (notPhase1Plant(req, res)) return;
  const scope = plantScope(req.plantId);
  // tyreType is the DEFAULT selection; tyreTypes is what the picker offers
  // (Banmore runs one line, CTP runs PCR and TBR).
  res.json({
    data: {
      id: scope.id,
      name: scope.name,
      tyreType: scope.tyreType,
      tyreTypes: scope.tyreTypes,
    },
  });
}

/**
 * Plant summary — headline OEE / FTQ / Scrap values, latest per KPI.
 * Plant-level rows have machine='nan' (the same top-level sentinel
 * used in the KPI grid query).
 */
export async function getSummary(req, res, next) {
  if (notPhase1Plant(req, res, "Unknown plant.")) return;
  const key = buildCacheKey(`/plants/${req.params.plantId}/summary`, req.query);
  // Scope the headline figures to the selected window (from/to) so the plant
  // card tracks the chosen month; absent → latest overall.
  const { fromKey, toKey } = windowKeys(req.query.from, req.query.to);
  const windowSql = dateWindowSql(fromKey, toKey);
  const table = goldSource({ plantId: req.plantId, fromKey, toKey });
  try {
    const data = await cached(key, async () => {
      // Real KPI names (realdata.md §9): the plain "OEE" is gone — Banmore
      // production uses OEE_o. Each KPI anchors to ITS OWN latest date
      // (PARTITION BY kpi_name → rn=1), so a day with only Production data
      // doesn't blank the OEE/Scrap headline (realdata.md §17). machine is
      // SQL NULL on the overall rows (not the 'nan' literal). FTQ has no data
      // yet → its pick() returns null and the card shows a placeholder (§15).
      const sql = `
        SELECT kpi_name, actual_value, d
        FROM (
          SELECT kpi_name, actual_value, ${DATE_YYYYMMDD} AS d,
                 ROW_NUMBER() OVER (
                   PARTITION BY kpi_name
                   ORDER BY ${DATE_YYYYMMDD} DESC
                 ) AS rn
          FROM ${table}
          WHERE ${coreFilter(req.plantId)}
            AND (machine IS NULL OR machine = 'nan')
            AND kpi_name IN (
              ${escapeLiteral("OEE_o")},
              ${escapeLiteral("FTQ")},
              ${escapeLiteral("Scrap")}
            )${windowSql}
        ) ranked
        WHERE rn = 1
      `.trim();
      const toPick = (row) => {
        if (!row) return null;
        // d is "YYYYMMDD" → DD-MM-YYYY for the card.
        const s = row.d == null ? "" : String(row.d);
        const date = /^\d{8}$/.test(s)
          ? `${s.slice(6, 8)}-${s.slice(4, 6)}-${s.slice(0, 4)}`
          : null;
        return { value: row.actual_value, date };
      };

      // Plant-level OEE (the sidebar's plant card headline). Unlike OEE_o —
      // which is always scoped to a section AND a product_type/sub_section —
      // OEE_p is the whole-plant daily figure with section / sub_section /
      // machine / product_type ALL empty. It therefore needs its own query
      // (the OEE_o predicate above would never match it). We take the single
      // latest DAY value (rn=1) — no summing/averaging across days.
      const oeePSql = `
        SELECT actual_value, d
        FROM (
          SELECT actual_value, ${DATE_YYYYMMDD} AS d,
                 ROW_NUMBER() OVER (
                   ORDER BY ${DATE_YYYYMMDD} DESC
                 ) AS rn
          FROM ${table}
          WHERE ${coreFilter(req.plantId)}
            AND kpi_name = ${escapeLiteral("OEE_p")}
            AND ${emptyColumnPredicate("machine")}
            AND ${emptyColumnPredicate("section")}
            AND ${emptyColumnPredicate("sub_section")}
            AND ${emptyColumnPredicate("product_type")}
            AND granularity = ${escapeLiteral("DAY")}${windowSql}
        ) ranked
        WHERE rn = 1
      `.trim();
      // Independent queries — run them side by side.
      const [rows, oeePRows] = await Promise.all([
        runQuery(sql),
        runQuery(oeePSql),
      ]);
      const pick = (name) => toPick(rows.find((r) => r.kpi_name === name));
      const oeeP = toPick(oeePRows[0]);

      return { oeeP, oee: pick("OEE_o"), ftq: pick("FTQ"), scrap: pick("Scrap") };
    }, CACHE_TTL.KPI_ROWS);
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

const AS_OF_RECENT_DAYS = 30;

/** Today (UTC) minus `days`, as a "YYYYMMDD" key. */
function ymdDaysAgo(days) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10).replaceAll("-", "");
}

/**
 * As-of date — the latest available data date for the plant (BRD §13.5).
 * The dashboard anchors Today / MTD / YTD windows to THIS date, not the
 * system clock. Format-robust via DATE_YYYYMMDD; returned as ISO yyyy-mm-dd.
 */
export async function getAsOf(req, res, next) {
  if (notPhase1Plant(req, res, "Unknown plant.")) return;
  const key = buildCacheKey(`/plants/${req.params.plantId}/as-of`, {});
  try {
    const data = await cached(key, async () => {
      const latest = async (fromKey) => {
        const sql = `
          SELECT MAX(${DATE_YYYYMMDD}) AS d
          FROM ${goldSource({ plantId: req.plantId, fromKey, toKey: null })}
          WHERE ${coreFilter(req.plantId)} AND kpi_name = 'Production'${dateWindowSql(fromKey, null)}
        `.trim();
        const rows = await runQuery(sql);
        const raw = rows?.[0] ? Object.values(rows[0])[0] : null;
        // raw is "YYYYMMDD".
        const s = raw == null ? "" : String(raw);
        return /^\d{8}$/.test(s) ? s : null;
      };
      // The newest date is almost always recent, so scan only the last
      // AS_OF_RECENT_DAYS first (about half the Athena time). The full-history
      // scan runs only when that window is empty, so the answer is the same.
      const s = (await latest(ymdDaysAgo(AS_OF_RECENT_DAYS))) ?? (await latest(null));
      // YYYYMMDD → ISO yyyy-mm-dd.
      const asOf = s ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : null;
      return { asOf };
    }, CACHE_TTL.AS_OF);
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

/** kpi_name → the field it maps to in the per-section stats object. */
const SECTION_OEE_KPIS = {
  OEE_o: "oee",
  Availability_o: "availability",
  Performance_o: "performance",
  Quality_o: "quality",
};

/**
 * Per-section OEE — latest OVERALL OEE_o per section, plus its Availability /
 * Performance / Quality breakdown, for the left section column + its hover
 * tooltip (changes.md §2). Section-level rows have machine / product_type /
 * sub_section empty. Sections with no overall OEE_o for the requested
 * granularity (Stock, TBM, and Mixing at MONTH) render NULL (ring shows "–").
 * Response shape (per section): { oee, availability, performance, quality },
 * each a number or absent. Honours an optional ?granularity, default MONTH.
 */
export async function getSectionOee(req, res, next) {
  if (notPhase1Plant(req, res, "Unknown plant.")) return;
  // realdata.md §3: the OEE/section default granularity now falls back to
  // MONTH (was MTD). Inbound values are normalized through the synonym map.
  const gran =
    normalizeGranularity(req.query.granularity) ?? DEFAULT_GRANULARITY;
  const { from, to } = req.query;
  const key = buildCacheKey(`/plants/${req.params.plantId}/section-oee`, {
    gran,
    from,
    to,
  });
  // Scope to the selected window so the rings track the chosen month.
  const { fromKey, toKey } = windowKeys(from, to);
  const windowSql = dateWindowSql(fromKey, toKey);
  const table = goldSource({ plantId: req.plantId, fromKey, toKey, granularity: gran });
  try {
    const data = await cached(key, async () => {
      // changes.md §2: the left section column shows each section's OVERALL
      // OEE_o plus its Availability_o / Performance_o / Quality_o breakdown
      // (for the hover tooltip). All four are product-agnostic (never pin
      // product_type) and section-level (sub_section empty). Where OEE_o is
      // absent for the section/granularity — Stock (no OEE_o), TBM (none),
      // Mixing-Month (no MONTH row) — the section shows NULL. We DO NOT
      // fabricate a value from OEE_s; that is a subsection metric.
      const kpiList = Object.keys(SECTION_OEE_KPIS)
        .map((k) => escapeLiteral(k))
        .join(", ");
      const sql = `
        SELECT section, kpi_name, actual_value
        FROM (
          SELECT section, kpi_name, actual_value,
                 ROW_NUMBER() OVER (
                   PARTITION BY section, kpi_name
                   ORDER BY ${DATE_YYYYMMDD} DESC
                 ) AS rn
          FROM ${table}
          WHERE ${coreFilter(req.plantId)}
            AND kpi_name IN (${kpiList})
            AND ${emptyColumnPredicate("machine")}
            AND ${emptyColumnPredicate("product_type")}
            AND ${emptyColumnPredicate("sub_section")}
            AND granularity = ${escapeLiteral(gran)}${windowSql}
        ) ranked
        WHERE rn = 1
      `.trim();
      const rows = await runQuery(sql);

      const out = {};
      for (const r of rows) {
        const sec = r.section;
        const field = SECTION_OEE_KPIS[r.kpi_name];
        if (isEmptyValue(sec) || !field) continue;
        const val = Number(r.actual_value);
        if (!Number.isFinite(val)) continue;
        (out[sec] ??= {})[field] = Math.round(val * 10) / 10;
      }
      // A section is only meaningful once it has an overall OEE — drop any that
      // came back with only a breakdown metric, so the ring stays NULL there.
      for (const sec of Object.keys(out)) {
        if (typeof out[sec].oee !== "number") delete out[sec];
      }
      // Sections with no overall OEE_o row (Stock / TBM, and Mixing at MONTH)
      // are simply absent from `out` → the frontend renders NULL for them.
      // e.g. { Mixing: { oee: 18.8, availability: 21, performance: 96, quality: 99 } }
      return out;
    }, CACHE_TTL.KPI_ROWS);
    res.json({ data });
  } catch (err) {
    next(err);
  }
}
