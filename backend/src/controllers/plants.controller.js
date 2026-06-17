import { cached, buildCacheKey } from "../utils/cache.js";
import { runQuery } from "../utils/upstream.js";
import { escapeLiteral } from "../queries/queries.js";
import { DATE_YYYYMMDD } from "../queries/dashboard-query.js";
import { config } from "../config.js";

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
      const sql = `
        SELECT kpi_name, actual_value, year, month, day
        FROM (
          SELECT kpi_name, actual_value, year, month, day,
                 ROW_NUMBER() OVER (
                   PARTITION BY kpi_name
                   ORDER BY year DESC, CAST(month AS INTEGER) DESC, day DESC
                 ) AS rn
          FROM ${config.upstream.sqlTable}
          WHERE plant = ${escapeLiteral("Banmore")}
            AND department = ${escapeLiteral("Production")}
            AND machine = ${escapeLiteral("nan")}
            AND kpi_name IN (
              ${escapeLiteral("OEE")},
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
        const yyyy = row.year;
        const mm = String(row.month).padStart(2, "0");
        const dd = String(row.day).padStart(2, "0");
        return { value: row.actual_value, date: `${dd}-${mm}-${yyyy}` };
      };
      return { oee: pick("OEE"), ftq: pick("FTQ"), scrap: pick("Scrap") };
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
        WHERE plant = ${escapeLiteral("Banmore")}
          AND department = ${escapeLiteral("Production")}
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
const SECTION_OEE_GRANULARITIES = new Set([
  "Daily",
  "Shift A",
  "Shift B",
  "Shift C",
  "MTD",
  "YTD",
]);

// Preferred sub-section order so a section with no section-level row
// (e.g. Stock) uses its FIRST sub-section's value, not an average.
const PREFERRED_SUB = {
  Stock: ["4 Roll", "Extruder", "3 Roll", "Cutter", "Slitter"],
  Curing: ["Tredge 1", "Tredge 2", "Tredge 3", "Tredge 4", "Tredge 5", "Tredge 6"],
};

export async function getSectionOee(req, res, next) {
  if (notPhase1Plant(req, res, "Unknown plant.")) return;
  const requested =
    typeof req.query.granularity === "string" ? req.query.granularity : "";
  const gran = SECTION_OEE_GRANULARITIES.has(requested) ? requested : "MTD";
  const key = buildCacheKey(`/plants/${req.params.plantId}/section-oee`, { gran });
  try {
    const data = await cached(key, async () => {
      const sql = `
        SELECT section, sub_section, actual_value
        FROM (
          SELECT section, sub_section, actual_value,
                 ROW_NUMBER() OVER (
                   PARTITION BY section, sub_section
                   ORDER BY ${DATE_YYYYMMDD} DESC
                 ) AS rn
          FROM ${config.upstream.sqlTable}
          WHERE plant = ${escapeLiteral("Banmore")}
            AND department = ${escapeLiteral("Production")}
            AND kpi_name = ${escapeLiteral("OEE_o")}
            AND machine IS NULL
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
        (bySection[sec] ??= []).push({ sub: r.sub_section, val });
      }

      const out = {};
      for (const [sec, list] of Object.entries(bySection)) {
        const sectionLevel = list.find(
          (x) => x.sub == null || x.sub === "" || x.sub === "nan",
        );
        let v;
        if (sectionLevel) {
          v = sectionLevel.val;
        } else {
          const order = PREFERRED_SUB[sec] ?? [];
          const first =
            order.map((s) => list.find((x) => x.sub === s)).find(Boolean) ??
            list[0];
          v = first.val;
        }
        out[sec] = Math.round(v * 10) / 10;
      }
      return out; // { Mixing: 83.9, Stock: <4 Roll>, TBM: ..., Curing: ... }
    });
    res.json({ data });
  } catch (err) {
    next(err);
  }
}
