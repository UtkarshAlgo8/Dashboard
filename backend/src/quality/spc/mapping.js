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

/** Every silver table the SPC page can read, de-duplicated. */
export const SILVER_SOURCES = [VMI_MAXX, VMI_EXXIUM, DATAPARAM, TUO];

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

/** The silver table that serves a gold machine, or null if unmapped. */
export function sourceForMachine(machine) {
  const entry = MACHINES.get(String(machine ?? "").trim().toUpperCase());
  return entry ? entry.source : null;
}

/* ----------------------------------------------------------------- *
 * Shift windows (Mapping sheet, Step 4)                              *
 * ----------------------------------------------------------------- */

/**
 * Resolve a UI shift to the silver time window for a chart date.
 * Shift C runs 23:00 → 07:00 and therefore spans midnight into the next day.
 *
 * @param {string} isoDate  yyyy-mm-dd
 * @param {"All"|"A"|"B"|"C"} shift
 * @returns {{ from: string, to: string }} inclusive-from / exclusive-to
 */
export function shiftWindow(isoDate, shift) {
  const s = String(shift ?? "All").trim().toUpperCase();
  const next = addDays(isoDate, 1);
  if (s === "A") return { from: `${isoDate} 07:00:00`, to: `${isoDate} 15:00:00` };
  if (s === "B") return { from: `${isoDate} 15:00:00`, to: `${isoDate} 23:00:00` };
  if (s === "C") return { from: `${isoDate} 23:00:00`, to: `${next} 07:00:00` };
  return { from: `${isoDate} 00:00:00`, to: `${next} 00:00:00` };
}

/**
 * Silver window for a single-day request. The chart shows the date the USER
 * asked for; `snapshot` only backs the gold capability figures (Cp/Cpk/Pp/
 * Ppk), which lag silver — SPC gold publishes T-1, so on 2026-09-22 the
 * latest capability row was 2026-09-21. Windowing silver on the snapshot hid
 * today's readings entirely and the page looked a day stale. `snapshot` is
 * still the fallback for callers that pass no date.
 */
export function dayWindow(date, snapshot, shift) {
  return shiftWindow(date || snapshot, shift);
}

/** yyyy-mm-dd + n days, UTC-safe. */
export function addDays(isoDate, n) {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Partition tuples (year, month, day) covered by a window — Athena pruning. */
export function partitionDays(from, to) {
  const start = from.slice(0, 10);
  const endExclusive = to.slice(0, 10);
  const days = [start];
  // A window never spans more than two calendar days (max 24h + shift offset).
  if (endExclusive !== start && to.slice(11) !== "00:00:00") days.push(endExclusive);
  else if (endExclusive !== start && to.slice(11) === "00:00:00" && addDays(start, 1) !== endExclusive) {
    let cur = addDays(start, 1);
    while (cur !== endExclusive) {
      days.push(cur);
      cur = addDays(cur, 1);
    }
  }
  return days.map((d) => {
    const [y, m, dd] = d.split("-");
    return { year: Number(y), month: Number(m), day: Number(dd) };
  });
}
