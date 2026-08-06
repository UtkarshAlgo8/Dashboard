# JK Dashboard — Architecture & End-to-End Flow

Plant operations dashboard for JK Tyres. Phase 1 scope: **Banmore** plant,
**Production** function (+ an additive **Quality Head** dashboard).

This document covers:

1. [High-Level Architecture](#1-high-level-architecture)
2. [Low-Level Architecture — Backend](#2-low-level-architecture--backend)
3. [Low-Level Architecture — Frontend](#3-low-level-architecture--frontend)
4. [Data Model — the Gold Layer](#4-data-model--the-gold-layer)
5. [End-to-End Flows](#5-end-to-end-flows)
6. [Cross-Cutting Concerns](#6-cross-cutting-concerns)
7. [Deployment & Environments](#7-deployment--environments)
8. [Key Design Decisions](#8-key-design-decisions)

Source of truth for requirements: [docs/brd.docx](brd.docx),
[frontend/specs/](../frontend/specs/), and the change ledgers
[realdata.md](../realdata.md), [changes.md](../changes.md),
[new_change.md](../new_change.md).

---

## 1. High-Level Architecture

### 1.1 System context

```
┌──────────────┐   HTTPS/JSON      ┌───────────────────┐   HTTPS/JSON+SQL   ┌──────────────────┐
│   Browser    │ ────────────────▶ │  Node/Express BFF │ ─────────────────▶ │  AWS Data API    │
│  React SPA   │ ◀──────────────── │   (backend/)      │ ◀───────────────── │  (API Gateway +  │
│ (frontend/)  │   {data:…} env.   │  port 3001/8814   │  {columns, rows}   │   Lambda)        │
└──────────────┘                   └───────────────────┘                    └────────┬─────────┘
       │                                    │                                        │
       │ new tab                            │ QUALITY_DATA_SOURCE=excel              │ engine=athena
       ▼                                    ▼                                        ▼
┌──────────────┐                   ┌───────────────────┐                    ┌──────────────────┐
│  Streamlit   │                   │ backend/data/*.xlsx│                   │  Athena → S3     │
│  Inventory   │                   │  (alasql in-proc)  │                   │  `gold.gold`     │
│  app :8599   │                   └───────────────────┘                    └──────────────────┘
└──────────────┘
```

There is **no application database**. The backend is a stateless
**Backend-For-Frontend (BFF)**: it builds read-only SQL, sends it to an
upstream query API, and reshapes the result rows into UI-ready payloads.

### 1.2 Layered view

| Layer | Tech | Responsibility |
|---|---|---|
| Presentation | React 19 + Vite 8 + MUI 6 + Highcharts 12 | Routing, pages, KPI grid, drill panels, charts, PDF/CSV export |
| Client data | axios + `usePolledQuery` / `useDashboardFetch` + in-module caches | Fetch, dedupe, TTL-cache, transform raw rows → card/panel shapes |
| API | Express 4 (ESM, Node ≥ 20) | Routing, validation, CORS, envelope + error mapping |
| Domain | `queries/` + `utils/transformers.js` + `quality/spc/engine.js` | SQL builders, row → payload transformers, SPC/Nelson rules |
| Integration | `utils/upstream.js`, `quality/datasource/*` | The **only** modules that talk to a data source |
| Data | Athena `gold.gold` (Production), Excel/alasql or Athena (Quality) | Pre-aggregated "gold layer" fact table |

### 1.3 Repo layout

```
JK-Dashboard-Full/
├── backend/          Express BFF
│   ├── src/{app,index,config}.js
│   ├── src/{routes,controllers,queries,utils,middlewares}/
│   ├── src/quality/  Quality vertical (own routes/controllers/queries/datasource)
│   └── data/         Quality reference workbook + parsed cache
├── frontend/         React SPA
│   ├── src/{pages,components,api,hooks,lib}/
│   ├── specs/        Feature specs + change requests (CR-05, CR-07…)
│   └── docs/         api-contract.md, architecture.md, roadmap.md
├── docs/             BRD, KPI map reference, this file
├── dev.sh            Local launcher (BE watch + Vite HMR)
└── deploy-dev.sh     Server deploy (Docker, both services)
```

---

## 2. Low-Level Architecture — Backend

### 2.1 Boot & assembly

- [src/index.js](../backend/src/index.js) — binds the port only.
- [src/app.js](../backend/src/app.js) — assembles middleware + routers, exported
  so tests can mount it on an ephemeral port.
- [src/config.js](../backend/src/config.js) — loads `.env.local` then `.env`,
  **fails fast** on missing `AWS_DATA_URL` / `AWS_DATA_API_KEY`.

Middleware order: `cors → express.json → requestLogger → routes → notFound → errorHandler`.

### 2.2 Request pipeline

```
HTTP request
   │
   ▼  routes/*.js            thin — only wires paths to controllers
   ▼  controllers/*.js       validate → build cache key → build SQL → run → transform → res.json
   │        │
   │        ├─▶ utils/cache.js         cached(key, loader, ttl)  ── hit ──▶ return
   │        │                                                    ── miss ─▶
   │        ├─▶ queries/*.js           pure SQL string builders (escapeLiteral on every literal)
   │        ├─▶ utils/upstream.js      POST {engine, sql, tables} + x-api-key
   │        └─▶ utils/transformers.js  rows → frontend payload
   ▼
{ "data": … }   or   { "error": { code, message, details } }
```

### 2.3 API surface

Base path `**/api/v1**`. Every success is `{"data": …}`; every failure is
`{"error": {code, message}}` (see [frontend/docs/api-contract.md](../frontend/docs/api-contract.md)).

| Group | Endpoint | Purpose |
|---|---|---|
| Health | `GET /health` | Liveness |
| Static | `GET /plants`, `/functions`, `/sections`, `/category-tabs` | Landing + shell lookups |
| Plant | `GET /plants/:id`, `/:id/summary`, `/:id/as-of`, `/:id/section-oee` | Header, summary card, data-freshness anchor |
| KPI grid (legacy) | `GET /plants/:id/production/kpis` | Pre-v2 KPI route |
| Trends | `GET /plants/:id/production/trends` | Trend-modal series |
| Drills (legacy) | `GET /plants/:id/production/drills/{oee,production,downtime,plan-compliance,scrap-traceability}` | Dedicated drill payloads |
| Inventory | `GET /plants/:id/inventory` | Stock-level bars + item table |
| Anomalies | `GET /plants/:id/anomalies` | Anomaly feed |
| **Dashboard (v2)** | `POST /dashboard/kpi-data` | **Universal** KPI + drill fetch |
| | `POST /dashboard/product-options`, `POST /dashboard/shift-comparison` | Product pills, shift box |
| | `GET /dashboard/vocab`, `GET /dashboard/anchors` | Allowed values; per-KPI latest date |
| Quality — Process | `GET /quality/process/{summary,kpi-value,kpi-value-batch,kpi-children,kpi-history}` | Quality Head Process tab |
| Quality — SPC | `GET /quality/spc/{summary,filter-options,widgets,detail,histogram-observations,point-observations}` | Cp/Cpk control charts |

Mount order matters: `staticRouter` is mounted on `/api/v1` **first** so
`/plants` (the list) is not shadowed by `/plants/:id`.

### 2.4 The universal query builder

[src/queries/dashboard-query.js](../backend/src/queries/dashboard-query.js)
(~1200 lines) is the heart of the v2 backend. Every dashboard request is one
of two SQL shapes:

- **Shape A — Landing** (`drillKpis === null`)
  `WHERE <context> AND drill_down_level = 1`
- **Shape B — Drill** (`drillKpis` is an array)
  `WHERE <context> AND <parentFilters> AND kpi_name IN (drillKpis)`

Guard rails encoded in the builder:

- `plant` and `department` are **forced server-side** to `BANMORE` /
  `production`; sending them from the client is a validation error. This
  prevents BTP data and the Quality department (SPC rows) from leaking into
  Production views.
- Allow-lists: `ALLOWED_SECTIONS` (Mixing/TBM/Curing/Stock),
  `ALLOWED_CATEGORIES` (Productivity/Quality/Inventory),
  `ALLOWED_GRANULARITIES` (DAY/MONTH/SHIFT A|B|C), `ALLOWED_TYRE_TYPES`.
  Anything outside → `QueryValidationError` → HTTP 400.
- `PRODUCT_AGNOSTIC_KPIS` — OEE/Availability/Performance/Quality and the
  OEE-loss reasons are recorded against the *machine*, not a product, so they
  are exempted from the `product_type` predicate.
- `PRODUCT_SPLIT_KPIS` — KPIs (e.g. `Production_m`) that store both the
  aggregate row *and* its per-product children; `product_type` must be pinned
  to exactly one value or the total doubles.
- `DATE_YYYYMMDD` — a format-robust `CASE` expression producing a sortable
  `YYYYMMDD` key, because `date` may arrive as ISO `yyyy-mm-dd` or `DD-MM-YYYY`
  and lexicographic ranges over `DD-MM-YYYY` are wrong.
- `previousWindow(timeScope, granularity)` — derives the **baseline** window
  (previous complete month / preceding equal-length range) so delta % has a
  like-for-like comparison instead of "whatever row came second".

### 2.5 Upstream integration

[src/utils/upstream.js](../backend/src/utils/upstream.js) is the single egress point.

```
POST <AWS_DATA_URL>
  headers: { x-api-key, content-type: application/json }
  body:    { engine: "athena" | "databricks", sql, tables: [AWS_DATA_TABLE] }

success → { columns: [...], rows: [...] }      rows may be objects OR positional arrays
error   → { status: "ERROR", type, message }
```

Behaviour:

- **Read-only guard** — rejects anything not starting with `SELECT`/`WITH` (400).
- **Timeout** — `AbortController` at `AWS_DATA_TIMEOUT_MS` (30 s) → `504 UPSTREAM_TIMEOUT`.
- **Lambda-proxy unwrap** — if the payload nests a JSON string in `body`, parse it.
- **Row normalisation** — positional arrays are zipped with `columns`, so
  transformers always see one row shape.
- Failures throw `UpstreamError`, which `errorHandler` maps to 502/504 envelopes.

### 2.6 Caching

[src/utils/cache.js](../backend/src/utils/cache.js) — in-memory `Map`, cleared on
process restart, with **in-flight de-duplication** (`pending` map) so a
thundering herd collapses to one upstream call.

| Bucket | TTL |
|---|---|
| `KPI_ROWS` | 2 min |
| `PRODUCT_OPTIONS`, `ANCHORS`, `AS_OF` | 15 min |
| `STATIC_LOOKUPS` | 30 min |
| `QUALITY_PROCESS` | 5 min |

`buildCacheKey` JSON-stringifies object values — a past bug had `${obj}`
collapse every section/category onto one key and serve the wrong section's data.

### 2.7 The Quality vertical

`backend/src/quality/` is a self-contained slice with its own
routes → controllers → queries → transformers, plus a **pluggable data source**:

```
quality/datasource/index.js        ← the switch (QUALITY_DATA_SOURCE)
   ├── excelSource.js   → alasql over backend/data/Quality_Dashboard_Gold_Layer_3Months.xlsx
   │                      (loadExcel.js parses once, disk-caches to .quality_gold.cache.json)
   └── dbSource.js      → re-exports utils/upstream.runQuery  (identical SQL, remote engine)
```

The **same SQL strings** run in both modes; only the executor changes. This is
what lets Quality ship before its gold table exists.

`quality/spc/engine.js` adds the only computed layers: **Nelson-rule
evaluation** and the alerts derived from it. Limits, bins, curve, mean and σ
are read verbatim from the stored `plot_data` JSON — nothing statistical is
recomputed.

---

## 3. Low-Level Architecture — Frontend

### 3.1 Shell & routing

```
main.jsx → App.jsx
             ThemeProvider (theme.js) → CssBaseline → PrintStyles → ToastProvider → RouterProvider
                                                                                        │
router.jsx ─┬─ "/"                     LandingPage
            ├─ "/:plantId/production"  BanmoreProduction
            ├─ "/banmore/production"   BanmoreProduction
            └─ "/banmore/quality"      BanmoreQuality → pages/quality/QualityDashboard
```

Alias `@` → `frontend/src` (Vite + jsconfig).

### 3.2 Directory responsibilities

| Path | Role |
|---|---|
| `src/api/` | One module per resource (`plants`, `kpis`, `drills`, `trends`, `inventory`, `anomalies`, `dashboard`, `quality`) over a shared axios `client` |
| `src/hooks/` | `usePolledQuery` (generic fetch/poll/cache), `useDashboardFetch` (v2 dashboard state machine) |
| `src/lib/` | Pure logic: `kpi-transformer` (1.7k lines), `dashboardRowScopes`, `timeRange`, `drillDate`, `units`, `dateFormat`, `csv`, `exportPdf`, `indiaMap`, `labelMaps`, `mockData` |
| `src/components/production/` | Header, sidebar, category tabs, KPI grid/card, shift-comparison, time-range select, sparkline |
| `src/components/drills/` | Per-domain drill panels (`oee/`, `production/`, `quality/`, `downtime/`, `safety/`, `morale/`, `cost/`, `plan-compliance/`, `generic/`, `shared/`) |
| `src/components/trend/` | Highcharts wrappers + `TrendModal`, `pickChartType` |
| `src/components/landing/` | Plant cards, India map, function modal, skeleton |
| `src/components/inventory/` | Inventory bars, daily/item tables (plus a CTA opening the Streamlit app at `http://10.200.203.239:8599/` in a new tab) |
| `src/components/common/` | PageHeader/Container, dialogs, toasts, empty/loading states, print styles |

### 3.3 API client contract

[src/api/client.js](../frontend/src/api/client.js) — one axios instance,
`baseURL = VITE_API_BASE_URL`, with a response interceptor that:

- unwraps `{data: …}` → the payload directly;
- **except** when the caller passes `{ rawEnvelope: true }`, which is required
  for `/dashboard/kpi-data` because the siblings `truncated`, `baseline`,
  `baselineWindow` would otherwise be discarded;
- converts `{error:{code,message,details}}` into an `Error` carrying `.code`,
  `.details`, `.status`.

### 3.4 `usePolledQuery`

Vanilla-React fetch hook (no React Query). Options: `interval` (0 = fetch once),
`deps`, `enabled`, `keepPreviousData`, `cacheKey` + `staleTime`
(stale-while-revalidate), plus a token guard that drops results from stale
in-flight requests. Module-level `queryCache` / `pendingQueries` dedupe across
components.

### 3.5 `useDashboardFetch` — the v2 state machine

This hook owns *all* dashboard state so the drill chain survives filter changes.

**State**: `section, subSection, productType, unitOfMeasurement, category,
granularity, mode ("snapshot" | "aggregate"), date | from/to, userWindow,
drillKpis, drillSourceKpiId, drillDate, parentFilters`.

**Reducer actions**: `SET_FILTER` (optionally `resetDrill`), `SET_DRILL`,
`RESET_DRILL`, `RESET_ALL`. Rules: changing section/category resets the drill
but **preserves** the time window; changing granularity/date preserves the drill.

**Two payloads per render**:

| | Landing | Drill |
|---|---|---|
| When | always (gated on a resolved date window) | only when `drillKpis` is set |
| Body | `{plantId, context, date|from/to, drillKpis:null*, limit:10000, withBaseline?}` | `{…, drillKpis, parentFilters, drillOnly:true, limit:10000}` |

\* except TBM/Curing, which additionally request `Production_product` by name.

**Pipeline**:

```
landingPayload / drillPayload
   └─▶ fetchCachedDashboard      module cache: 2 min TTL, 80 entries, in-flight dedupe
         └─▶ fetchPagedDashboard drillOnly → pages by offset until !truncated (≤20 pages)
               └─▶ fetchDashboard  POST /dashboard/kpi-data {rawEnvelope:true}
                     └─▶ coerceMeasures  Athena returns everything as strings;
                                          actual_value/threshold_value → number|null
   ▼
landingRows (+ drillRows when drilled)
   └─▶ toKpiGrid(rows, {section, category, granularity, mode, productType,
                        unitOfMeasurement, drilledKpiId, anchors, useAnchors,
                        partialDays, baselineRows, baselineWindow, truncated})
   └─▶ toDrillRows(rows)
```

It also **prefetches** the drill payloads for the first three drillable cards,
so opening a drill is usually instant.

**Anchors** (`GET /dashboard/anchors`, fetched once and memoised in
`api/dashboard.js`): a `"<section>|<kpi_name>" → yyyy-mm-dd` map of each KPI's
own newest DAY. Cards anchor to their own latest date rather than a single
global one — Production data runs to 20 Jul while OEE ends 16–17 Jul, so a
global date would blank every OEE card. `partialDays` marks a section's latest
day as still in progress so an artefactual spike is suppressed. Anchors apply
to the **default** view only; an explicit user date/range always wins.

### 3.6 `kpi-transformer.js`

The largest piece of client logic. It maps raw gold rows to the `KpiCard`
shape, mirroring `docs/artifact.jsx` for IDs, names, drill types and section
keys — only the *values* come from the data. It handles:

- empty sentinels (`""`, `"nan"`, `"null"` are all null);
- canonical spellings (`Sidewall`→`SideWall`, `3 Roll`/`Three Roll`);
- unit aliases (`Meters`→`M`, `NUM`→`NOS`) and KG→tonnes display;
- granularity synonyms (`Daily`→`DAY`, `MTD`/`Monthly`→`MONTH`);
- snapshot (latest row wins) vs aggregate (roll up daily rows over a range);
- product-agnostic KPI fallback (prefer the product-matching row, else the
  line-level value);
- delta vs `baselineRows` with the `baselineWindow` label.

---

## 4. Data Model — the Gold Layer

One pre-aggregated fact table (`gold.gold` on Athena). One row = one KPI
measurement at one (plant, section, kpi_name, date, granularity).

| Column | Notes |
|---|---|
| `record_id` | ignored in Phase 1 |
| `date` | ISO `yyyy-mm-dd` (real) / `DD-MM-YYYY` (legacy) — always normalised via `DATE_YYYYMMDD` |
| `plant`, `department` | forced to BANMORE / production server-side |
| `section`, `sub_section` | Mixing, TBM, Curing, Stock (Final Finish / TUO & DBM excluded) |
| `tyre_type`, `machine`, `product_type`, `itemcode` | drill dimensions |
| `granularity` | `DAY`, `MONTH`, `SHIFT A|B|C` |
| `category` | `Productivity`, `Quality`, `Inventory` |
| `kpi_name` | verbatim, e.g. `OEE_o`, `Production_m`, `Availability_s` |
| `unit_of_measurement` | KG / Batch / M / NOS — **never combined across units** |
| `drill_down_level` | `1` = landing card, `2` = leaf |
| `drill_down_attribute` | JSON-encoded string read by drill panels |
| `actual_value`, `previous_value`, `threshold_value`, `status`, `remarks` | measures + RAG |

**Sentinels**: missing values arrive as the literal strings `"nan"` / `"null"`
or `""`, never SQL `NULL`. Both backend (`emptyColumnPredicate`,
`isEmptyValue`) and frontend (`EMPTY_TOKENS`) treat all three as empty.

> Known data quirk (recorded in memory): OEE rows store `drill_down_level` as
> `'1.0'` rather than `'1'`, which breaks a naive landing-grid filter.

---

## 5. End-to-End Flows

### 5.1 Landing page → plant selection

```
GET /api/v1/plants      ──▶ static.controller.getPlants ──▶ (cached) upstream ──▶ plant list
GET /api/v1/functions   ──▶ static list (Production, Quality, Engineering, …)
   ▼
PlantCardList + IndiaMap  (Banmore & Chennai active in Phase 1)
   ▼ click plant
PlantFunctionModal  → "prod" → navigate /:plantId/production
                    → "qual" (Banmore only) → navigate /banmore/quality
                    → others render a "SOON" pill
```

### 5.2 Production dashboard — first paint

```
BanmoreProduction mounts
 ├ GET /plants/:id            header
 ├ GET /sections              sidebar        (staleTime 30 min)
 ├ GET /category-tabs         tabs           (staleTime 30 min)
 ├ GET /plants/:id/as-of      data-freshness anchor (staleTime 15 min)
 ├ GET /dashboard/anchors     per-KPI latest day + partial days
 └ useDashboardFetch()
       │ waits until a date window resolves (as-of + preset → from/to or date)
       ▼
    POST /dashboard/kpi-data  { context:{section:"Mixing", category:"Productivity",
                                         granularity:"DAY"}, from, to, limit:10000 }
       ▼ backend
    validate → buildFetchQuery (Shape A) → cache lookup → upstream Athena → rows (+baseline)
       ▼ frontend
    coerceMeasures → toKpiGrid → KpiGrid renders 4 KPI cards (value, delta, RAG, sparkline)
```

Skeletons (`ProductionBodySkeleton`, `KpiCardSkeleton`, `JKLoader`) cover the
gap; `lastUpdatedAt` comes from a `fetchedAt` stamped on the envelope, so a
cache hit correctly reports the *original* fetch time.

### 5.3 Drill-down

```
User clicks a KPI card
   ▼ drillInto(kpi.drillTargets, kpi.id, parentFilters, kpi.resolvedDate)
SET_DRILL → drillKpis set, drillDate inherits the CARD's already-resolved date
   ▼
POST /dashboard/kpi-data { context{…,granularity}, date: <card date>,
                           drillKpis:[…], parentFilters:{machine|itemcode},
                           drillOnly:true, limit:10000 }
   ▼ backend  Shape B: kpi_name IN (drillKpis) AND parent filters
   ▼ frontend fetchPagedDashboard loops on `truncated` until all pages are in
   ▼ toDrillRows → router in BanmoreProduction picks the panel:
        OEE            → OeeDrillPanel  (→ MachineTable → SubDrill → ScrapTraceabilityPanel)
        Production     → ProductionDrillPanel (owns its own paginated per-lens fetch)
        Downtime       → DowntimeDrillPanel
        Scrap/Rework   → ScrapReworkDrillPanel
        everything else→ GenericTableDrillPanel / GenericDrillPanel
```

Granularity inheritance: the drill uses the card's granularity (Shift B card →
Shift B machine rows), except Productivity + MONTH, which drills at `DAY`.

### 5.4 Trend modal

Clicking the trend icon on a card opens `TrendModal` → `GET
/plants/:id/production/trends` → `pickChartType` selects line/bar/progress →
Highcharts renders with `ChartLegend`.

### 5.5 Inventory

`GET /plants/:id/inventory` reads `category='Inventory'` rows:
`kpi_name='Inventory'` → one bar per `product_type`;
`kpi_name='Inventory_item'` → item-level table. Inventory is a **stock level**,
never summed or averaged over a range — a custom range clamps the data and the
transformer takes the latest in-range day (the balance *as of* the range end).
A CTA button opens the external Streamlit inventory app in a new tab.

### 5.6 Quality Head dashboard

```
/banmore/quality → BanmoreQuality → QualityDashboard (Process | Product | Customer Complaint | SPC)

Process tab
  GET /quality/process/summary      ?date&shift
  GET /quality/process/kpi-value(-batch)
  GET /quality/process/kpi-children ?kpiNames&date&shift&section
  GET /quality/process/kpi-history  ?kpiName&dateFrom&dateTo&…

SPC tab
  GET /quality/spc/filter-options ?date        → machines, recipes, product types
  GET /quality/spc/summary        ?date&machine
  GET /quality/spc/widgets        ?date&machine&recipe&headline_status
  GET /quality/spc/detail         ?date&shift&machine&recipe&parameter
  GET /quality/spc/{histogram,point}-observations
```

Every SPC request first **resolves a snapshot** (latest snapshot date ≤ the
requested date) and echoes `snapshot_date` back in a `context` object. A combo
is `machine × recipe × parameter`; `kpi_name` parses as `<parameter> <metric>`
where metric ∈ {Cp, Cpk, Pp, Ppk} (last-token rule — spacing is inconsistent).
Headline status: Critical > Warning > Healthy, with `Insufficient Data` only
when all four metrics are.

The workbook covers 2026-04-01 → 2026-06-30, so the UI opens on the FRD base
date `2026-06-10` rather than real "today".

---

## 6. Cross-Cutting Concerns

### Security
- The upstream API key lives **only** in `utils/upstream.js`; it never reaches
  the browser.
- Read-only guard: SELECT/WITH only, enforced both in the BFF and in the
  upstream Lambda (defence in depth).
- Every SQL literal goes through `escapeLiteral`; dimension values are
  additionally allow-listed and rejected at the route layer.
- CORS: `FRONTEND_ORIGIN` may be a comma-separated allow-list; any
  `localhost`/`127.0.0.1` origin is accepted in dev regardless of port.
- No auth layer in Phase 1 — the user menu renders a mock user.

### Error handling
`UpstreamError` → its own status (502/504); `QueryValidationError` → 400;
anything else → 500 `INTERNAL_ERROR` with the detail logged, not returned.
`notFound` produces a 404 envelope naming the method and URL.

### Truncation honesty
The row cap is a real risk (Curing 1–17 Jul unfiltered ≈ 55 k rows). The
backend requests `limit + 1`, and if the probe row comes back it trims it and
sets `truncated: true`. The frontend must never present a truncated total as
final; drill fetches page until the flag clears.

### Testing
`node --test` on the backend: [test/routes.test.js](../backend/test/routes.test.js),
[test/acceptance.test.js](../backend/test/acceptance.test.js),
[queries/dashboard-query.test.js](../backend/src/queries/dashboard-query.test.js),
[quality/spc.test.js](../backend/src/quality/spc.test.js),
[quality/quality.test.js](../backend/src/quality/quality.test.js).
Frontend: ESLint + Prettier + `scripts/check.sh` (no unit-test runner yet).

### Export
`lib/exportPdf.js` (html2canvas + jsPDF) captures the whole page — the layout
temporarily releases its `100vh` clamp so nothing is split; `lib/csv.js` handles
table export.

---

## 7. Deployment & Environments

### Local

```bash
./dev.sh     # backend: node --watch :3001   frontend: vite :5173
             # forces VITE_API_BASE_URL=http://localhost:3001/api/v1
```

### Server (Docker)

```bash
./deploy-dev.sh                            # branch dev-quality
DEPLOY_BRANCH=utkarsh/dev ./deploy-dev.sh
```

Pulls once, then for each side: stop → rm container → rmi image → build → `docker run --restart always`.

| Service | Image / container | Port | Notes |
|---|---|---|---|
| Backend | `jk-dashboard-backend` | 8814 | `node:20-slim`, `npm install --omit=dev`, `npm start` |
| Frontend | `jk-dashboard-frontend` | 3014 | multi-stage: Vite build (`--build-arg VITE_API_BASE_URL`) → `nginx:alpine`, SPA fallback `try_files $uri /index.html` |

`VITE_API_BASE_URL` is **baked in at build time** — changing the API URL
requires a frontend rebuild, not just a restart.

### Environment variables

**Backend** — `AWS_DATA_URL`*, `AWS_DATA_API_KEY`*, `AWS_DATA_ENGINE`
(`athena`|`databricks`), `AWS_DATA_TABLE`, `AWS_DATA_SQL_TABLE` (`gold.gold`),
`AWS_DATA_TIMEOUT_MS`, `PORT`, `FRONTEND_ORIGIN`, `CACHE_TTL_MS`,
`QUALITY_DATA_SOURCE` (`excel`|`db`), `QUALITY_EXCEL_PATH`,
`QUALITY_EXCEL_SHEET`, `QUALITY_EXCEL_CACHE_PATH`, `QUALITY_SQL_TABLE`.
(* required — boot fails without them.)

**Frontend** — `VITE_API_BASE_URL`, `VITE_USE_MOCK_DATA`.

---

## 8. Key Design Decisions

| Decision | Rationale |
|---|---|
| BFF over direct client→Athena | Keeps the API key server-side, centralises SQL/allow-lists, enables caching and row-shape normalisation |
| No application database | The gold layer is already pre-aggregated; a second store would only add sync risk |
| One universal `POST /dashboard/kpi-data` | Every card and drill is the same two SQL shapes; one endpoint replaced a growing set of bespoke routes (CR-07/CR-08) |
| Server-side `section` + `category` filtering | "Fetch all, filter client-side" blew the upstream row cap and silently dropped KPI rows |
| Per-KPI anchors instead of one global date | KPI families lag each other by days; a global date blanks the laggards |
| Explicit `baseline` window from the server | Month/range cards need rows the main fetch never requests; deriving a delta from "the second row" was wrong |
| `truncated` flag surfaced to the UI | A partial total that looks complete is worse than an explicit warning |
| Pluggable Quality data source (excel/db) | Ships the Quality dashboard before its gold table exists, with byte-identical SQL on both sides |
| Vanilla `usePolledQuery` over React Query | Small, explicit dependency surface; polling was the only requirement (Q-DATA-01) |
| Force `plant`/`department` server-side | Prevents BTP and SPC (department = Quality) rows from ever leaking into Production views |

---

*Generated from the source tree on branch `dev-ctp`. Regenerate when the route
table, the query builder's allow-lists, or the deployment topology change.*
