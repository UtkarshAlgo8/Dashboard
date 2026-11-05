import { config } from "../config.js";
import { goldSource } from "../queries/gold-source.js";
import { escapeLiteral, isEmptyValue } from "../quality/normalize.js";
import { UpstreamError } from "../utils/upstream.js";
import { namesForCompliance } from "./registry.js";

const empty = (column) =>
  `(${column} IS NULL OR LOWER(TRIM(${column})) IN ('', 'null', 'nan'))`;

/** Exact stored period. Never filter department/category or aggregate rates. */
export function complianceQuery({ ids, date, granularity, level, section }) {
  const key = date.replaceAll("-", "");
  const table = ["MONTH", "YEAR"].includes(granularity)
    ? config.upstream.sqlTable
    : goldSource({ plantId: "banmore", fromKey: key, toKey: key, granularity });
  const names = ids.flatMap((id) =>
    Object.values(namesForCompliance(id, level)),
  );
  const dimensions =
    level === "overall"
      ? `${empty("section")} AND ${empty("machine")}`
      : level === "section"
        ? `NOT ${empty("section")} AND ${empty("machine")}`
        : `section = ${escapeLiteral(section)} AND NOT ${empty("machine")}`;
  return (
    `SELECT kpi_name, section, machine, actual_value FROM ${table} ` +
    `WHERE plant = 'BTP' AND kpi_name IN (${names.map(escapeLiteral).join(", ")}) ` +
    `AND granularity = ${escapeLiteral(granularity)} AND date = DATE ${escapeLiteral(date)} ` +
    `AND ${dimensions} ORDER BY section, machine, kpi_name`
  );
}

function numeric(value) {
  if (isEmptyValue(value)) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Pivot one Gold row per metric/dimension without summing or averaging. */
export function toCompliance(rows, { ids, level }) {
  if (rows.length >= 5000) {
    throw new UpstreamError(
      "Compliance result may be truncated; narrow the selection.",
      {
        type: "COMPLIANCE_TRUNCATED",
        status: 502,
      },
    );
  }
  const result = {};
  for (const id of ids) {
    const names = namesForCompliance(id, level);
    const byName = new Map(
      Object.entries(names).map(([key, name]) => [name, key]),
    );
    const groups = new Map();
    for (const row of rows) {
      const metric = byName.get(row.kpi_name);
      if (!metric) continue;
      const section = isEmptyValue(row.section) ? null : String(row.section);
      const machine = isEmptyValue(row.machine) ? null : String(row.machine);
      const groupKey = JSON.stringify([section, machine]);
      if (!groups.has(groupKey))
        groups.set(groupKey, { section, machine, metrics: new Map() });
      const group = groups.get(groupKey);
      const value = numeric(row.actual_value);
      if (group.metrics.has(metric) && group.metrics.get(metric) !== value) {
        throw new UpstreamError(
          `Conflicting published values for ${row.kpi_name} (${section ?? "BTP"}/${machine ?? "overall"}).`,
          {
            type: "COMPLIANCE_DATA_CONFLICT",
            status: 502,
          },
        );
      }
      group.metrics.set(metric, value);
    }
    const converted = [...groups.values()]
      .map((group) => ({
        section: group.section,
        machine: group.machine,
        value: group.metrics.get("value") ?? null,
        counts: Object.fromEntries(
          Object.keys(names)
            .filter((key) => key !== "value")
            .map((key) => [key, group.metrics.get(key) ?? null]),
        ),
      }))
      .sort(
        (a, b) =>
          String(a.section ?? "").localeCompare(String(b.section ?? "")) ||
          String(a.machine ?? "").localeCompare(String(b.machine ?? "")),
      );
    result[id] = {
      value: level === "overall" ? (converted[0]?.value ?? null) : null,
      counts: level === "overall" ? (converted[0]?.counts ?? {}) : {},
      rows: converted,
    };
  }
  return result;
}
