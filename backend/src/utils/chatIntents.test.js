/**
 * The intent enum is the one place a spelling mistake becomes a 422 from the
 * upstream, so it gets its own test: "analyse" is a plausible-looking value
 * that must NOT validate.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  CHAT_INTENTS,
  DEFAULT_CHAT_INTENT,
  isChatIntent,
} from "./chatIntents.js";

test("accepts every intent the upstream declares", () => {
  for (const intent of ["query", "plot", "analyze", "report"]) {
    assert.equal(isChatIntent(intent), true, `${intent} should be valid`);
  }
  assert.deepEqual([...CHAT_INTENTS].sort(), [
    "analyze",
    "plot",
    "query",
    "report",
  ]);
});

test("rejects the British spelling of analyze", () => {
  // Edge case: the upstream enum is "analyze". Accepting "analyse" here
  // would forward a body the service answers with a 422.
  assert.equal(isChatIntent("analyse"), false);
});

test("rejects non-string and unknown values", () => {
  for (const value of [undefined, null, 42, {}, [], "", "QUERY", "summarise"]) {
    assert.equal(isChatIntent(value), false, `${String(value)} should be invalid`);
  }
});

test("defaults to query", () => {
  assert.equal(DEFAULT_CHAT_INTENT, "query");
  assert.equal(isChatIntent(DEFAULT_CHAT_INTENT), true);
});

test("the enum is frozen", () => {
  assert.throws(() => CHAT_INTENTS.push("summarize"), TypeError);
});
