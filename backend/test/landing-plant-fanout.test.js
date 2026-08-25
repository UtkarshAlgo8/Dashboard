/**
 * Landing-page per-plant fan-out.
 *
 * Regression guard for the 502 that hid the whole landing page: Chennai
 * reads ctp_gold.ctp_gold, that schema had not landed upstream, and the
 * Promise.all fan-out in getPlants turned one plant's SCHEMA_NOT_FOUND
 * into a failed response for every plant. A plant that cannot be read
 * must drop out of the map, not take the page down with it.
 */
import test from "node:test";
import assert from "node:assert/strict";

let perPlantSummaries;
try {
  ({ perPlantSummaries } = await import("../src/controllers/static.controller.js"));
} catch {
  perPlantSummaries = null; // missing AWS_DATA_* env — config throws at import time
}

const skip = perPlantSummaries ? false : "upstream credentials not configured";

const BANMORE = { id: "banmore", enabled: true };
const CHENNAI = { id: "chennai", enabled: true };

test("happy path — every plant resolves into the map", { skip }, async () => {
  const out = await perPlantSummaries([BANMORE, CHENNAI], async (plantId) => ({
    oee: plantId === "banmore" ? 71.4 : 68.2,
  }));

  assert.deepEqual(out, { banmore: { oee: 71.4 }, chennai: { oee: 68.2 } });
});

test("error case — a failing plant is dropped, the rest survive", { skip }, async () => {
  const out = await perPlantSummaries([BANMORE, CHENNAI], async (plantId) => {
    if (plantId === "chennai") {
      throw new Error("Query FAILED: SCHEMA_NOT_FOUND: Schema 'ctp_gold' does not exist");
    }
    return { oee: 71.4 };
  });

  assert.deepEqual(out.banmore, { oee: 71.4 }, "Banmore must still be served");
  assert.ok(!("chennai" in out), "the unreadable plant is absent, not null-filled");
});

test("edge case — every plant failing yields {} rather than throwing", { skip }, async () => {
  const out = await perPlantSummaries([BANMORE, CHENNAI], async () => {
    throw new Error("upstream down");
  });

  assert.deepEqual(out, {});
});

test("edge case — an unrecognised plant id is skipped without a query", { skip }, async () => {
  let calls = 0;
  const out = await perPlantSummaries([{ id: "atlantis", enabled: true }], async () => {
    calls += 1;
    return { oee: 1 };
  });

  assert.deepEqual(out, {});
  assert.equal(calls, 0, "normalizePlantId rejects it before the upstream call");
});
