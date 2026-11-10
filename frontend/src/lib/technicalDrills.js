/**
 * Row shaping for the Technical dashboard drills.
 *
 * The drill layout follows the Technical prototype (docs/plant_operations_
 * dashboard__33_ (1).html → TechStockDrill): summary tiles, "View by" chips
 * and one grouped table. The rows are the same gold rows the Production
 * dashboard reads (useDashboardFetch rawRows / downtimeRows), so both pages
 * agree on every total.
 */

function numericValue(row) {
  const v = row?.actual_value;
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function isBlank(v) {
  return (
    v == null ||
    ["", "nan", "null", "none"].includes(String(v).trim().toLowerCase())
  );
}

/**
 * Rows with `actual_value` as a number (Athena returns every column as a
 * string) — for rows fetched outside useDashboardFetch, which coerces its own.
 *
 * @param {object[] | null} rows
 * @returns {object[]}
 */
export function withNumericValues(rows) {
  if (!Array.isArray(rows)) return [];
  return rows.map((r) => {
    const n =
      typeof r?.actual_value === "number"
        ? r.actual_value
        : Number.parseFloat(r?.actual_value);
    return { ...r, actual_value: Number.isFinite(n) ? n : null };
  });
}

// Columns that identify one gold row (the backend's de-duplication key plus
// the value), so a copy of the same row is recognised.
const ROW_IDENTITY = [
  "date",
  "granularity",
  "kpi_name",
  "section",
  "sub_section",
  "tyre_type",
  "machine",
  "product_type",
  "itemcode",
  "unit_of_measurement",
  "status",
  "remarks",
  "actual_value",
];

/**
 * Rows of one kpi_name in one section that carry a numeric value, each row
 * once. The backend already drops duplicate gold rows, so an exact copy here
 * only means the same row arrived from two fetches (the card's and its
 * drill's — Stock Production_m is in both) and must not be summed twice.
 *
 * @param {object[] | null} rows
 * @param {string} kpiName
 * @param {string} sectionName gold section ("Curing")
 * @returns {object[]}
 */
export function rowsOf(rows, kpiName, sectionName) {
  if (!Array.isArray(rows)) return [];
  const seen = new Set();
  return rows.filter((r) => {
    if (
      r?.kpi_name !== kpiName ||
      r.section !== sectionName ||
      numericValue(r) == null
    ) {
      return false;
    }
    const key = ROW_IDENTITY.map((col) => String(r[col] ?? "")).join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** @returns {number} */
export function totalOf(rows) {
  return rows.reduce((sum, r) => sum + (numericValue(r) ?? 0), 0);
}

/**
 * Sum values per key, largest first, with share and running (Pareto) share.
 *
 * @param {object[]} rows gold rows, or any items with a `valueOf` accessor
 * @param {(row: object) => string | null | undefined} keyOf
 * @param {(row: object) => number | null} [valueOf] defaults to actual_value
 * @returns {{ key: string, value: number, share: number, cumulative: number }[]}
 */
export function groupTotals(rows, keyOf, valueOf = numericValue) {
  const sums = new Map();
  for (const r of rows) {
    const v = valueOf(r);
    if (v == null) continue;
    const raw = keyOf(r);
    const key = isBlank(raw) ? "Unspecified" : String(raw).trim();
    sums.set(key, (sums.get(key) ?? 0) + v);
  }
  const total = [...sums.values()].reduce((a, b) => a + b, 0);
  let running = 0;
  return [...sums.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([key, value]) => {
      running += value;
      return {
        key,
        value,
        share: total > 0 ? (value / total) * 100 : 0,
        cumulative: total > 0 ? (running / total) * 100 : 0,
      };
    });
}

/**
 * Distinct non-blank values of one column, sorted.
 *
 * @param {object[]} rows
 * @param {string} column
 * @returns {string[]}
 */
export function distinctValues(rows, column) {
  return [
    ...new Set(rows.map((r) => r[column]).filter((v) => !isBlank(v))),
  ].sort((a, b) => String(a).localeCompare(String(b)));
}

/**
 * Split a downtime remark into its category and detail:
 * "Electronic / Control Breakdown - MAIN MOTOR"
 *   → { category: "Electronic / Control Breakdown", detail: "MAIN MOTOR" }.
 *
 * @param {string | null | undefined} remark
 * @returns {{ category: string, detail: string }}
 */
export function parseDowntimeRemark(remark) {
  if (isBlank(remark))
    return { category: "Unspecified", detail: "Unspecified" };
  const text = String(remark).trim();
  const cut = text.indexOf(" - ");
  if (cut < 0) return { category: text, detail: text };
  return {
    category: text.slice(0, cut).trim() || "Unspecified",
    detail: text.slice(cut + 3).trim() || "Unspecified",
  };
}

/**
 * The maintenance discipline of a breakdown category:
 * "Electronic / Control Breakdown" → "Electronic / Control".
 *
 * @param {string} category
 * @returns {string}
 */
export function breakdownDiscipline(category) {
  return category.replace(/\s*breakdown\s*$/i, "").trim() || category;
}

/**
 * One section's events for one downtime reason, newest first.
 *
 * `granularity` is the one the reason rows were fetched at
 * (useDashboardFetch `downtimeGranularity`); `date` pins a single day for
 * the Today / Shift presets, whose reason feed spans a trailing week.
 *
 * @param {object[] | null} downtimeRows
 * @param {{ section: string, reason: string, granularity: string,
 *           date?: string | null }} scope
 * @returns {{ date: string, machine: string, category: string,
 *             detail: string, minutes: number }[]}
 */
export function toDowntimeEvents(
  downtimeRows,
  { section, reason, granularity, date = null },
) {
  return rowsOf(downtimeRows, reason, section)
    .filter((r) => r.granularity === granularity)
    .filter((r) => !date || String(r.date).slice(0, 10) === date)
    .map((r) => ({
      date: String(r.date).slice(0, 10),
      machine: isBlank(r.machine) ? "Unspecified" : String(r.machine),
      ...parseDowntimeRemark(r.remarks),
      minutes: numericValue(r),
    }))
    .sort(
      (a, b) =>
        b.date.localeCompare(a.date) ||
        b.minutes - a.minutes ||
        a.machine.localeCompare(b.machine),
    );
}
