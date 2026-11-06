import test from "node:test";
import assert from "node:assert/strict";
import { createUniformityLimiter } from "./limiter.js";

test("uncached Uniformity queries have bounded concurrency/queue; errors release slots", async () => {
  const limit = createUniformityLimiter(2, 1);
  let active = 0,
    peak = 0;
  const releases = [];
  const work = () =>
    limit(async () => {
      active++;
      peak = Math.max(peak, active);
      try {
        await new Promise((resolve) => releases.push(resolve));
      } finally {
        active--;
      }
    });
  const a = work(),
    b = work(),
    c = work();
  assert.equal(active, 2);
  await assert.rejects(
    work(),
    (e) => e.status === 503 && e.type === "UNIFORMITY_BUSY",
  );
  releases.shift()();
  await a;
  await Promise.resolve();
  assert.equal(active, 2);
  releases.shift()();
  releases.shift()();
  await Promise.all([b, c]);
  assert.equal(peak, 2);
  assert.equal(active, 0);
  await assert.rejects(
    limit(async () => {
      throw new Error("fixture query failure");
    }),
    /fixture query failure/,
  );
  assert.equal(await limit(async () => 42), 42);
});
