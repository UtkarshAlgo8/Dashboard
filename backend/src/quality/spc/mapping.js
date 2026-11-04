/**
 * Gold KPI → Silver source mapping (docs/Gold_to_Silver_Mapping.xlsx).
 *
 * The SPC page is assembled from TWO layers and this file is the only place
 * that knows how they join:
 *
 *   GOLD  (gold.gold, category='SPC')  — capability indices (Cp/Cpk/Pp/Ppk),
 *         their statuses, and the control limits (… UCL / … LCL baseline
 *         rows). Read verbatim; never recomputed. The gold figures were
 *         calculated on cleaned, cluster-sampled data and will NOT match a
 *         naive recalculation from the chart points (Mapping sheet, Step 2).
 *
 *   SILVER (silver.fct_*)              — the individual measurements that the
 *         control chart and the distribution are actually drawn from.
 *
 * The join key is (machine × parameter) → (table, value column); the recipe
 * (gold `itemcode` = silver `item_code`) narrows it to one product.
 *
 * Case: gold machine ids are upper snake (`VMI_MAXX_01`, `QUINTUPLEX`) while
 * silver stores them lower/mixed (`vmi_maxx_01`, `QuintuPlex`). Every machine
 * comparison is therefore made on UPPER(), never on the raw column.
 */

/* ----------------------------------------------------------------- *
 * Silver tables                                                      *
 * ----------------------------------------------------------------- */

const VMI_MAXX = {
  table: "silver.fct_production_data_vmi_maxx",
  machineColumn: "machine_no",
  itemColumn: "item_code",
  timeColumn: "event_time",
};
const VMI_EXXIUM = {
  table: "silver.fct_production_data_vmiexxium",
  machineColumn: "machine_no",
  itemColumn: "item_code",
  timeColumn: "event_time",
};
const DATAPARAM = {
  table: "silver.fct_dataparam",
  machineColumn: "machine_no",
  itemColumn: "item_code",
  timeColumn: "event_time",
};
const TUO = {
  table: "silver.fct_productiondatatuo",
  machineColumn: "machine_name",
  itemColumn: "item_code",
  timeColumn: "event_time",
};

// PAINTING stores IDs, not the machine name / SAP item code used by gold.
// silver.queries.js resolves them through the plant-scoped dimension joins.
const PAINTING = {
  table: "silver.fct_paintingdata",
  kind: "painting",
  baselineByRecipe: true,
  machineColumn: "machine_name",
  itemColumn: "item_code",
  timeColumn: "event_time",
  tieBreakColumn: "record_id",
};

// Version the response and reading caches when source mappings change.
export const SPC_SOURCE_VERSION = "silver-v3-painting-setpoint";

/* ----------------------------------------------------------------- *
 * Tolerances — the ONE place spec limits come from                   *
 * ----------------------------------------------------------------- *
 *
 * USL/LSL are NOT in the gold layer. For a parameter that has a setpoint the
 * spec window is `target ± tolerance`, where target is the most frequent
 * positive setpoint in the window (Mapping sheet, Step 6).
 *
 * `tolerance: null` means the plant has not given us a spec window for that
 * parameter. Those charts render WITHOUT USL/LSL rather than with invented
 * ones — a fabricated spec limit would silently turn a conforming process
 * into a failing one, or the reverse.
 *
 * provenance:
 *   "documented"  – stated in the mapping workbook.
 *   "assumed"     – extended from a documented sibling of the same unit and
 *                   measurement class. Confirm with Technical.
 *   null          – unknown; no spec limits drawn.
 */
export const TOLERANCE_PROVENANCE = {
  DOCUMENTED: "documented",
  ASSUMED: "assumed",
};

/** Length parameters share the ±5 mm window documented for Belt 1 Length. */
const LEN = { tolerance: 5, unit: "mm" };
const SPLICE = { tolerance: null, unit: "mm" };

const VMI_PARAMS = {
  "Belt 1 Length": { valueColumn: "belt1_length", setpointColumn: "belt1_length_setpoint", ...LEN, provenance: "documented" },
  "Belt 2 Length": { valueColumn: "belt2_length", setpointColumn: "belt2_length_setpoint", ...LEN, provenance: "assumed" },
  "PA Length": { valueColumn: "pa_length", setpointColumn: "pa_length_setpoint", ...LEN, provenance: "assumed" },
  "PLY1 Length": { valueColumn: "ply1_length", setpointColumn: "ply1_length_setpoint", ...LEN, provenance: "assumed" },
  "PLY2 Length": { valueColumn: "ply2_length", setpointColumn: "ply2_length_setpoint", ...LEN, provenance: "assumed" },
  "Tread Length": { valueColumn: "tread_length", setpointColumn: "tread_length_setpoint", ...LEN, provenance: "assumed" },
  "Tread Width": { valueColumn: "tread_width", setpointColumn: "tread_width_setpoint", ...LEN, provenance: "assumed" },
  // Splices have no setpoint in Silver and no documented fixed window.
  "Belt 1 Splice": { valueColumn: "belt1_splice", setpointColumn: null, ...SPLICE, provenance: null },
  "Belt 2 Splice": { valueColumn: "belt2_splice", setpointColumn: null, ...SPLICE, provenance: null },
  "PA Splice": { valueColumn: "pa_splice", setpointColumn: null, ...SPLICE, provenance: null },
  "PLY1 Splice": { valueColumn: "ply1_splice", setpointColumn: null, ...SPLICE, provenance: null },
  "PLY2 Splice": { valueColumn: "ply2_splice", setpointColumn: null, ...SPLICE, provenance: null },
  "Tread Splice": { valueColumn: "tread_splice", setpointColumn: null, ...SPLICE, provenance: null },
};

const QUINTUPLEX_PARAMS = {
  "Tread Length": { valueColumn: "tread_length", setpointColumn: "tread_length_setpoint", ...LEN, provenance: "assumed" },
  "Tread Width": { valueColumn: "tread_width", setpointColumn: "tread_width_setpoint", ...LEN, provenance: "assumed" },
  // Weight is kg, not mm — the mm tolerance does not transfer.
  "Tread Weight": { valueColumn: "tread_weight", setpointColumn: "tread_weight_setpoint", tolerance: null, unit: "kg", provenance: null },
};

// Uniformity uses fixed windows rather than a setpoint; none are documented
// in this export, so no spec limits are drawn (the charts still render).
const TUO_PARAMS = {
  Conicity: { valueColumn: "conicity", setpointColumn: null, tolerance: null, unit: null, provenance: null },
  "Inflation Pressure": { valueColumn: "uniformity_inflation_press", setpointColumn: null, tolerance: null, unit: null, provenance: null },
  LFV: { valueColumn: "lfv", setpointColumn: null, tolerance: null, unit: null, provenance: null },
  RFV: { valueColumn: "rfv", setpointColumn: null, tolerance: null, unit: null, provenance: null },
};

// Setpoints are joined by SAP code from silver.dim_tyre_spec_weight.
// Unit/tolerance remain unconfirmed: draw the target, not an invented spec window.
const PAINTING_PARAMS = {
  "Painted Tyre Weight": { valueColumn: "weight", setpointColumn: "spec_weight", tolerance: null, unit: null, provenance: null },
};

/** machine (gold id, upper) → { source, params } */
const MACHINES = new Map();
for (const m of ["VMI_MAXX_01", "VMI_MAXX_02", "VMI_MAXX_03", "VMI_MAXX_04"]) {
  MACHINES.set(m, { source: VMI_MAXX, params: VMI_PARAMS });
}
for (const m of ["VMIEXXIUM01", "VMIEXXIUM02", "VMIEXXIUM03", "VMIEXXIUM04"]) {
  MACHINES.set(m, { source: VMI_EXXIUM, params: VMI_PARAMS });
}
MACHINES.set("QUINTUPLEX", { source: DATAPARAM, params: QUINTUPLEX_PARAMS });
for (const m of ["30-0224", "30-0297", "MICROPOISE"]) {
  MACHINES.set(m, { source: TUO, params: TUO_PARAMS });
}

for (const m of ["GISLOTICA-PAINTINGMACHINE", "NEWCHINAPAINTING", "OLDCHINAPAINTING", "MR_PAINTING01", "MANUAL PAINTING"]) {
  MACHINES.set(m, { source: PAINTING, params: PAINTING_PARAMS });
}

/** Every silver table the SPC page can read, de-duplicated. */
export const SILVER_SOURCES = [VMI_MAXX, VMI_EXXIUM, DATAPARAM, TUO, PAINTING];

/** Machines served by one silver table (gold ids). */
export function machinesForSource(source) {
  return [...MACHINES.entries()]
    .filter(([, v]) => v.source.table === source.table)
    .map(([k]) => k);
}

/** Parameter map for a silver table. */
export function paramsForSource(source) {
  const entry = [...MACHINES.values()].find((v) => v.source.table === source.table);
  return entry ? entry.params : {};
}

/**
 * Resolve one gold (machine, parameter) to its silver column.
 * @returns {null | {table,machineColumn,itemColumn,timeColumn,valueColumn,setpointColumn,tolerance,unit,provenance}}
 */
export function resolveSilver(machine, parameter) {
  const entry = MACHINES.get(String(machine ?? "").trim().toUpperCase());
  if (!entry) return null;
  const p = entry.params[String(parameter ?? "").trim()];
  if (!p) return null;
  return { ...entry.source, ...p };
}

/** PAINTING gold baselines are per recipe; legacy sources remain machine-level. */
export function baselineKey(machine, parameter, recipe) {
  const id = String(machine ?? "").trim().toUpperCase();
  return resolveSilver(id, parameter)?.baselineByRecipe
    ? `${id}|||${String(recipe ?? "").trim()}|||${parameter}`
    : `${id}|||${parameter}`;
}

/** The silver table that serves a gold machine, or null if unmapped. */
export function sourceForMachine(machine) {
  const entry = MACHINES.get(String(machine ?? "").trim().toUpperCase());
  return entry ? entry.source : null;
}

/* ----------------------------------------------------------------- *
 * Shift hours (Mapping sheet, Step 4)                                *
 * ----------------------------------------------------------------- */

/**
 * Clock hours a UI shift covers, applied to silver on EVERY date. Silver is
 * not bound to the date filter (chart dots are the combo's whole history),
 * but the shift selector still narrows them to that shift's readings.
 * Shift C runs 23:00 → 07:00, so its `from` is after its `to`: it wraps
 * midnight.
 *
 * @param {"All"|"A"|"B"|"C"} shift
 * @returns {null | { from: number, to: number }} inclusive-from / exclusive-to
 *          hour of day; null for All (no shift narrowing)
 */
export function shiftHours(shift) {
  const s = String(shift ?? "All").trim().toUpperCase();
  if (s === "A") return { from: 7, to: 15 };
  if (s === "B") return { from: 15, to: 23 };
  if (s === "C") return { from: 23, to: 7 };
  return null;
}
