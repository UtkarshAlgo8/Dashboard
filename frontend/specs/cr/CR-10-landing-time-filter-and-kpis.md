# Change Request: Landing page — time-range filter (Today/Month + custom) + 2 new PlantCard KPIs (Cured Tire Production, Scrap Percentage)

**ID:** CR-10
**Raised by:** Utkarsh (operational review on test/redis-cache)
**Raised on:** 2026-08-21
**Status:** implementing
**Relates to OQR:** adds Q-KPI-02 (landing KPI list expansion), Q-LP-01
(landing preset set diverges from prod), Q-LP-02 (MT derivation for
Cured Tire Production)

## What changes

The Landing page (`/`) gets a time-range filter in `LandingHeader` and
two new per-plant KPI tiles on `PlantCard`:

1. **Time-range filter** in `LandingHeader`.
   - **Visible preset pills**: `Today | Month` (Year dropped from the
     visible row).
   - **Custom-range dialog** still supports arbitrary from/to, including
     Year-long ranges — Year is reachable via custom but not via a
     preset pill.
   - State (`range / from / to`) lives on `LandingPage` and threads
     through `getPlants` (the existing landing-aggregate endpoint).

2. **Cured Tire Production tile** on each `PlantCard`.
   - **NOS** = sum of `Production_product` rows where
     `product_type = "Cured Tyre"`, `section = "Curing"`, all
     machines/SKUs, in the active time window.
   - **MT** = `NOS * AVG_MASS_PER_TIRE_KG / 1000` with a placeholder
     constant of 10 kg/tire (PCR placeholder — see Q-LP-02).
   - Displayed with a small NOS / MT toggle mirroring the production
     dashboard's BATCH / MT pattern.

3. **Scrap Percentage tile** on each `PlantCard`.
   - Numerator = sum of `Scrap` rows for the plant in the active time
     window.
   - Denominator = the Cured Tire Production NOS value above.
   - Formula: `ScrapPct = (Total Scrap / Cured Tire Production NOS) * 100`.
   - When the denominator is 0 the tile shows "—" with an inline
     tooltip explaining the division-by-zero protection.

4. **`getPlants` endpoint** (`backend/src/controllers/static.controller.js`)
   extended to accept `range / from / to` query params and return the
   two new fields per plant: `curedTyreProduction` (number, NOS),
   `scrap` (number, NOS) and `scrapPct` (number, %).

## Why now (what gap surfaced)

Operators visiting the landing page today see only OEE / OTIF / Yield
per plant — no production volume, no scrap signal. A plant's OEE can
look fine while its scrap rate is spiking, or while output is in free
fall against yesterday; the landing page needs both signals at a
glance to triage before clicking into the production dashboard.

The time filter is the prerequisite for either new KPI being useful —
landing aggregates must respect the same daily / monthly / yearly window
the user is currently reading the dashboard against.

## Impact analysis

- **Files affected:**
  - `backend/src/controllers/static.controller.js` — extend
    `landingKpisForPlant(plantId, timeRange)` to compute the three
    new fields and pass them through the merged plant map.
  - `backend/src/routes/static.js` — accept `range / from / to` query
    params on `GET /plants`.
  - `frontend/src/pages/LandingPage.jsx` — own `range / from / to`
    state; pass to `getPlants`; pass `range` down to `LandingHeader`.
  - `frontend/src/components/landing/LandingHeader.jsx` — mount a
    landing-specific time picker (Today/Month pills + custom dialog).
  - `frontend/src/components/landing/PlantCard.jsx` — render 2 new
    tiles; introduce a 2-row KPI layout.
  - `frontend/src/components/production/TimeRangeSelect.jsx` — add a
    `hideYear` prop that omits the Year preset pill (so the landing
    page can reuse the same component without a fork).
  - `frontend/src/api/static.js` — pass `range / from / to` to the
    `getPlants` API call.
  - `frontend/src/lib/mockData.js` — extend the `PLANTS` mock with
    the three new fields (dev-mode shape).
  - `frontend/specs/03-landing-page.md` — Scope + Done-when patch.
  - `frontend/docs/open-questions.md` — Q-KPI-02 / Q-LP-01 / Q-LP-02
    already added in this CR.

- **Specs needing rewrite or revision:**
  - `frontend/specs/03-landing-page.md` — Scope section adds the time
    filter and the 5-tile KPI row. Done-when adds the new
    behaviours.

- **Specs already shipped that are now wrong:**
  - `frontend/specs/03-landing-page.md` lists only 3 headline KPIs and
    no time-filter state.

- **Migrations required:** No.

- **API contract breakage:** **Additive.** `GET /plants` now accepts
  optional `range / from / to`; existing clients (no params) get the
  default-range behaviour unchanged. Response gains three optional
  fields (`curedTyreProduction / scrap / scrapPct`); existing fields
  unchanged.

- **Frontend reuse-library impact:** None. `TimeRangeSelect` lives in
  `src/components/production/`; the new `hideYear` prop is local and
  doesn't touch `src/components/common/`.

- **Auth or data-model touchpoints:** None.

- **Blast radius:** YELLOW — touches landing page + one backend
  endpoint. No cross-cutting concerns.

## Decision

```
[x] Take now      - shipped on test/redis-cache
[ ] Queue
[ ] Defer
[ ] Reject
```

**Decided by:** Utkarsh
**Decided on:** 2026-08-21

## Implementation plan

### Sketch

1. **Backend `static.controller.js`**:
   - Accept `range / from / to` from `req.query` in `getPlants`.
   - Extend `landingKpisForPlant(plantId, timeRange)`:
     - Resolve the time window via `presetToDateRange` (or inline)
       to `{ from, to, granularity }`.
     - Query `Production_product` rows where `section = "Curing"` and
       `product_type = "Cured Tyre"`, all machines/SKUs, in window;
       sum `actual_value` for `curedTyreProduction`.
     - Query `Scrap` rows for the plant in window; sum for `scrap`.
     - Compute `scrapPct` with zero-guard.
     - Compute MT = `curedTyreProduction * AVG_MASS_PER_TIRE_KG / 1000`
       (placeholder constant in `lib/constants.js` or similar).
2. **Backend `routes/static.js`**: add `range / from / to` to the
   `/plants` route.
3. **Frontend `api/static.js`** (or wherever `getPlants` is defined):
   accept `range / from / to` and forward as query params.
4. **`LandingPage.jsx`**: add `const [range, setRange] = useState("today")`,
   `const [from, setFrom] = useState("")`, `const [to, setTo] = useState("")`.
   Pass to `getPlants({ range, from, to })`. Pass `range` down to
   `LandingHeader`.
5. **`LandingHeader.jsx`**: render a `TimeRangeSelect` with
   `hideYear={true}` (or a thin `LandingTimeRangeSelect` wrapper
   that pre-binds the prop).
6. **`TimeRangeSelect.jsx`**: add `hideYear` prop; filter `PRESETS`
   before rendering when `true`.
7. **`PlantCard.jsx`**: add 2 new tiles. Layout shifts to a 2-row KPI
   grid (3 + 2 or 2 + 3) — to be confirmed with a quick visual
   pass after the tiles render. The new Cured Tire Production tile
   shows NOS or MT with a small toggle pill (state local to PlantCard).
8. **`mockData.js`**: extend each `PLANTS` entry with placeholder
   values for the 3 new fields so dev mode renders meaningfully.

### Out of scope (deliberately)

- Migrating other landing KPIs (OEE / OTIF / Yield) to time-filter
  awareness. They stay "current snapshot" for now — Cured Tire
  Production and Scrap % are the user's specific request.
- Adding a "Year" preset pill to the landing page. Year is reachable
  via the custom dialog only.
- Per-plant MT override (one avg-mass-for-all-plants is fine for
  Phase 1; revisit in Q-LP-02's resolution).
- Tests (per `frontend/CLAUDE.md` "Do not write tests unless
  explicitly asked.").

## Done when

- `GET /plants?range=today` returns each plant with
  `curedTyreProduction / scrap / scrapPct` populated (and the existing
  three unchanged).
- Landing page renders the time picker in the header; clicking Today /
  Month updates the KPIs immediately; opening "Filter Date" lets the
  user pick a Year-long custom range.
- PlantCard shows 5 KPI tiles, with the 2 new ones (Cured Tire
  Production, Scrap Percentage) computing per the formula above.
- Scrap Percentage shows "—" with a tooltip when Cured Tire
  Production is 0 in the selected window.
- `npm run check` exits zero on all touched files; backend builds
  clean.
- `specs/03-landing-page.md` Scope + Done-when patched.
- Conventional commit: `feat(frontend+backend): landing page time
  filter + Cured Tire Production + Scrap Percentage (CR-10)`.
