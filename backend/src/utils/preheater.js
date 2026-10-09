/**
 * Deterministic cache preheater for Banmore (Phase 1).
 *
 * The reactive warmer learns (path, body) signatures from real traffic and
 * only knows the top-20 most-requested combos per cycle. A user opening a
 * section combination the recorder hasn't observed pays the full upstream
 * round-trip on first visit — most visible right after a deploy, when the
 * recorder's seen-set is still cold.
 *
 * The preheater is the deterministic floor: every cache key the FE *could*
 * ask for on the Banmore Production page is enumerated from a static catalog
 * (4 sections × 5 tabs × 2 periods × the relevant API subset), and replayed
 * on a 30-minute interval via the same x-cache-warm path the warmer uses.
 *
 * Cache keys are byte-identical to those the FE generates — replaying
 * through this same server guarantees no second copy of key-building logic
 * to drift out of sync.
 *
 * Scoped to Banmore (phase 1) only. CTP / multi-plant coverage is a future
 * expansion gated on `preheat.plants` config — add plant ids there when
 * needed.
 */

import { config } from "../config.js";

let timer = null;
// A cycle can outlast the interval when upstream is slow. Overlapping
// cycles would double the load on an API that's already struggling — and
// for the preheater there's nothing to gain by re-running a still-running
// pass before the next tick.
let running = false;

/* ---------- catalog ---------- */

/**
 * One (path, body) tuple to replay. `method` defaults to POST because every
 * dashboard endpoint in scope is a POST.
 */
function target(path, body) {
  return { method: "POST", path, body };
}

/**
 * The Banmore landing-kpis allow-list per (section, tab), mirroring
 * `frontend/src/lib/kpi-transformer.js` `landingKpiNames()`. Kept inline
 * so the preheater does not depend on the FE bundle.
 */
const LANDING_KPIS = {
  Mixing: {
    p: ["OEE_o", "Production", "Plan_Compliance"],
    q: ["FTQ", "Scrap", "Rework", "NCM_Hold"],
    c: ["Specific_Power", "Scrap_Cost", "Budget_Util"],
    m: ["Absenteeism", "TQM_Score", "Suggestions", "Training"],
    s: ["Reportable", "First_Aid", "Near_Miss", "Safety_Audit"],
  },
  TBM: {
    p: [
      "OEE_o",
      "Production",
      "Plan_Compliance",
      "Production_product",
      "Building_Fulfilled_Qty_sku",
      "Building_Planned_Qty_sku",
    ],
    q: ["FTQ", "Scrap", "Rework", "NCM_Hold"],
    c: ["Specific_Power", "Scrap_Cost", "Budget_Util"],
    m: ["Absenteeism", "TQM_Score", "Suggestions", "Training"],
    s: ["Reportable", "First_Aid", "Near_Miss", "Safety_Audit"],
  },
  Curing: {
    p: [
      "OEE_o",
      "Production",
      "Plan_Compliance",
      "Production_product",
      "Curing_Fulfilled_Qty_sku",
      "Curing_Planned_Qty_sku",
    ],
    q: ["FTQ", "Scrap", "Rework", "NCM_Hold"],
    c: ["Specific_Power", "Scrap_Cost", "Budget_Util"],
    m: ["Absenteeism", "TQM_Score", "Suggestions", "Training"],
    s: ["Reportable", "First_Aid", "Near_Miss", "Safety_Audit"],
  },
  Stock: {
    p: ["OEE_s", "Production", "Plan_Compliance"],
    q: ["FTQ", "Scrap", "Rework", "NCM_Hold"],
    c: ["Specific_Power", "Scrap_Cost", "Budget_Util"],
    m: ["Absenteeism", "TQM_Score", "Suggestions", "Training"],
    s: ["Reportable", "First_Aid", "Near_Miss", "Safety_Audit"],
  },
};

/** Section-specific defaults that mirror `frontend/src/pages/BanmoreProduction.jsx`. */
const SECTION_DEFAULTS = {
  Mixing: { productType: "Master Compound", extraDrillKpis: null },
  TBM: { productType: "Green Tyre", extraDrillKpis: ["Production_product"] },
  Curing: { productType: "Cured Tyre", extraDrillKpis: ["Production_product"] },
  Stock: { productType: null, extraDrillKpis: null },
};

/** Tabs the preheater covers (Inventory is out of phase 1 scope). */
const TABS = ["p", "q", "c", "m", "s"];
const SECTIONS = ["Mixing", "TBM", "Curing", "Stock"];

/* ---------- period derivation ---------- */

/** Pad number to 2 digits. */
function pad(n) {
  return n < 10 ? `0${n}` : String(n);
}

/**
 * Compute the [from, to] windows for the "current month" and "previous
 * month" presets the FE uses for the Banmore Production dashboard.
 *
 * The "current" window is month-to-date: 1st of this month → today. The
 * "previous" window is the entire previous calendar month. The as-of date
 * is the server clock — callers that need an upstream-anchored as-of
 * should use the FE's as-of endpoint instead.
 *
 * @param {Date} [now] injected for tests
 * @returns {{ current: {from,to}, prev: {from,to} }}
 */
export function periodWindows(now = new Date()) {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth(); // 0-indexed
  const d = now.getUTCDate();

  const currentFrom = `${y}-${pad(m + 1)}-01`;
  const currentTo = `${y}-${pad(m + 1)}-${pad(d)}`;

  // Previous calendar month: step back to month 0 of previous year if m === 0.
  const prevY = m === 0 ? y - 1 : y;
  const prevM = m === 0 ? 12 : m; // 1-indexed for the pad() formatter
  const lastDayPrev = new Date(Date.UTC(prevY, prevM, 0)).getUTCDate();
  const prevFrom = `${prevY}-${pad(prevM)}-01`;
  const prevTo = `${prevY}-${pad(prevM)}-${pad(lastDayPrev)}`;

  return {
    current: { from: currentFrom, to: currentTo },
    prev: { from: prevFrom, to: prevTo },
  };
}

/* ---------- target generation ---------- */

/**
 * The static catalog: every payload the FE could legitimately ask for on the
 * Banmore Production dashboard's first paint.
 *
 * One kpi-data landing target per (section, tab, period, plant) — and the
 * baseline sibling is created by the same handler (withBaseline=true), so
 * one replay fills two cache entries. Shift comparison is a separate
 * endpoint with a different cache key. Product options has its own.
 *
 * @param {string} plantId
 * @param {{ current:{from,to}, prev:{from,to} }} windows
 * @returns {Array<{ method, path, body, label }>}
 */
export function staticCatalog(plantId, windows) {
  const targets = [];
  for (const section of SECTIONS) {
    const defaults = SECTION_DEFAULTS[section];
    for (const tab of TABS) {
      const landingKpis = LANDING_KPIS[section][tab];
      const context = {
        section,
        category: tabCategory(tab),
        granularity: "MONTH",
        ...(defaults.productType ? { product_type: defaults.productType } : {}),
      };
      for (const [periodKey, win] of Object.entries(windows)) {
        const label = `${section}/${tab}/${periodKey}`;

        // kpi-data landing — withBaseline=true fills the baseline sibling in
        // the same handler call.
        targets.push(
          target("/api/v1/dashboard/kpi-data", {
            plantId,
            context,
            from: win.from,
            to: win.to,
            drillKpis: defaults.extraDrillKpis,
            landingKpis,
            parentFilters: {},
            limit: 10000,
            withBaseline: true,
          }),
        );

        // shift-comparison — only Productivity + Quality tabs read it on
        // the page; the other tabs would render zero bars and never read
        // it, so skip them.
        if (tab === "p" || tab === "q") {
          targets.push(
            target("/api/v1/dashboard/shift-comparison", {
              plantId,
              section,
              category: tabCategory(tab),
              context: {
                ...(defaults.productType
                  ? { product_type: defaults.productType }
                  : {}),
              },
              kpis: tab === "p" ? ["Production"] : ["Scrap", "Rework"],
              extraKpis: defaults.extraDrillKpis,
              ...win,
              limit: 10000,
            }),
          );
        }

        // product-options — drives the type/sub-section pills under the
        // section header. Fires on every section/tab change so always warm.
        targets.push(
          target("/api/v1/dashboard/product-options", {
            plantId,
            context: { section, category: tabCategory(tab) },
            ...win,
            limit: 1000,
          }),
        );
      }
    }
  }
  return targets;
}

/** Tab id → category label. */
function tabCategory(tab) {
  return { p: "Productivity", q: "Quality", c: "Cost", m: "Morale", s: "Safety" }[
    tab
  ];
}

/* ---------- HTTP replay ---------- */

/** Same shape as warmer.warmOne but tagged with x-cache-warm so the route gate skips auth. */
async function preheatOne(target, baseUrl) {
  const signal = AbortSignal.timeout(config.upstream.timeoutMs + 5_000);
  const res = await fetch(`${baseUrl}${target.path}`, {
    method: target.method,
    signal,
    headers: {
      "content-type": "application/json",
      "x-cache-warm": "1",
    },
    body: target.method === "POST" ? JSON.stringify(target.body) : undefined,
  });
  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText}`);
  }
  await res.arrayBuffer();
}

/** Fixed-size worker pool, copied from warmer.js to keep both modules independent. */
async function runPool(targets, worker, concurrency) {
  let cursor = 0;
  const workers = Array.from(
    { length: Math.min(concurrency, targets.length) },
    async () => {
      while (cursor < targets.length) {
        const target = targets[cursor++];
        await worker(target);
      }
    },
  );
  await Promise.all(workers);
}

/**
 * One preheat pass. Never rejects — a single failed target must not take
 * down the timer or the process. Failures write nothing, so the previous
 * cached value stays live rather than being replaced by an error.
 */
export async function preheatCycle({ baseUrl, plantIds, now = new Date() } = {}) {
  if (running) return { skipped: true };
  running = true;
  const startedAt = Date.now();
  const url = baseUrl ?? `http://127.0.0.1:${config.port}`;
  const plants = plantIds ?? config.preheat.plants;
  const windows = periodWindows(now);

  let ok = 0;
  let failed = 0;
  try {
    const targets = [];
    for (const plantId of plants) {
      for (const t of staticCatalog(plantId, windows)) targets.push(t);
    }

    await runPool(
      targets,
      async (t) => {
        try {
          await preheatOne(t, url);
          ok++;
        } catch (err) {
          failed++;
          // eslint-disable-next-line no-console
          console.warn(`[preheat] ${t.method} ${t.path}: ${err.message}`);
        }
      },
      config.preheat.concurrency,
    );

    const durationMs = Date.now() - startedAt;
    // eslint-disable-next-line no-console
    console.log(
      `[preheat] cycle done in ${durationMs}ms — ${ok} ok, ${failed} failed, ${targets.length} targets (plants: ${plants.join(", ")})`,
    );
    return { ok, failed, targets: targets.length, durationMs };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(`[preheat] cycle aborted: ${err.message}`);
    return { ok, failed, error: err.message };
  } finally {
    running = false;
  }
}

/**
 * Schedule the preheater. No-op when disabled. Safe to call once at boot.
 *
 * Runs after `bootDelayMs` (the server has to be listening for the replay
 * to land — the targets hit `http://127.0.0.1:${port}`). Then on
 * `intervalMs`. Concurrent cycles are skipped via the `running` flag above.
 */
export function startPreheater() {
  if (!config.preheat.enabled) {
    // eslint-disable-next-line no-console
    console.log("[preheat] disabled (CACHE_PREHEAT_ENABLED=false)");
    return;
  }
  // eslint-disable-next-line no-console
  console.log(
    `[preheat] enabled — every ${Math.round(config.preheat.intervalMs / 1000)}s for plants: ${config.preheat.plants.join(", ")}`,
  );

  const boot = setTimeout(() => {
    preheatCycle();
    timer = setInterval(() => preheatCycle(), config.preheat.intervalMs);
    // Don't hold the event loop open on account of the preheater.
    timer.unref?.();
  }, config.preheat.bootDelayMs);
  boot.unref?.();
}

export function stopPreheater() {
  if (timer) clearInterval(timer);
  timer = null;
}