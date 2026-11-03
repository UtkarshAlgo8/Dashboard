/** Offline, reproducible workbook -> JSON import. No workbook is read by HTTP requests. */
import XLSX from "xlsx";
import { createHash } from "node:crypto";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseKpiName, STATUS_SEVERITY } from "../src/quality/spc/engine.js";

const METRICS = ["Cp", "Cpk", "Pp", "Ppk"];
const pad = (v) => String(v).padStart(2, "0");
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

// Decode the serial's wall-clock components, not a host-local JavaScript Date.
export function excelTime(value, withTime = false) {
  const d = typeof value === "number" ? XLSX.SSF.parse_date_code(value) : null;
  assert(d, `Expected an Excel date serial, got ${value}`);
  const day = `${d.y}-${pad(d.m)}-${pad(d.d)}`;
  return withTime ? `${day} ${pad(d.H)}:${pad(d.M)}:${pad(d.S)}` : day;
}

export function importCalender4(buffer, filename) {
  const book = XLSX.read(buffer, { type: "buffer", cellDates: false });
  for (const name of ["SPC KPIs", "Raw Data"])
    assert(book.Sheets[name], `Missing sheet ${name}`);
  const kpis = XLSX.utils.sheet_to_json(book.Sheets["SPC KPIs"], {
    defval: null,
  });
  const raw = XLSX.utils.sheet_to_json(book.Sheets["Raw Data"], {
    defval: null,
  });
  assert(kpis.length && raw.length, "Both sheets must contain data");
  const combos = new Map();
  const identity = (r, parameter) => {
    assert(
      r.plant === "BANMORE" && r.machine === "ROLL_CALENDER_4_0501",
      "Unexpected plant/machine",
    );
    assert(
      typeof r.itemcode === "string" &&
        r.itemcode.trim() === r.itemcode &&
        r.itemcode.length > 0,
      `Unexpected recipe ${r.itemcode}`,
    );
    assert(
      ["Scanner Drive Zone", "Scanner Water Zone"].includes(parameter),
      `Unexpected parameter ${parameter}`,
    );
    return [r.plant, r.machine, r.itemcode, parameter].join("|||");
  };
  for (const r of kpis) {
    const token = String(r.kpi_name).trim().split(/\s+/).at(-1);
    const parameter = String(r.kpi_name)
      .trim()
      .slice(0, -(token.length + 1))
      .trim();
    const key = identity(r, parameter);
    assert(
      r.granularity === "Day" &&
        r.category === "SPC" &&
        r.department === "Quality",
      "Unexpected KPI scope",
    );
    assert(
      [...METRICS, "LSL", "USL"].includes(token),
      `Unexpected KPI ${r.kpi_name}`,
    );
    assert(Number.isFinite(r.actual_value), `Non-numeric KPI ${r.kpi_name}`);
    const snapshot = excelTime(r.date);
    if (!combos.has(key))
      combos.set(key, {
        plant: r.plant,
        machine: r.machine,
        recipe: r.itemcode,
        parameter,
        section: r.section,
        snapshot_date: snapshot,
        unit: null,
        metrics: {},
        spec: {},
        readings: [],
      });
    const c = combos.get(key);
    assert(
      c.snapshot_date === snapshot,
      "Multiple snapshots in one combination",
    );
    if (METRICS.includes(token)) {
      assert(!c.metrics[token], `Duplicate metric ${key}/${token}`);
      assert(
        STATUS_SEVERITY.includes(r.status),
        `Unexpected status ${r.status}`,
      );
      assert(parseKpiName(r.kpi_name).metric === token, "Invalid metric name");
      c.metrics[token] = { value: r.actual_value, status: r.status };
    } else {
      assert(
        r.status === "Reference" && c.spec[token.toLowerCase()] == null,
        `Invalid/duplicate spec ${key}/${token}`,
      );
      c.spec[token.toLowerCase()] = r.actual_value;
    }
  }
  const seen = new Set();
  for (const r of raw) {
    const key = identity(r, r.parameter);
    const c = combos.get(key);
    assert(c, `Readings without KPIs: ${key}`);
    assert(
      Number.isFinite(r.actual_value) && Number.isFinite(r.setpoint),
      `Invalid reading ${key}`,
    );
    assert(
      Number.isInteger(r.sample_no) && Number.isInteger(r.segment),
      `Invalid sample/segment ${key}`,
    );
    assert(["A", "B", "C"].includes(r.shift), `Invalid shift ${r.shift}`);
    const event_time = excelTime(r.event_time, true);
    const readingKey = `${key}|||${r.sample_no}`;
    assert(!seen.has(readingKey), `Duplicate reading ${readingKey}`);
    seen.add(readingKey);
    c.readings.push({
      date: excelTime(r.date),
      event_time,
      shift: r.shift,
      sample_no: r.sample_no,
      segment: r.segment,
      source_tag: r.source_tag,
      actual_value: r.actual_value,
      setpoint: r.setpoint,
    });
  }
  const combinations = [...combos.values()];
  assert(combinations.length > 0, "No KPI combinations found");
  for (const c of combinations) {
    assert(
      METRICS.every((m) => c.metrics[m]),
      `Incomplete capability: ${c.recipe}/${c.parameter}`,
    );
    assert(
      Number.isFinite(c.spec.lsl) &&
        Number.isFinite(c.spec.usl) &&
        c.spec.lsl < c.spec.usl,
      "Invalid specification limits",
    );
    assert(c.readings.length, "Combination without readings");
    c.readings.sort(
      (a, b) =>
        a.event_time.localeCompare(b.event_time) || a.sample_no - b.sample_no,
    );
    c.coverage = {
      from: c.readings[0].event_time,
      to: c.readings.at(-1).event_time,
    };
  }
  const hash = createHash("sha256").update(buffer).digest("hex");
  return {
    schema_version: 1,
    source_file: basename(filename),
    source_sha256: hash,
    version: `calender4-v1-${hash.slice(0, 12)}`,
    time_basis: "workbook local wall-clock (timezone unspecified)",
    kpi_rows: kpis.length,
    reading_rows: raw.length,
    combinations,
  };
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const input = process.argv[2];
  assert(
    input,
    "Usage: node backend/tools/import-spc-calender4.js <workbook.xlsx> [output.json]",
  );
  const output =
    process.argv[3] ||
    fileURLToPath(new URL("../data/spc/calender4.json", import.meta.url));
  const fixture = importCalender4(readFileSync(input), input);
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, JSON.stringify(fixture, null, 2) + "\n");
  process.stdout.write(
    `Imported ${fixture.combinations.length} combinations / ${fixture.reading_rows} readings -> ${output}\n`,
  );
}
