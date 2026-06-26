import { cached, buildCacheKey } from "../utils/cache.js";
import { runQuery } from "../utils/upstream.js";
import { escapeLiteral } from "../queries/queries.js";
import { DATE_YYYYMMDD } from "../queries/dashboard-query.js";
import {
  plantDepartmentPredicate,
  excludeUnknownKpiPredicate,
  normalizeGranularity,
  allowedGranularities,
  DEFAULT_GRANULARITY,
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
 * Per-section OEE — latest OEE_o per section, for the sidebar donut rings.
 * Top-level rows have machine = NULL. A section with a section-level row
 * (sub_section NULL — Mixing / TBM / Curing) uses it directly; a section
 * that only has per-sub_section rows (Stock) falls back to its first
 * sub-section. Honours an optional ?granularity, defaulting to MTD.
 */
const SECTION_OEE_GRANULARITIES = allowedGranularities();

// Preferred sub-section order so a section with no section-level OEE_o row
// (e.g. Stock) uses its FIRST sub-section's value, not an average. Read from
// the real data (realdata.md §16): Stock subsections, Curing production
// trenches (TrenchN, no space; no Trench3). Any value not listed still falls
// back to list[0], so a new subsection name never breaks the ring.
const PREFERRED_SUB = {
  Stock: ["4 Roll", "3 Roll", "Three Roll", "Extruder", "Cutter", "Slitter", "Bead"],
  Curing: ["Trench1", "Trench2", "Trench4", "Trench5", "Trench6", "Trench7", "Trench8"],
};

export async function getSectionOee(req, res, next) {
  if (notPhase1Plant(req, res, "Unknown plant.")) return;
  // realdata.md §3: the OEE/section default granularity now falls back to
  // MONTH (was MTD). Inbound values are normalized through the synonym map.
  const gran =
    normalizeGranularity(req.query.granularity) ?? DEFAULT_GRANULARITY;
  const key = buildCacheKey(`/plants/${req.params.plantId}/section-oee`, { gran });
  try {
    const data = await cached(key, async () => {
      // realdata.md §18.2: OEE level differs by section. Mixing/Curing have
      // overall OEE_o (sub_section NULL); Stock has NO overall — only OEE_s
      // per subsection; TBM has neither. Fetch BOTH OEE_o and OEE_s so the
      // sidebar ring can use the section-level value where it exists and fall
      // back to a subsection's OEE_s otherwise (Stock). machine is NULL on all
      // OEE_o/OEE_s rows.
      const sql = `
        SELECT kpi_name, section, sub_section, actual_value
        FROM (
          SELECT kpi_name, section, sub_section, actual_value,
                 ROW_NUMBER() OVER (
                   PARTITION BY kpi_name, section, sub_section
                   ORDER BY ${DATE_YYYYMMDD} DESC
                 ) AS rn
          FROM ${config.upstream.sqlTable}
          WHERE ${CORE_FILTER}
            AND kpi_name IN (${escapeLiteral("OEE_o")}, ${escapeLiteral("OEE_s")})
            AND (machine IS NULL OR machine = 'nan')
            AND granularity = ${escapeLiteral(gran)}
        ) ranked
        WHERE rn = 1
      `.trim();
      const rows = await runQuery(sql);

      const bySection = {};
      for (const r of rows) {
        const sec = r.section;
        if (!sec || sec === "nan") continue;
        const val = Number(r.actual_value);
        if (!Number.isFinite(val)) continue;
        (bySection[sec] ??= []).push({
          kpi: r.kpi_name,
          sub: r.sub_section,
          val,
        });
      }

      const out = {};
      for (const [sec, list] of Object.entries(bySection)) {
        // Prefer the overall OEE_o section-level row (sub_section NULL).
        const sectionLevel = list.find(
          (x) =>
            x.kpi === "OEE_o" &&
            (x.sub == null || x.sub === "" || x.sub === "nan"),
        );
        let v;
        if (sectionLevel) {
          v = sectionLevel.val;
        } else {
          // No overall (Stock) — use the first preferred subsection's OEE_s.
          const order = PREFERRED_SUB[sec] ?? [];
          const first =
            order.map((s) => list.find((x) => x.sub === s)).find(Boolean) ??
            list[0];
          v = first?.val;
        }
        if (v != null && Number.isFinite(v)) out[sec] = Math.round(v * 10) / 10;
      }
      return out; // { Mixing: 18.8, Curing: 31.7, Stock: <3 Roll>, TBM: (absent) }
    });
    res.json({ data });
  } catch (err) {
    next(err);
  }
}
