# Spec: mock-data-layer

**Phase:** 1
**Route:** N/A (infrastructure)
**Status:** ready
**Blast radius:** YELLOW — one feature; touches `src/api/`, `src/lib/`, `src/hooks/`

## Prerequisites
- Spec 01 (app-shell) — landed; theme + providers mounted

## Context

- CLAUDE.md
- conventions.md
- docs/api-contract.md (target shape — DRAFT-DEFERRED but the dummy
  modules mimic it)
- docs/architecture.md#data-flow (Phase 1 mock + 60s polling)
- docs/open-questions.md (Q-BE-01, Q-DATA-01, Q-KPI-01 — all RESOLVED)
- docs/artifact.jsx (data shapes for PLANTS, FUNCTIONS, KPI sets)
- src/components/common/useToast.js (toast for error surfacing)
- .env.example (`VITE_API_BASE_URL`, `VITE_USE_MOCK_DATA`)

## Assumptions in play

**None active.** Q-BE-01, Q-DATA-01, Q-KPI-01 all RESOLVED on
2026-05-20. This spec implements those decisions:
- Mock data via `src/lib/mockData.js` (no backend).
- 60-second polling cadence in `usePolledQuery`.
- KPI list = prototype artifact (Q-KPI-01).

## Purpose

Build the dummy data layer every Phase-1 page reads from. Resource
modules at `src/api/*.js` mimic the **target backend contract** (per
`docs/api-contract.md`) so when the backend is built in a later phase,
only the internals of those files change — pages and hooks stay the
same.

This spec ships **only what spec 03 (landing-page) needs**. Later
specs (04+) add their data into `mockData.js` and their endpoints
into the corresponding resource module — incremental growth instead
of a 3000-line drop.

## UI elements

None. This is pure infrastructure.

## Files

- **`src/lib/mockData.js`** — pure data module (no React).
  - `PLANTS` array — four objects (Banmore, Chennai, Laksar, Mysore)
    with `{ id, name, sub, sx, sy, oe, otif, yield }` ported verbatim
    from `docs/artifact.jsx`.
  - `FUNCTIONS` array — five tiles `{ id, name, icon, active }`
    ported verbatim (Plant Head + Technical = `active:false`,
    Production + Quality + Engineering = `active:true`). Per Q-NAV-01,
    spec 03 will additionally render Quality + Engineering as
    visible-but-disabled for Phase 1 (data flag stays as artifact;
    UI overrides).
  - `BANMORE_TYRE_MIX = { pcr:100, tbr:0 }` (used later by Q-TR /
    tyre-type filter specs; bundled now to keep mockData additions
    coherent).
- **`src/lib/mockDelay.js`** — `mockDelay(min=200, max=500)` returns
  a Promise resolving after a random ms in `[min, max]`. Loading
  states render.
- **`src/api/client.js`** — axios instance.
  - Reads `VITE_API_BASE_URL`.
  - Response interceptor unwraps `{ data: ... }` envelope and surfaces
    `error.code` / `error.message` / `error.details` on rejection (per
    `docs/api-contract.md#response-shape`).
  - No auth interceptor (Q-AUTH-01: no auth in Phase 1).
  - Phase 1 default: never hit; `VITE_USE_MOCK_DATA=true` short-circuits.
- **`src/api/plants.js`** — first dummy resource module.
  - `getPlants()` → returns `PLANTS` after `mockDelay()`.
  - `getPlant(id)` → returns single plant or `null` after `mockDelay()`.
  - `getFunctions()` → returns `FUNCTIONS` after `mockDelay()`.
  - When `import.meta.env.VITE_USE_MOCK_DATA === "true"`, these read
    `mockData`. Otherwise they call `client.get("/plants")`. Shape is
    identical in both modes.
- **`src/api/kpis.js`, `src/api/drills.js`, `src/api/trends.js`,
  `src/api/anomalies.js`** — skeleton files.
  - Each exports a `// TODO(spec NN): implement <function>` comment
    naming the consuming spec.
  - No implementation yet. Files exist so subsequent specs can fill
    them in without creating new files (less churn).
- **`src/hooks/usePolledQuery.js`** — vanilla hook.
  - Signature: `usePolledQuery(fetcher, { interval = 60000, deps = [], enabled = true })`.
  - Returns `{ data, error, isLoading, refetch }`.
  - Behaviour: runs `fetcher` on mount, then every `interval` ms.
    `refetch` is a manual trigger. Aborts on unmount (clears interval,
    drops in-flight result via a stale-token pattern). Dep change
    re-creates the loop. `enabled: false` pauses polling.
  - No React Query (per `conventions.md`: state libraries beyond
    React itself need a spec to justify; Phase 1 doesn't need it).

## Reuse check

- [x] Searched `src/components/common/`.
  - `useToast` — will be used by `usePolledQuery` callers, not by the
    hook itself. The hook returns the error; callers decide UI.
  - No new common primitives needed for this spec.

## Data

- Reads from: in-memory `mockData.js` (Phase 1) or backend `/plants`
  endpoint (Phase 2+; not wired now).
- Writes to: none.

## States

- Loading: any caller sees `isLoading: true` until the first
  `mockDelay()` resolves (≤ 500ms).
- Empty: `getPlants()` always returns a populated array. `getPlant(id)`
  returns `null` for unknown ids (caller decides how to render).
- Error: `usePolledQuery` exposes `error` (the rejected value from
  `fetcher`). For mock data this is unreachable; for HTTP it's an
  `Error` with `code`, `message`, `details`.
- Success: `data` populated, `isLoading: false`, `error: null`.

## Out of scope (deferred)

- KPI / drill / trend / anomaly data — added in their respective
  specs (05 / 06 / 10 / 04).
- React Query / TanStack Query — banned by conventions.md unless a
  later spec documents why.
- Auth header injection — Q-AUTH-01.
- Live HTTP integration — Phase 2+.
- Error toasts in `usePolledQuery` (callers decide; some pages may
  want to show inline error instead of a toast).

## Done when

- `src/lib/mockData.js` exports `PLANTS` (4 entries) and `FUNCTIONS`
  (5 entries) matching `docs/artifact.jsx` data verbatim.
- `src/lib/mockDelay.js` exports `mockDelay`.
- `src/api/client.js` builds (axios instance with response interceptor
  unwrapping `data` and rejecting on `error`).
- `src/api/plants.js` exports `getPlants`, `getPlant`, `getFunctions`
  switching on `VITE_USE_MOCK_DATA`.
- `src/api/kpis.js`, `drills.js`, `trends.js`, `anomalies.js` exist
  with TODO comments naming consumer spec.
- `src/hooks/usePolledQuery.js` exports `usePolledQuery` with the
  contract above.
- **Smoke test:** add a temporary debug line in
  `LandingPagePlaceholder` that fetches `getPlants()` and renders the
  count. Verify "4 plants" shows up. Remove before commit.
- `npm run check` exits zero.
- Manual click-through: `/` renders without console errors; devtools
  shows 4 plants in the smoke-test render before removal.
- Commit lands → `logs/history.md` gets the entry.
