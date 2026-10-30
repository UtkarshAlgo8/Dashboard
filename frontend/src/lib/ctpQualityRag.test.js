import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ctpCardTier,
  ctpTargetLabel,
  describeCtpTier,
} from "./ctpQualityRag.js";

const atLeast95 = { op: ">=", value: 95 };
const atMost5 = { op: "<=", value: 5 };
const below1 = { op: "<", value: 1 };

test("ctpCardTier: higher-is-better target with the default 2-point band", () => {
  assert.equal(ctpCardTier({ value: 95, target: atLeast95 }), "green");
  assert.equal(ctpCardTier({ value: 93, target: atLeast95 }), "amber");
  assert.equal(ctpCardTier({ value: 92.99, target: atLeast95 }), "red");
});

test("ctpCardTier: lower-is-better targets, inclusive and strict", () => {
  assert.equal(ctpCardTier({ value: 5, target: atMost5 }), "green");
  assert.equal(ctpCardTier({ value: 7, target: atMost5 }), "amber");
  assert.equal(ctpCardTier({ value: 8, target: atMost5 }), "red");
  assert.equal(
    ctpCardTier({ value: 0.99, target: below1, amberBand: 0.5 }),
    "green",
  );
  assert.equal(
    ctpCardTier({ value: 1, target: below1, amberBand: 0.5 }),
    "amber",
  );
  assert.equal(
    ctpCardTier({ value: 1.5, target: below1, amberBand: 0.5 }),
    "red",
  );
});

test("ctpCardTier: no target follows the trend; no value has no colour", () => {
  assert.equal(ctpCardTier({ value: 10, trendFavourable: true }), "green");
  assert.equal(ctpCardTier({ value: 10, trendFavourable: false }), "red");
  assert.equal(ctpCardTier({ value: 10 }), null);
  assert.equal(ctpCardTier({ value: null, target: atLeast95 }), null);
});

test("ctpTargetLabel and describeCtpTier read the same target", () => {
  assert.equal(ctpTargetLabel(atLeast95, "%"), "≥ 95%");
  assert.equal(ctpTargetLabel(below1, "%"), "< 1%");
  assert.equal(ctpTargetLabel(null, "%"), null);
  assert.deepEqual(describeCtpTier({ target: atLeast95, unit: "%" }), [
    "Green: 95% or more",
    "Amber: 93% to below 95%",
    "Red: below 93%",
  ]);
  assert.deepEqual(describeCtpTier({ target: atMost5, unit: "nos" }), [
    "Green: 5 or less",
    "Amber: above 5 up to 7",
    "Red: above 7",
  ]);
  assert.deepEqual(
    describeCtpTier({ target: below1, amberBand: 0.5, unit: "%" }),
    ["Green: below 1%", "Amber: 1% to below 1.5%", "Red: 1.5% or more"],
  );
});
