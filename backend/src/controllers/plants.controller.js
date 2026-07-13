import { cached, buildCacheKey } from "../utils/cache.js";
import { runQuery } from "../utils/upstream.js";
import { escapeLiteral } from "../queries/queries.js";
import { DATE_YYYYMMDD } from "../queries/dashboard-query.js";
import {
  plantDepartmentPredicate,
  excludeUnknownKpiPredicate,
  normalizeGranularity,
  DEFAULT_GRANULARITY,
  emptyColumnPredicate,
  isEmptyValue,
} from "../utils/normalize.js";
import { config } from "../config.js";

// Always-on core filter (realdata.md §1/§2/§9).
const CORE_FILTER =
  `${plantDepartmentPredicate()} AND ${excludeUnknownKpiPredicate()}`;

/**
 * Plant-scoped controllers: one plant, summary, as-of date, per-section OEE.
 */

export const PHASE_1_PLANT = "banmore";

// Returns true (and sends a 404) when the plant isn't the Phase-1 plant.
function notPhase1Plant(req, res, message) {
  if (req.params.plantId === PHASE_1_PLANT) return false;
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
  res.json({
    data: { id: "banmore", name: "Banmore Plant", tyreType: "PCR" },
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
          FROM ${config.upstream.sqlTable}
          WHERE ${CORE_FILTER}
            AND (machine IS NULL OR machine = 'nan')
            AND kpi_name IN (
              ${escapeLiteral("OEE_o")},
              ${escapeLiteral("FTQ")},
              ${escapeLiteral("Scrap")}
            )
        ) ranked
        WHERE rn = 1
      `.trim();
      const rows = await runQuery(sql);
      const pick = (name) => {
        const row = rows.find((r) => r.kpi_name === name);
        if (!row) return null;
        // d is "YYYYMMDD" → DD-MM-YYYY for the card.
        const s = row.d == null ? "" : String(row.d);
        const date = /^\d{8}$/.test(s)
          ? `${s.slice(6, 8)}-${s.slice(4, 6)}-${s.slice(0, 4)}`
          : null;
        return { value: row.actual_value, date };
      };
      return { oee: pick("OEE_o"), ftq: pick("FTQ"), scrap: pick("Scrap") };
    });
    res.json({ data });
  } catch (err) {
    next(err);
  }
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
      const sql = `
        SELECT MAX(${DATE_YYYYMMDD}) AS d
        FROM ${config.upstream.sqlTable}
        WHERE ${CORE_FILTER}
      `.trim();
      const rows = await runQuery(sql);
      const raw = rows?.[0] ? Object.values(rows[0])[0] : null;
      // raw is "YYYYMMDD" → ISO yyyy-mm-dd.
      const s = raw == null ? "" : String(raw);
      const asOf = /^\d{8}$/.test(s)
        ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`
        : null;
      return { asOf };
    });
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

/**
 * Per-section OEE — latest OVERALL OEE_o per section, for the left section
 * column (changes.md §2). Section-level rows have machine / product_type /
 * sub_section empty. Sections with no overall OEE_o for the requested
 * granularity (Stock, TBM, and Mixing at MONTH) are omitted → the frontend
 * shows NULL. Honours an optional ?granularity, defaulting to MONTH.
 */
export async function getSectionOee(req, res, next) {
  if (notPhase1Plant(req, res, "Unknown plant.")) return;
  // realdata.md §3: the OEE/section default granularity now falls back to
  // MONTH (was MTD). Inbound values are normalized through the synonym map.
  const gran =
    normalizeGranularity(req.query.granularity) ?? DEFAULT_GRANULARITY;
  const key = buildCacheKey(`/plants/${req.params.plantId}/section-oee`, { gran });
  try {
    const data = await cached(key, async () => {
      // changes.md §2: the left section column shows each section's OVERALL
      // OEE_o only. OEE is product-agnostic (never pin product_type) and
      // section-level (sub_section empty). Where OEE_o is absent for the
      // section/granularity — Stock (no OEE_o), TBM (none), Mixing-Month
      // (no MONTH row) — the section shows NULL. We DO NOT fabricate a value
      // from OEE_s; that number is a subsection metric, not the section OEE.
      const sql = `
        SELECT section, sub_section, actual_value
        FROM (
          SELECT section, sub_section, actual_value,
                 ROW_NUMBER() OVER (
                   PARTITION BY section
                   ORDER BY ${DATE_YYYYMMDD} DESC
                 ) AS rn
          FROM ${config.upstream.sqlTable}
          WHERE ${CORE_FILTER}
            AND kpi_name = ${escapeLiteral("OEE_o")}
            AND ${emptyColumnPredicate("machine")}
            AND ${emptyColumnPredicate("product_type")}
            AND ${emptyColumnPredicate("sub_section")}
            AND granularity = ${escapeLiteral(gran)}
        ) ranked
        WHERE rn = 1
      `.trim();
      const rows = await runQuery(sql);

      const out = {};
      for (const r of rows) {
        const sec = r.section;
        if (isEmptyValue(sec)) continue;
        const val = Number(r.actual_value);
        if (!Number.isFinite(val)) continue;
        out[sec] = Math.round(val * 10) / 10;
      }
      // Sections with no overall OEE_o row (Stock / TBM, and Mixing at MONTH)
      // are simply absent from `out` → the frontend renders NULL for them.
      return out; // e.g. { Mixing: 18.8, Curing: 31.7 } (Stock/TBM null)
    });
    res.json({ data });
  } catch (err) {
    next(err);
  }
}
