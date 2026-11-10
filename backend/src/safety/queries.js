import { goldSource } from "../queries/gold-source.js";
import { escapeLiteral } from "../quality/normalize.js";
import { UpstreamError } from "../utils/upstream.js";

export const SAFETY_NAMES = Object.freeze({
  overall: "Safety_Observation_Qty_overall",
  types: "Safety_Observation_Qty_type",
  reports: "Safety_Observation_Qty_detail",
});

const fail = (message) => {
  throw new UpstreamError(message, {
    type: "SAFETY_SOURCE_INVALID",
    status: 502,
  });
};

/** One scope and one Gold source for totals, quality checks, and SQL-paged rows. */
export function safetyQuery(input) {
  const { date, from, to, granularity, level, type, offset, limit } = input;
  const table = goldSource({
    plantId: "banmore",
    fromKey: (from ?? date).replaceAll("-", ""),
    toKey: (to ?? date).replaceAll("-", ""),
    granularity,
  });
  const period = from
    ? `date BETWEEN DATE ${escapeLiteral(from)} AND DATE ${escapeLiteral(to)}`
    : `date = DATE ${escapeLiteral(date)}`;
  const selected =
    type == null ? "FALSE" : `product_type = ${escapeLiteral(type)}`;
  const page =
    level === "types"
      ? `SELECT product_type AS type, total AS value, ROW_NUMBER() OVER (ORDER BY total DESC, product_type ASC) AS position FROM types`
      : level === "reports"
        ? `SELECT CAST(date AS VARCHAR) AS date, section, machine, status, remarks, CAST(record_id AS VARCHAR) AS record_id, ROW_NUMBER() OVER (ORDER BY date DESC, record_id DESC, section ASC NULLS FIRST, machine ASC NULLS FIRST, status ASC NULLS FIRST, remarks ASC NULLS FIRST) AS position FROM scoped WHERE kpi_name = '${SAFETY_NAMES.reports}' AND ${selected}`
        : `SELECT 1 AS position WHERE FALSE`;
  const pageFields =
    level === "types"
      ? "p.type, p.value"
      : level === "reports"
        ? "p.date, p.section, p.machine, p.status, p.remarks, p.record_id"
        : "p.position AS unused";
  return `WITH scoped AS (
    SELECT kpi_name, product_type, actual_value, unit_of_measurement, date, record_id${level === "reports" ? ", section, machine, status, remarks" : ""}
    FROM ${table}
    WHERE LOWER(TRIM(plant)) = 'banmore'
      AND kpi_name IN (${Object.values(SAFETY_NAMES).map(escapeLiteral).join(", ")})
      AND granularity = ${escapeLiteral(granularity)} AND ${period}
  ), totals AS (
    SELECT kpi_name, SUM(actual_value) AS total FROM scoped GROUP BY kpi_name
  ), types AS (
    SELECT product_type, SUM(actual_value) AS total FROM scoped
    WHERE kpi_name = '${SAFETY_NAMES.types}' GROUP BY product_type
  ), duplicate_reports AS (
    SELECT record_id FROM scoped WHERE kpi_name = '${SAFETY_NAMES.reports}'
    GROUP BY record_id HAVING SUM(actual_value) <> 1
  ), meta AS (
    SELECT
      (SELECT MAX(total) FROM totals WHERE kpi_name = '${SAFETY_NAMES.overall}') AS overall_total,
      (SELECT MAX(total) FROM totals WHERE kpi_name = '${SAFETY_NAMES.types}') AS types_total,
      (SELECT MAX(total) FROM totals WHERE kpi_name = '${SAFETY_NAMES.reports}') AS reports_total,
      (SELECT SUM(1) FROM types) AS type_rows,
      (SELECT SUM(actual_value) FROM scoped WHERE kpi_name = '${SAFETY_NAMES.types}' AND ${selected}) AS selected_type_total,
      (SELECT SUM(actual_value) FROM scoped WHERE kpi_name = '${SAFETY_NAMES.reports}' AND ${selected}) AS selected_reports_total,
      (SELECT SUM(CASE WHEN actual_value IS NULL OR actual_value < 0 OR actual_value <> FLOOR(actual_value)
        OR unit_of_measurement IS NULL OR unit_of_measurement <> 'NOS'
        OR (kpi_name IN ('${SAFETY_NAMES.types}', '${SAFETY_NAMES.reports}') AND (product_type IS NULL OR TRIM(product_type) = ''))
        OR (kpi_name = '${SAFETY_NAMES.reports}' AND (actual_value <> 1 OR record_id IS NULL)) THEN 1 ELSE 0 END) FROM scoped) AS invalid_rows,
      (SELECT SUM(1) FROM duplicate_reports) AS duplicate_ids
  ), ranked AS (${page})
  SELECT m.*, p.position, ${pageFields} FROM meta m LEFT JOIN ranked p
    ON p.position > ${offset} AND p.position <= ${offset + limit}
  ORDER BY p.position LIMIT ${limit + 1}`;
}

function number(row, key, nullable = true) {
  if (!row || typeof row !== "object" || Array.isArray(row))
    fail("Safety response row shape is invalid.");
  if (!Object.hasOwn(row, key)) fail(`Safety response is missing ${key}.`);
  const value = row[key];
  // Athena's upstream transport encodes SQL NULL as exactly "". Preserve
  // missing aggregates as null, never Number("") === 0. Whitespace stays invalid.
  if ((value === null || value === "") && nullable) return null;
  if (
    (typeof value === "string" && value.trim() === "") ||
    value === null ||
    !["number", "string"].includes(typeof value)
  )
    fail(`Invalid Safety ${key}.`);
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < 0) fail(`Invalid Safety ${key}.`);
  return n;
}

/** Validate database-side sums and page metadata; never count raw rows as KPI totals. */
export function safetyResult(rows, input) {
  if (!Array.isArray(rows) || !rows.length)
    fail("Safety aggregate metadata is missing.");
  if (rows.length > input.limit)
    fail("Safety response may be truncated or oversized.");
  const first = rows[0];
  const keys = [
    "overall_total",
    "types_total",
    "reports_total",
    "type_rows",
    "selected_type_total",
    "selected_reports_total",
    "invalid_rows",
    "duplicate_ids",
  ];
  const meta = Object.fromEntries(keys.map((key) => [key, number(first, key)]));
  if (meta.invalid_rows || meta.duplicate_ids)
    fail(
      "Safety source has invalid values, missing dimensions, or duplicate report identities.",
    );
  // SQL's empty SUM is null, not a fabricated zero. An explicit published zero
  // can legitimately have no child/report rows; preserve both values in totals.
  const sameSum = (a, b) =>
    a === b || ((a === null || a === 0) && (b === null || b === 0));
  if (
    !sameSum(meta.overall_total, meta.types_total) ||
    !sameSum(meta.overall_total, meta.reports_total)
  )
    fail(
      "Safety overall, type and report SUM totals do not match for this scope.",
    );
  if (!sameSum(meta.selected_type_total, meta.selected_reports_total))
    fail(
      "Safety selected type and report SUM totals do not match for this scope.",
    );
  const total =
    input.level === "types"
      ? (meta.type_rows ?? 0)
      : input.level === "reports"
        ? (meta.selected_reports_total ?? 0)
        : 0;
  if (
    input.level === "reports" &&
    meta.selected_type_total === null &&
    meta.overall_total > 0
  )
    fail("The selected Safety type is not published for this scope.");
  if (meta.overall_total !== null && meta.invalid_rows === null)
    fail("Safety source quality metadata is missing.");
  if (
    meta.type_rows === 0 ||
    (meta.types_total !== null && meta.type_rows === null)
  )
    fail("Safety type page metadata is missing or invalid.");
  if (
    meta.overall_total === null &&
    meta.types_total === null &&
    meta.reports_total === null &&
    meta.type_rows !== null
  )
    fail("Safety empty scope has inconsistent type metadata.");
  if (total > 100000)
    fail(
      "Safety scope exceeds the 100000-row paging bound; narrow the date selection.",
    );
  const expected =
    input.level === "overall"
      ? 0
      : Math.min(input.limit, Math.max(0, total - input.offset));
  const page = [];
  for (const row of rows) {
    for (const key of keys) {
      if (number(row, key) !== meta[key])
        fail("Ambiguous Safety aggregate metadata.");
    }
    if (!Object.hasOwn(row, "position"))
      fail("Safety page position is missing.");
    if (row.position === null || row.position === "") {
      if (rows.length !== 1 || expected !== 0)
        fail("Safety page is missing or truncated.");
      continue;
    }
    if (number(row, "position", false) !== input.offset + page.length + 1)
      fail("Safety page ordering is missing or ambiguous.");
    if (input.level === "types") {
      if (
        typeof row.type !== "string" ||
        !row.type.trim() ||
        row.type.length > 512
      )
        fail(
          "Safety type is missing or exceeds the supported 512-character bound.",
        );
      page.push({ type: row.type, value: number(row, "value", false) });
    } else if (input.level === "reports") {
      if (typeof row.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(row.date))
        fail("Safety report date is invalid.");
      if (
        input.date
          ? row.date !== input.date
          : row.date < input.from || row.date > input.to
      )
        fail("Safety report date does not match the selected scope.");
      const item = {
        date: row.date,
        shift: input.granularity.startsWith("SHIFT ")
          ? input.granularity.slice(-1)
          : null,
      };
      for (const key of [
        "section",
        "machine",
        "status",
        "remarks",
        "record_id",
      ]) {
        if (
          !Object.hasOwn(row, key) ||
          (row[key] !== null && typeof row[key] !== "string")
        )
          fail(`Safety report ${key} is missing or invalid.`);
        item[key] = row[key];
      }
      if (!item.record_id) fail("Safety report identity is missing.");
      page.push(item);
    } else fail("Unexpected Safety summary page rows.");
  }
  if (page.length !== expected) fail("Safety page is missing or truncated.");
  return {
    context: { plant: "Banmore", ...input },
    value: meta.overall_total,
    totals: {
      overall: meta.overall_total,
      types: meta.types_total,
      reports: meta.reports_total,
      selectedType: meta.selected_type_total,
    },
    rows: page,
    page: {
      offset: input.offset,
      limit: input.limit,
      total,
      hasMore: input.offset + page.length < total,
    },
  };
}
