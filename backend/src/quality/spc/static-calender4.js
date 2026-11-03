import { readFileSync } from "node:fs";
import { headlineStatus, STATUS_SEVERITY } from "./engine.js";

export const calender4Fixture = JSON.parse(
  readFileSync(
    new URL("../../../data/spc/calender4.json", import.meta.url),
    "utf8",
  ),
);
const METRICS = ["Cp", "Cpk", "Pp", "Ppk"];

// Fail loudly for a malformed deployment artifact rather than displaying partial KPIs.
if (
  calender4Fixture.schema_version !== 1 ||
  calender4Fixture.combinations.length !== 8
) {
  throw new Error("Invalid Calender 4 SPC fixture schema");
}
for (const c of calender4Fixture.combinations) {
  if (
    c.plant !== "BANMORE" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(c.snapshot_date) ||
    !METRICS.every(
      (m) =>
        Number.isFinite(c.metrics[m]?.value) &&
        STATUS_SEVERITY.includes(c.metrics[m]?.status),
    ) ||
    !Number.isFinite(c.spec.lsl) ||
    !Number.isFinite(c.spec.usl) ||
    c.spec.lsl >= c.spec.usl ||
    !c.readings.length ||
    !c.readings.every(
      (r, i) =>
        Number.isFinite(r.actual_value) &&
        Number.isFinite(r.setpoint) &&
        Number.isInteger(r.segment) &&
        typeof r.event_time === "string" &&
        (i === 0 || r.event_time >= c.readings[i - 1].event_time),
    )
  ) {
    throw new Error(
      `Invalid Calender 4 SPC combination: ${c.recipe}/${c.parameter}`,
    );
  }
}

export const normalizedMachine = (value) =>
  String(value ?? "")
    .trim()
    .toUpperCase();
export const spcIdentity = (c) =>
  JSON.stringify([
    normalizedMachine(c.plant || "BANMORE") === "BTP"
      ? "BANMORE"
      : normalizedMachine(c.plant || "BANMORE"),
    normalizedMachine(c.machine),
    String(c.recipe ?? c.itemcode ?? "").trim(),
    String(c.parameter).trim(),
  ]);

export function eligibleCalender4(query = {}, enabled = true) {
  if (
    !enabled ||
    !["BANMORE", "BTP"].includes(normalizedMachine(query.plant || "BANMORE"))
  )
    return [];
  return calender4Fixture.combinations.filter((c) => {
    if (
      query.machine &&
      query.machine !== "All" &&
      normalizedMachine(query.machine) !== c.machine
    )
      return false;
    if (query.recipe && query.recipe !== "All" && query.recipe !== c.recipe)
      return false;
    if (query.parameter && query.parameter !== c.parameter) return false;
    if (query.from && query.to)
      return query.from <= c.snapshot_date && c.snapshot_date <= query.to;
    return !query.date || query.date === c.snapshot_date;
  });
}

export function calender4Provenance(combo) {
  return {
    kind: "static_excel",
    version: calender4Fixture.version,
    file: calender4Fixture.source_file,
    snapshot_date: combo.snapshot_date,
    coverage: combo.coverage,
    shift_supported: false,
    granularity: "Day",
    capability_scope: "published_snapshot",
    time_basis: calender4Fixture.time_basis,
  };
}

export function staticCapabilityRows(combo) {
  return METRICS.map((m) => ({
    plant: combo.plant,
    machine: combo.machine,
    itemcode: combo.recipe,
    kpi_name: `${combo.parameter} ${m}`,
    actual_value: combo.metrics[m].value,
    status: combo.metrics[m].status,
  }));
}

export function summaryFromWidgets(widgets) {
  const counts = Object.fromEntries(
    [...STATUS_SEVERITY, "Insufficient Data"].map((s) => [s, 0]),
  );
  for (const w of widgets) counts[w.headline_status || headlineStatus([])]++;
  return {
    total_parameters: widgets.length,
    out_of_specification: counts.Critical,
    marginal: counts.Major,
    not_capable: counts.Warning,
    capable: counts.Healthy,
    insufficient_data: counts["Insufficient Data"],
  };
}
