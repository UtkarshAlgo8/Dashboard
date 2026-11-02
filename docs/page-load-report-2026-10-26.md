# Page Load Report — Test VM

- **Environment:** http://136.112.107.154:3015 (branch `test/redis-cache`)
- **Date measured:** 2026-10-26
- **Method:** Chrome, real navigations. "Ready" = last API response received + "Please wait" loader gone. Single run per page — treat as indicative.

The page shell paints in 0.1–0.7s everywhere. All the delay is data.

## Per page

| Page | First load | Second load | Slowest calls |
|---|---|---|---|
| **Landing `/`** | 14.1s | 11.7s | `/plants?range=today` took 11.1s, then 10.4s. Both plant cards show "0 NOS". |
| **Chennai Production** | **43.5s** | 5.5s | `kpi-data` up to 31.8s, `/plants/chennai/summary` 21.7s, `section-oee` 19.6s. Even `/mail/scheduler-adherence/preview` took 14.4s. |
| ↳ Quality tab | 19.8s | — | 3 × `kpi-data` (11–20s) |
| ↳ Inventory tab | 13.5s | — | `/plants/chennai/inventory/master` 13.4s |
| **Banmore Engineering** | 9.5s | — | `/engineering/reliability/summary` 5.2s, `loss-tree` 3.2s. Page JS chunk (161 KB) took 2.7s. Reliability tab instant. |
| **Banmore Production** | 3.6s | 8.6s | 17–20 calls, 5 × `kpi-data` at 2.5–5.8s each |
| **Banmore Quality** (Process) | 4.5s | — | `/quality/as-of` 1.3s |
| ↳ Product tab | 6.2s | — | `/quality/product/history` 6.1s, `kpi-data` 5.2s, `/quality/product/summary` 4.8s |
| ↳ SPC / back to Process | 5.6s / 4.7s | — | Revisiting an already-opened tab is instant |
| **Banmore Technical** (Overview) | 4.3s | — | Every card shows NA |
| ↳ Building | 6.2s | — | 14 calls, one `kpi-data` took 11.5s |
| ↳ Curing / Stock / Uniformity | 4.0 / 2.7 / 0.6s | — | `kpi-data` |
| ↳ TTC, SRT, Mould Shop, NPI, Analysis | instant | — | No API calls; all NA |
| ↳ Inventory | instant | — | "Inventory not configured" |

## What takes the longest

### 1. `/dashboard/kpi-data` — the main bottleneck
Production, Technical and Chennai all depend on it; each call takes 2–30s. Every uncached request goes to the upstream query service, and the date filter is a `CAST`/`SUBSTRING` expression on the date column (`backend/src/queries/sql-date.js:24`). That form usually can't use partitions, so each query likely scans far more rows than needed. **Not confirmed on the upstream side.**

### 2. Landing pays ~10s on every visit
`backend/src/controllers/static.controller.js:421-425` deliberately leaves the time-aware production/scrap numbers uncached ("cheap query"), but they take ~10s — for cards showing 0. Caching per range for 30–60s would remove most of the landing time. **Easiest fix on the list.**

### 3. Cold loads overload the backend
Chennai fires ~21 requests at once on a cold start; trivial endpoints then take 14s. Requests from the previous tab keep running after a tab switch (a `kpi-data` call was still in flight 25s later). Cancelling in-flight requests on tab change would cut wasted load.

### 4. Cache is inconsistent
Chennai: 43.5s → 5.5s on second load (cache works). Banmore Production got *slower* on second load (3.6s → 8.6s), `kpi-data` still 3–6s — some `kpi-data` requests seem to miss the cache. Verify via `/admin/cache/stats` (needs admin login).

### 5. Startup runs sequentially
`/auth/current-user` (0.6–0.9s) → lazy page JS chunk → data. These could overlap (prefetch the chunk during auth). Note 0.3–0.9s for a trivial call means base latency to the VM is itself high.

### 6. Smaller items
- Banmore Production downloads a 419 KB `curing-sku-fulfilment.json`.
- Quality tabs fetch only on first click; nothing is prefetched.

## Caveats
- **Login:** reloading `/banmore/production` once redirected to `/login`. Refresh-token handling may need a look.
- **Cache state was not controlled.** Banmore Production's "first load" came right after it had been opened, so it may have been partly warm.
- **Not timed:** section switches inside Productivity (Tyre Building, Stock, Mixing) made no new API calls.

## Next steps (to work on)
- [ ] Cache landing time-aware KPIs (`getPlants`) with a short TTL keyed by range
- [ ] Investigate `kpi-data` cache misses on Banmore Production (check `/admin/cache/stats`)
- [ ] Check whether the upstream date predicate prevents partition pruning
- [ ] Abort in-flight requests on tab/section change
- [ ] Prefetch lazy page chunks in parallel with `/auth/current-user`
- [ ] Look into the reload → login redirect (refresh token)
