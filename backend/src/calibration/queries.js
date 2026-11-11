import { UpstreamError } from "../utils/upstream.js";

export const CALIBRATION_TABLE = "silver.fct_equipment_calibration";
const MAX_ROWS = 10000;
const DAY_MS = 86400000;
const validDate = (value) =>
  typeof value === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(Date.parse(`${value}T00:00:00Z`)) &&
  new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;

/** One IST calendar date drives both the SQL snapshot and its cache key. */
export function calibrationToday(now = new Date()) {
  return new Date(now.getTime() + 330 * 60000).toISOString().slice(0, 10);
}

/** Athena equivalent of the guide's Databricks query; no historical/shift filters. */
export function calibrationQuery(asOfDate) {
  if (!validDate(asOfDate))
    throw new Error("Invalid calibration snapshot date.");
  return `SELECT machine_no, machine_name,
    CAST(total_instrument_code AS INTEGER) AS instruments,
    CAST(CAST(calibration_due_date AS DATE) AS VARCHAR) AS due_date,
    date_diff('day', DATE '${asOfDate}', CAST(calibration_due_date AS DATE)) AS days_left,
    COUNT(*) OVER () AS result_rows
  FROM ${CALIBRATION_TABLE}
  WHERE plant_code = '1300'
  ORDER BY CAST(calibration_due_date AS DATE), machine_no
  LIMIT ${MAX_ROWS + 1}`;
}

const fail = (message) => {
  throw new UpstreamError(message, {
    type: "CALIBRATION_SOURCE_INVALID",
    status: 502,
  });
};
const integer = (value) =>
  (typeof value === "number" ||
    (typeof value === "string" && value.trim() !== "")) &&
  Number.isSafeInteger(Number(value));

/** Count machines, not instruments; never classify missing dates as OK or drop old records. */
export function calibrationResult(rows, asOfDate) {
  if (!validDate(asOfDate)) fail("Invalid calibration snapshot date.");
  if (!Array.isArray(rows) || rows.length > MAX_ROWS)
    fail("Calibration response exceeds the machine limit.");
  const seen = new Set();
  const summary = { dueThisWeek: 0, overdue: 0, ok: 0 };
  const machines = rows.map((row) => {
    if (!row || Number(row.result_rows) !== rows.length)
      fail("Calibration response is incomplete or truncated.");
    if (
      !["string", "number"].includes(typeof row.machine_no) ||
      !String(row.machine_no).trim() ||
      !validDate(row.due_date) ||
      !integer(row.days_left) ||
      Number(row.days_left) !==
        (Date.parse(row.due_date) - Date.parse(asOfDate)) / DAY_MS
    )
      fail(
        "Calibration source contains a missing machine or invalid due date.",
      );
    const machineNo = String(row.machine_no).trim();
    if (seen.has(machineNo))
      fail("Calibration source must contain one row per machine.");
    seen.add(machineNo);
    const missingInstruments =
      row.instruments == null || row.instruments === "";
    if (
      !missingInstruments &&
      (!integer(row.instruments) || Number(row.instruments) < 0)
    )
      fail("Calibration source contains an invalid instrument count.");
    const daysLeft = Number(row.days_left);
    const status =
      daysLeft < 0 ? "overdue" : daysLeft <= 7 ? "dueThisWeek" : "ok";
    summary[status]++;
    return {
      machineNo,
      machineName: String(row.machine_name ?? "")
        .replaceAll('"', "")
        .trim(),
      instruments: missingInstruments ? null : Number(row.instruments),
      dueDate: row.due_date,
      daysLeft,
      status,
    };
  });
  machines.sort(
    (a, b) =>
      a.dueDate.localeCompare(b.dueDate) ||
      a.machineNo.localeCompare(b.machineNo),
  );
  return {
    context: {
      plant: "BTP",
      plantCode: "1300",
      asOfDate,
      timeZone: "Asia/Kolkata",
    },
    summary,
    machines,
  };
}
