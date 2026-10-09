import { test } from "node:test";
import assert from "node:assert/strict";
import {
  periodRequestParams,
  resolveEngineeringPeriod,
} from "./engineeringPeriod.js";

const clock = { today: "2026-10-09", currentMonth: "2026-10-01" };
const resolve = (timeRange) => resolveEngineeringPeriod(timeRange, clock);

test("default and This Month read the current MONTH row", () => {
  const current = { kind: "month", date: "2026-10-01", granularity: "MONTH" };
  assert.deepEqual(resolve({ preset: "month", from: "", to: "" }), current);
  assert.deepEqual(resolve(undefined), current);
});

test("a past month from the dropdown reads that MONTH row", () => {
  assert.deepEqual(resolve({ preset: "month", month: "2026-08" }), {
    kind: "month",
    date: "2026-08-01",
    granularity: "MONTH",
  });
});

test("Today reads today's DAY row", () => {
  assert.deepEqual(resolve({ preset: "today", from: "", to: "" }), {
    kind: "day",
    date: "2026-10-09",
    granularity: "DAY",
  });
});

test("an arbitrary custom range is passed through as a DAY-grain window", () => {
  assert.deepEqual(
    resolve({ preset: null, from: "2026-09-05", to: "2026-09-20" }),
    {
      kind: "range",
      date: "2026-09-05",
      granularity: "DAY",
      from: "2026-09-05",
      to: "2026-09-20",
    },
  );
});

test("a custom range spanning one whole month collapses onto its MONTH row", () => {
  assert.deepEqual(
    resolve({ preset: null, from: "2026-02-01", to: "2026-02-28" }),
    {
      kind: "month",
      date: "2026-02-01",
      granularity: "MONTH",
    },
  );
});

test("a one-day custom range reads that DAY row, timestamps stripped", () => {
  assert.deepEqual(
    resolve({
      preset: null,
      from: "2026-09-14T00:00:00.000Z",
      to: "2026-09-14",
    }),
    { kind: "day", date: "2026-09-14", granularity: "DAY" },
  );
});

test("a reversed custom range is reordered", () => {
  const p = resolve({ preset: null, from: "2026-09-20", to: "2026-09-05" });
  assert.equal(p.from, "2026-09-05");
  assert.equal(p.to, "2026-09-20");
});

test("an incomplete or invalid custom range falls back to the current month", () => {
  assert.equal(
    resolve({ preset: null, from: "2026-09-05", to: "" }).date,
    "2026-10-01",
  );
  assert.equal(
    resolve({ preset: null, from: "not-a-date", to: "2026-09-20" }).kind,
    "month",
  );
});

test("request params carry a window for a range and a single date otherwise", () => {
  assert.deepEqual(
    periodRequestParams(
      resolve({ preset: null, from: "2026-09-05", to: "2026-09-20" }),
    ),
    { from: "2026-09-05", to: "2026-09-20", granularity: "DAY" },
  );
  assert.deepEqual(periodRequestParams(resolve({ preset: "month" })), {
    date: "2026-10-01",
    granularity: "MONTH",
  });
});
