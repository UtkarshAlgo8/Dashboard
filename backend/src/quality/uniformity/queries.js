/** Athena translations of the preserved v1.2 guide/SQL. No network calls. */
import { escapeLiteral as lit, DATE_YYYYMMDD } from "../normalize.js";
import { qualitySourceForRange } from "../queries/gold-source.js";
import { UNIFORMITY_CARDS, uniformityScope } from "./contract.js";

// Revalidation keeps exported builders safe even when called outside a route.
function checked(scope) {
  const raw = Object.fromEntries(
    Object.entries(scope)
      .filter(([, v]) => v != null)
      .map(([k, v]) => [k, String(v)]),
  );
  if (scope.kind !== "gold") delete raw.level;
  return uniformityScope(raw, scope.kind);
}
function nonEmpty(column) {
  return `${column} IS NOT NULL AND LOWER(TRIM(${column})) NOT IN ('', 'null', 'nan')`;
}
function goldSql(s) {
  const c = UNIFORMITY_CARDS[s.card];
  const param = s.level === "parameter";
  const y = param ? c.qty : s.level === "machine" ? c.machineYield : c.skuYield;
  const n = s.level === "machine" ? c.machineTested : c.skuTested;
  const p = param ? c.pct : null;
  const dims =
    s.level === "machine" ? "machine" : param ? "remarks" : "itemcode";
  const names = [y, n, ...(p ? [p] : [])];
  const dateTo = s.period === "range" ? s.to : s.from;
  const source = qualitySourceForRange(s.from, dateTo, s.granularity);
  const filters = [
    "plant = 'BANMORE'",
    "department = 'Quality'",
    "category = 'Uniformity Testing'",
    `kpi_name IN (${names.map(lit).join(", ")})`,
    `granularity = ${lit(s.granularity)}`,
    `${DATE_YYYYMMDD} BETWEEN ${lit(s.from.replaceAll("-", ""))} AND ${lit(dateTo.replaceAll("-", ""))}`,
    nonEmpty("machine"),
  ];
  if (s.machine) filters.push(`UPPER(machine) = UPPER(${lit(s.machine)})`);
  if (s.sku) filters.push(`UPPER(itemcode) = UPPER(${lit(s.sku)})`);
  const g = `g AS (SELECT date, ${dims}, kpi_name, actual_value FROM ${source} WHERE ${filters.join(" AND ")})`;
  const pivot = (name, alias) =>
    `MAX(CASE WHEN kpi_name = ${lit(name)} THEN actual_value END) AS ${alias}, SUM(CASE WHEN kpi_name = ${lit(name)} THEN 1 ELSE 0 END) AS ${alias}c`;
  const daily = `d AS (SELECT date, ${dims}, ${pivot(y, "y")}, ${pivot(param ? p : n, "n")} FROM g WHERE ${nonEmpty(dims)} ${param ? `AND remarks IN (${c.parameters.map(lit).join(", ")})` : ""} GROUP BY date, ${dims})`;
  let extra = "";
  let values;
  if (param) {
    // Denominator includes ALL tested DAY rows in the selected SKU/range,
    // including days on which this particular parameter has no failure row.
    extra = `, den_day AS (SELECT date, MAX(actual_value) AS tested, COUNT(*) AS copies FROM g WHERE kpi_name = ${lit(n)} GROUP BY date), den AS (SELECT CASE WHEN MAX(copies) = 1 AND COUNT(tested) = COUNT(*) THEN SUM(tested) END AS tested, MAX(copies) AS copies FROM den_day)`;
    const failed = "CASE WHEN COUNT(y) = SUM(yc) THEN SUM(y) END";
    values = `${failed} AS failed_tyres, ${s.period === "range" ? `CASE WHEN MAX(CASE WHEN den_day.tested IS NULL THEN 1 ELSE 0 END) = 0 THEN ${failed} * 100.0 / NULLIF(MAX(den.tested), 0) END` : "MAX(n)"} AS failed_pct, MAX(CASE WHEN yc > 1 OR nc > 1 OR den.copies > 1 THEN 1 ELSE 0 END) AS _duplicates`;
  } else {
    const tested =
      "CASE WHEN MAX(CASE WHEN nc <> 1 OR n IS NULL THEN 1 ELSE 0 END) = 0 THEN SUM(n) END";
    const weighted =
      "CASE WHEN MAX(CASE WHEN yc <> 1 OR nc <> 1 OR y IS NULL OR n IS NULL THEN 1 ELSE 0 END) = 0 THEN SUM(y * n) / NULLIF(SUM(n), 0) END";
    values = `${s.period === "range" ? weighted : "MAX(y)"} AS yield_pct, ${tested} AS tyres_tested, MAX(CASE WHEN yc > 1 OR nc > 1 THEN 1 ELSE 0 END) AS _duplicates`;
  }
  const label = param ? "parameter" : s.level === "machine" ? "machine" : "sku";
  return `WITH ${g}, ${daily}${extra}, result AS (SELECT ${dims} AS ${label}, ${values} FROM d ${param ? "LEFT JOIN den_day ON d.date = den_day.date CROSS JOIN den" : ""} GROUP BY ${dims} HAVING SUM(yc) > 0) SELECT result.*, COUNT(*) OVER () AS _total FROM result ORDER BY ${param ? "failed_tyres DESC" : "yield_pct ASC NULLS LAST"}, ${label} ASC OFFSET ${s.offset} LIMIT ${s.limit + 1}`;
}

/** Preserve displayed source clock fields; NEVER cast a zoned timestamp directly. */
export function recordedClock(column) {
  return `CAST(format_datetime(${column}, 'yyyy-MM-dd HH:mm:ss.SSS') AS timestamp)`;
}
const MTMS = {
  "RFV CW": ["rfv_cw", "grade_rfv_cw"],
  "H1 RFV CW": ["h1_rfv_cw", "grade_h1_rfv_cw"],
  "LFV CW": ["lfv_cw", "grade_lfv_cw"],
  "RFV CCW": ["rfv_ccw", "grade_rfv_ccw"],
  "H1 RFV CCW": ["h1_rfv_ccw", "grade_h1_rfv_ccw"],
  "LFV CCW": ["lfv_ccw", "grade_lfv_ccw"],
  Conicity: ["conicity", "grade_conicity"],
};
const ZF = {
  ...MTMS,
  RRO: [null, "grade_rro"],
  "Upper LRO": [null, "grade_upper_lro"],
  "Lower LRO": [null, "grade_lower_lro"],
  "Upper Bulge": [null, "grade_upper_bulge"],
  "Lower Bulge": [null, "grade_lower_bulge"],
  "Upper Depression": [null, "grade_upper_depression"],
  "Lower Depression": [null, "grade_lower_depression"],
};
const BALANCE = {
  "Upper Unbalance": ["upper", "upper_grade"],
  "Lower Unbalance": ["lower", "lower_grade"],
  "Static Unbalance": ["static", "static_grade"],
  "Couple Unbalance": ["couple", "couple_grade"],
};
function silverSql(s) {
  const c = UNIFORMITY_CARDS[s.card];
  const zf = s.card.startsWith("zf-");
  const [reading, grade] = (
    s.card === "mtms" ? MTMS : s.card === "zf-uniformity" ? ZF : BALANCE
  )[s.parameter];
  const item = zf ? "tire_type" : "item_code";
  const machine =
    s.card === "dbm"
      ? "CASE WHEN wc_id = 278 THEN 'Micropoise' WHEN wc_id = 279 THEN '30-0224' WHEN wc_id = 280 THEN '30-0297' ELSE CAST(wc_id AS VARCHAR) END"
      : "machine_name";
  const value = zf ? "CAST(NULL AS DOUBLE)" : `CAST(b."${reading}" AS DOUBLE)`;
  const gradeExpr = `CAST(b."${grade}" AS VARCHAR)`;
  const oe = s.card === "dbm" ? "'0', '1'" : "'A', 'B'";
  const columns = [
    ...new Set([
      "barcode",
      "record_id",
      item,
      s.card === "dbm" ? "wc_id" : "machine_name",
      ...(zf ? [] : [reading]),
      grade,
    ]),
  ]
    .map((column) => `"${column}"`)
    .join(", ");
  // Lower bound alone BEFORE ranking is intentional. Retests AFTER the window
  // must remove the barcode, as in the authoritative SQL. Machine/SKU/shift
  // and the end boundary MUST NOT be pushed into the ranked input.
  return `WITH rm AS (
    SELECT tyre_size, MIN(description) AS sku FROM silver.dim_recipemaster
    WHERE plant_code = 'BTP' GROUP BY tyre_size
  ), source AS (
    SELECT ${columns}, ${recordedClock("event_time")} AS test_clock FROM ${c.table}
    WHERE plant_code = 'BTP'
  ), t AS (
    SELECT ${columns}, test_clock, ROW_NUMBER() OVER (PARTITION BY barcode ORDER BY test_clock DESC, record_id DESC NULLS LAST) AS rn
    FROM source WHERE test_clock >= TIMESTAMP ${lit(s.from + " 07:00:00")}
  ), d AS (
    SELECT b.barcode, b.test_clock AS test_time,
      CAST(b.test_clock - INTERVAL '7' HOUR AS DATE) AS production_date,
      CASE WHEN HOUR(b.test_clock) BETWEEN 7 AND 14 THEN 'A' WHEN HOUR(b.test_clock) BETWEEN 15 AND 22 THEN 'B' ELSE 'C' END AS shift,
      ${machine} AS machine, COALESCE(rm.sku, b.${item}) AS sku,
      ${lit(s.parameter)} AS parameter, ${value} AS actual_value, ${gradeExpr} AS grade,
      CASE WHEN ${gradeExpr} IN (${oe}) THEN 0 ELSE 1 END AS is_off_spec
    FROM t b LEFT JOIN rm ON rm.tyre_size = b.${item}
    WHERE b.rn = 1 AND b.test_clock < CAST(DATE ${lit(s.to)} + INTERVAL '1' DAY AS timestamp) + INTERVAL '7' HOUR
  ), result AS (
    SELECT * FROM d WHERE UPPER(machine) = UPPER(${lit(s.machine)}) AND UPPER(sku) = UPPER(${lit(s.sku)})
      ${s.shift === "ALL" ? "" : `AND shift = ${lit(s.shift)}`}
      AND ${s.kind === "barcodes" ? "is_off_spec = 1" : "actual_value IS NOT NULL"}
  ) SELECT result.*, COUNT(*) OVER () AS _total FROM result
    ORDER BY test_time ${s.kind === "points" ? "ASC" : "DESC"}, barcode ASC NULLS LAST OFFSET ${s.offset} LIMIT ${s.limit + 1}`;
}
/** One bounded query per selected level/page; all KPI arithmetic is in Athena. */
export function uniformityQuery(scope) {
  const s = checked(scope);
  return s.kind === "gold" ? goldSql(s) : silverSql(s);
}
