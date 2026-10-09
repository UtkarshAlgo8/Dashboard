/**
 * Unit tests for gold-source.js — the fresh/historical table split
 * (gold.gold vs gold.gold_daily). Pure SQL-shape assertions: no network.
 *
 * Run: npm test
 */
import test from "node:test";
import assert from "node:assert/strict";

import { goldSource, freshCutoffKey, GOLD_ALL_COLUMNS } from "./gold-source.js";

/** Shift a YYYYMMDD digit string by whole days (UTC, DST-free). */
function shiftKey(yyyymmdd, days) {
  const y = Number(yyyymmdd.slice(0, 4));
  const m = Number(yyyymmdd.slice(4, 6));
  const d = Number(yyyymmdd.slice(6, 8));
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  const yyyy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yyyy}${mm}${dd}`;
}

const CUTOFF = freshCutoffKey();

test("freshCutoffKey returns a YYYYMMDD digit string", () => {
  assert.match(CUTOFF, /^\d{8}$/);
});

test("GOLD_ALL_COLUMNS lists all 27 byte-identical gold columns", () => {
  assert.equal(GOLD_ALL_COLUMNS.length, 27);
  assert.deepEqual(GOLD_ALL_COLUMNS.slice(-4), [
    "equnr",
    "eqname",
    "arbpl",
    "logbook_id",
  ]);
});

/* --------------------- happy path: straddling window --------------------- */

test("a window straddling the cutoff unions the base and daily tables on disjoint, adjacent date predicates", () => {
  const fromKey = shiftKey(CUTOFF, -5);
  const toKey = shiftKey(CUTOFF, 5);
  const sql = goldSource({ plantId: "banmore", fromKey, toKey });

  assert.ok(sql.startsWith("("), "must be a parenthesized subquery");
  assert.ok(sql.includes(" UNION ALL "));
  assert.ok(sql.includes("FROM gold.gold "));
  assert.ok(sql.includes("FROM gold.gold_daily "));

  // Disjoint, adjacent split at the SAME cutoff value: historical branch is
  // strictly < cutoff, fresh branch is >= cutoff — never both, never a gap.
  assert.ok(sql.includes(`< '${CUTOFF}'`));
  assert.ok(sql.includes(`>= '${CUTOFF}'`));

  // The caller's own window is still pushed into each branch.
  assert.ok(sql.includes(`>= '${fromKey}'`));
  assert.ok(sql.includes(`<= '${toKey}'`));

  // Both branches select the identical 27-column projection (no `SELECT *`).
  assert.ok(!sql.includes("SELECT *"));
  const cols = GOLD_ALL_COLUMNS.join(", ");
  assert.equal(sql.split(`SELECT ${cols} FROM`).length - 1, 2);
});

test("an unbounded window (no from/to at all) also unions, since it necessarily straddles the cutoff", () => {
  const sql = goldSource({ plantId: "banmore", fromKey: null, toKey: null });
  assert.ok(sql.includes(" UNION ALL "));
  assert.ok(sql.includes("FROM gold.gold "));
  assert.ok(sql.includes("FROM gold.gold_daily "));
});

/* ------------------------- entirely historical ------------------------- */

test("a window entirely before the cutoff returns the bare base table, unchanged", () => {
  const fromKey = shiftKey(CUTOFF, -10);
  const toKey = shiftKey(CUTOFF, -3);
  const sql = goldSource({ plantId: "banmore", fromKey, toKey });
  assert.equal(sql, "gold.gold");
});

/* --------------------------- entirely fresh --------------------------- */

test("a window entirely at/after the cutoff returns the bare daily table", () => {
  const fromKey = CUTOFF;
  const toKey = shiftKey(CUTOFF, 2);
  const sql = goldSource({ plantId: "banmore", fromKey, toKey });
  assert.equal(sql, "gold.gold_daily");
});

/* --------------- degenerate: plant with no daily table (Chennai) --------------- */

test("a plant with no daily table configured always returns the bare base table", () => {
  // Straddling window — would union for Banmore, must not for Chennai.
  const straddling = goldSource({
    plantId: "chennai",
    fromKey: shiftKey(CUTOFF, -5),
    toKey: shiftKey(CUTOFF, 5),
  });
  assert.equal(straddling, "gold.ctp_gold");

  // Unbounded — would also union for Banmore.
  const unbounded = goldSource({ plantId: "chennai", fromKey: null, toKey: null });
  assert.equal(unbounded, "gold.ctp_gold");

  // Entirely fresh — would resolve to a daily table for Banmore.
  const fresh = goldSource({ plantId: "chennai", fromKey: CUTOFF, toKey: null });
  assert.equal(fresh, "gold.ctp_gold");
});
