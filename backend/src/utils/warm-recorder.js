import { cacheGet, cacheSet, stableStringify } from "./cache.js";

/**
 * Remembers which dashboard views real browsers ask for, so the warmer can
 * replay them.
 *
 * The obvious alternative was to hard-code the default view server-side
 * (section=Mixing, category=Productivity, preset=month, ...). That fails in a
 * way nobody would notice: the cache key is built from the whole request body,
 * including `landingKpis`, which comes from the frontend's KPI catalogue
 * (frontend/src/lib/kpi-transformer.js). Any drift between that catalogue and a
 * server-side copy of it means the warmer fills keys the browser never reads —
 * the dashboard stays exactly as slow, with a warmer that reports success.
 *
 * Recording sidesteps the duplication entirely: we warm the exact bodies the
 * frontend sent, so the keys match by construction and keep matching when the
 * frontend defaults change.
 *
 * Cost: on a completely cold install nothing is warm until the first visit.
 * From then on the set persists (Redis) and survives deploys, which is when
 * warming matters most.
 */

// Only the calls the landing page and a plant's OPENING dashboard make. Drill
// and filter permutations are deliberately excluded — they are unbounded, and
// warming them would spend upstream budget on views nobody has open.
const RECORDABLE_PATHS = new Set([
  "/api/v1/dashboard/kpi-data",
  "/api/v1/dashboard/product-options",
  "/api/v1/dashboard/shift-comparison",
]);

const STORE_KEY = "warm:recorded-requests";
const STORE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
// Ceiling on the remembered set. Ranked by hit count, so the views that
// actually get opened survive and long-tail one-offs fall off.
const MAX_ENTRIES = 60;

/** signature -> { path, body, count, lastSeenAt } */
const recorded = new Map();
let loaded = false;
let dirty = false;

function signatureOf(path, body) {
  return `${path}|${stableStringify(body)}`;
}

/**
 * A landing view is what we want; a drill is not. `drillOnly` is the flag the
 * frontend sets for drill fetches (see useDashboardFetch.js), so it cleanly
 * separates "the page as opened" from "the user dug into a card".
 */
function isWarmableBody(path, body) {
  if (!body || typeof body !== "object") return false;
  if (body.drillOnly === true) return false;
  if (path === "/api/v1/dashboard/kpi-data" && !body.context) return false;
  return true;
}

/** Load the persisted set once. Safe to call repeatedly. */
export async function loadRecorded() {
  if (loaded) return;
  loaded = true;
  try {
    const saved = await cacheGet(STORE_KEY);
    if (!Array.isArray(saved)) return;
    for (const entry of saved) {
      if (!entry?.path || !entry?.body) continue;
      recorded.set(signatureOf(entry.path, entry.body), {
        path: entry.path,
        body: entry.body,
        count: Number(entry.count) || 1,
        lastSeenAt: entry.lastSeenAt ?? null,
      });
    }
  } catch {
    // A missing or corrupt set just means we start recording afresh.
  }
}

async function persist() {
  if (!dirty) return;
  dirty = false;
  try {
    await cacheSet(STORE_KEY, [...recorded.values()], STORE_TTL_MS);
  } catch {
    // Persistence is an optimisation; in-memory recording still works.
  }
}

/** Drop the least-requested entries once the set outgrows MAX_ENTRIES. */
function prune() {
  if (recorded.size <= MAX_ENTRIES) return;
  const ranked = [...recorded.entries()].sort(
    (a, b) => b[1].count - a[1].count,
  );
  for (const [sig] of ranked.slice(MAX_ENTRIES)) recorded.delete(sig);
}

/**
 * Express middleware. Records a whitelisted POST once its response comes back
 * 2xx — a body that errored is not a view worth warming.
 */
export function warmRecorder(req, res, next) {
  if (req.method !== "POST" || !RECORDABLE_PATHS.has(req.path)) {
    next();
    return;
  }
  // Never record the warmer replaying itself: counts would compound every
  // cycle and drown out real traffic in the ranking.
  if (req.headers["x-cache-warm"]) {
    next();
    return;
  }

  const { path } = req;
  const body = req.body;

  res.on("finish", () => {
    if (res.statusCode < 200 || res.statusCode >= 300) return;
    if (!isWarmableBody(path, body)) return;
    const sig = signatureOf(path, body);
    const existing = recorded.get(sig);
    if (existing) {
      existing.count++;
      existing.lastSeenAt = new Date().toISOString();
    } else {
      recorded.set(sig, {
        path,
        body,
        count: 1,
        lastSeenAt: new Date().toISOString(),
      });
      prune();
    }
    dirty = true;
    persist();
  });

  next();
}

/** The `limit` most-requested recorded views, hottest first. */
export function topRecorded(limit) {
  return [...recorded.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, Math.max(0, limit))
    .map(({ path, body }) => ({ path, body }));
}

/**
 * What the next cycle would warm, for /admin/cache/stats. Without this the
 * recorded set is invisible in production and "is the right thing being
 * warmed?" cannot be answered without a debugger.
 */
export function recordedSummary(limit) {
  return {
    total: recorded.size,
    replayedPerCycle: Math.min(recorded.size, limit),
    views: [...recorded.values()]
      .sort((a, b) => b.count - a.count)
      .slice(0, limit)
      .map((r) => ({
        path: r.path,
        plantId: r.body?.plantId ?? null,
        section: r.body?.context?.section ?? null,
        category: r.body?.context?.category ?? null,
        granularity: r.body?.context?.granularity ?? null,
        count: r.count,
        lastSeenAt: r.lastSeenAt,
      })),
  };
}

export function _reset() {
  recorded.clear();
  loaded = false;
  dirty = false;
}
