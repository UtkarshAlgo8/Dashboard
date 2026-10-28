import { config } from "../config.js";
import { recordWarmCycle } from "./cache.js";
import { loadRecorded, topRecorded } from "./warm-recorder.js";

/**
 * Background cache warmer.
 *
 * Runs shortly after boot and then on an interval, refreshing the landing page
 * and each plant's opening dashboard so those views are already in the cache
 * before anyone opens them.
 *
 * Boot-warming is the half that fixes deploys: `npm run deploy` destroys and
 * rebuilds the container, so without it the first user after every release
 * waits on the upstream API for every panel.
 *
 * Each target is replayed as a real HTTP request against this same server,
 * carrying `x-cache-warm` (see middlewares/warmContext.js). Going through the
 * live route is what keeps the warmed cache key identical to the one a browser
 * generates — there is no second copy of the key-building logic to drift.
 */

let timer = null;
// A cycle can outlast the interval when the upstream is slow. Overlapping
// cycles would double the load on an API that is already struggling.
let running = false;

/**
 * Targets whose request shape is fully known server-side. The dashboard POSTs
 * are NOT here — their bodies come from the frontend and are supplied by the
 * recorder instead.
 */
function staticTargets() {
  const targets = [
    { method: "GET", path: "/api/v1/plants" },
    // Quality cross-family endpoints — plant-agnostic, single entry per URL.
    { method: "GET", path: "/api/v1/quality/as-of" },
  ];
  targets.push(...spcTargets(todayInIst()));
  for (const plantId of config.warm.plants) {
    targets.push(
      { method: "GET", path: `/api/v1/plants/${plantId}/as-of` },
      { method: "GET", path: `/api/v1/plants/${plantId}/summary` },
      { method: "GET", path: `/api/v1/dashboard/vocab?plantId=${plantId}` },
      { method: "GET", path: `/api/v1/dashboard/anchors?plantId=${plantId}` },
      // The snapshot composes the entire page-load chain. The body is the
      // server's default (no filter overrides); the FE may then refetch
      // individual panels on user interaction.
      { method: "POST", path: "/api/v1/dashboard/snapshot", body: { plantId } },
    );
  }
  return targets;
}

/** Calendar date in IST (yyyy-mm-dd) — the day the Quality SPC tab opens on. */
function todayInIst() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(
    new Date(),
  );
}

/**
 * The Quality SPC tab's opening requests (Today, all shifts, no filters), in
 * the exact query shape the frontend sends. The widgets board scans every
 * silver SPC table for chart points (~20 s cold); warming it means the first
 * visitor after a cache expiry no longer pays that scan. The silver board
 * cache is keyed without the date, so this also serves any other day's board.
 */
export function spcTargets(date) {
  const query = new URLSearchParams({ plant: "BANMORE", shift: "All", date });
  return [
    { method: "GET", path: `/api/v1/quality/spc/filter-options?${query}` },
    { method: "GET", path: `/api/v1/quality/spc/widgets?${query}` },
  ];
}

async function warmOne(target, baseUrl) {
  // Allow a little more than the upstream's own timeout so a warm request
  // fails on the upstream's terms (and logs its real error) rather than here.
  const signal = AbortSignal.timeout(config.upstream.timeoutMs + 5_000);
  const res = await fetch(`${baseUrl}${target.path}`, {
    method: target.method,
    signal,
    headers: {
      "content-type": "application/json",
      "x-cache-warm": "1",
    },
    body: target.method === "POST" ? JSON.stringify(target.body ?? {}) : undefined,
  });
  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText}`);
  }
  // Drain the body so the socket is released promptly.
  await res.arrayBuffer();
}

/** Fixed-size worker pool. */
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
 * One warm pass. Never rejects: a warm failure must not take down the timer or
 * the process. Individual failures write nothing, so the previous cached value
 * stays live rather than being replaced by an error.
 */
export async function warmCycle({ baseUrl } = {}) {
  if (running) return { skipped: true };
  running = true;
  const startedAt = Date.now();
  const url = baseUrl ?? `http://127.0.0.1:${config.port}`;

  let ok = 0;
  let failed = 0;
  try {
    await loadRecorded();
    const targets = [
      ...staticTargets(),
      ...topRecorded(config.warm.maxRecorded).map((r) => ({
        method: "POST",
        path: r.path,
        body: r.body,
      })),
    ];

    await runPool(
      targets,
      async (target) => {
        try {
          await warmOne(target, url);
          ok++;
        } catch (err) {
          failed++;
          // eslint-disable-next-line no-console
          console.warn(`[warm] ${target.method} ${target.path}: ${err.message}`);
        }
      },
      config.warm.concurrency,
    );

    const durationMs = Date.now() - startedAt;
    recordWarmCycle({ durationMs, targets: targets.length });
    // eslint-disable-next-line no-console
    console.log(
      `[warm] cycle done in ${durationMs}ms — ${ok} ok, ${failed} failed, ${targets.length} targets`,
    );
    return { ok, failed, targets: targets.length, durationMs };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(`[warm] cycle aborted: ${err.message}`);
    return { ok, failed, error: err.message };
  } finally {
    running = false;
  }
}

/** Schedule warming. No-op when disabled. Safe to call once at boot. */
export function startWarmer() {
  if (!config.warm.enabled) {
    // eslint-disable-next-line no-console
    console.log("[warm] disabled (CACHE_WARM_ENABLED=false)");
    return;
  }
  // eslint-disable-next-line no-console
  console.log(
    `[warm] enabled — every ${Math.round(config.warm.intervalMs / 1000)}s for plants: ${config.warm.plants.join(", ")}`,
  );

  const boot = setTimeout(() => {
    warmCycle();
    timer = setInterval(() => warmCycle(), config.warm.intervalMs);
    // Don't hold the event loop open on account of the warmer.
    timer.unref?.();
  }, config.warm.bootDelayMs);
  boot.unref?.();
}

export function stopWarmer() {
  if (timer) clearInterval(timer);
  timer = null;
}
