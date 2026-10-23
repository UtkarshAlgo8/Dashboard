import assert from "node:assert/strict";
import test from "node:test";

import { buildCacheKey } from "./cache.js";
import { spcTargets } from "./warmer.js";

function queryOf(path) {
  return Object.fromEntries(new URL(path, "http://x").searchParams);
}

test("SPC warm targets hit the same cache keys as the SPC tab's opening requests", () => {
  const [options, widgets] = spcTargets("2026-10-23");
  assert.equal(options.method, "GET");
  assert.match(options.path, /^\/api\/v1\/quality\/spc\/filter-options\?/);
  assert.match(widgets.path, /^\/api\/v1\/quality\/spc\/widgets\?/);

  // frontend/src/api/quality.js sends { plant, shift } first, then date;
  // the key must not depend on that order.
  const browser = { date: "2026-10-23", shift: "All", plant: "BANMORE" };
  assert.equal(
    buildCacheKey("/quality/spc/widgets", queryOf(widgets.path)),
    buildCacheKey("/quality/spc/widgets", browser),
  );
  assert.equal(
    buildCacheKey("/quality/spc/filter-options", queryOf(options.path)),
    buildCacheKey("/quality/spc/filter-options", browser),
  );
});

test("SPC warm targets do not cover a filtered or shift view", () => {
  const [, widgets] = spcTargets("2026-10-23");
  assert.notEqual(
    buildCacheKey("/quality/spc/widgets", queryOf(widgets.path)),
    buildCacheKey("/quality/spc/widgets", {
      date: "2026-10-23",
      shift: "A",
      plant: "BANMORE",
    }),
  );
});

test("SPC warm targets pass the date through verbatim, never a fallback", () => {
  const [, widgets] = spcTargets("");
  assert.equal(queryOf(widgets.path).date, "");
});
