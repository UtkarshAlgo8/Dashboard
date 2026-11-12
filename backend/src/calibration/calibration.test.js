import test from "node:test";
import assert from "node:assert/strict";

process.env.AWS_DATA_URL = "http://calibration-upstream.invalid";
process.env.AWS_DATA_API_KEY = "placeholder";

const { calibrationQuery, calibrationToday, calibrationResult } =
  await import("./queries.js");

const asOfDate = "2026-11-12";

// Athena does not implicitly compare the live BIGINT plant_code with VARCHAR.
test("Calibration SQL uses the live numeric BTP plant code", () => {
  const sql = calibrationQuery(asOfDate);
  assert.match(sql, /FROM silver\.fct_equipment_calibration\b/);
  assert.match(sql, /WHERE plant_code = 1300\s/);
  assert.doesNotMatch(sql, /plant_code\s*=\s*'1300'/);
  assert.match(sql, /date_diff\('day', DATE '2026-11-12'/);
  assert.match(sql, /COUNT\(\*\) OVER \(\) AS result_rows/);
  assert.throws(() => calibrationQuery("2026-11-12' OR 1=1"));
});

test("Calibration uses the IST day across UTC midnight boundaries", () => {
  assert.equal(
    calibrationToday(new Date("2026-11-11T18:29:59Z")),
    "2026-11-11",
  );
  assert.equal(calibrationToday(new Date("2026-11-11T18:30:00Z")), asOfDate);
});

test("Calibration counts machines at 0/7/8-day boundaries and retains old overdue rows", () => {
  const fixtures = [
    ["OK", "2026-11-20", 8],
    ["DAY7", "2026-11-19", 7],
    ["TODAY", asOfDate, 0],
    ["BTPMI001", "2023-09-20", -1149],
  ].map(([machine_no, due_date, days_left]) => ({
    machine_no,
    machine_name: '"45"" MECH NEW NO.20(49)"',
    instruments: "6",
    due_date,
    days_left: String(days_left),
    result_rows: "4",
  }));
  const data = calibrationResult(fixtures, asOfDate);
  assert.deepEqual(data.summary, { dueThisWeek: 2, overdue: 1, ok: 1 });
  assert.deepEqual(
    data.machines.map((row) => row.machineNo),
    ["BTPMI001", "TODAY", "DAY7", "OK"],
  );
  assert.equal(data.machines[0].machineName, "45 MECH NEW NO.20(49)");
  assert.equal(data.machines[0].instruments, 6);
  assert.equal(data.context.plantCode, "1300");
  assert.throws(
    () => calibrationResult(fixtures.slice(1), asOfDate),
    /incomplete/,
  );
});
