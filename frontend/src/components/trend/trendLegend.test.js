import { test } from "node:test";
import assert from "node:assert/strict";
import { pickTrendExtremes } from "./trendLegend.js";

test("higher-is-better KPI: max is Best, min is Worst", () => {
  assert.deepEqual(pickTrendExtremes([4515, 8200, 10100, 6100], false), {
    best: 10100,
    worst: 4515,
  });
});

test("lower-is-better KPI (Scrap): least scrap is Best, most is Worst", () => {
  assert.deepEqual(pickTrendExtremes([4515, 8200, 10100, 6100], true), {
    best: 4515,
    worst: 10100,
  });
});

test("ignores null / non-finite gaps", () => {
  assert.deepEqual(pickTrendExtremes([null, 3, NaN, 7, undefined], true), {
    best: 3,
    worst: 7,
  });
});

test("flat, single-value or empty series marks no extremes", () => {
  const none = { best: null, worst: null };
  assert.deepEqual(pickTrendExtremes([5, 5, 5], true), none);
  assert.deepEqual(pickTrendExtremes([], false), none);
  assert.deepEqual(pickTrendExtremes(undefined, false), none);
});
