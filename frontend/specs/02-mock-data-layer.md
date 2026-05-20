# Spec: mock-data-layer

**Phase:** 1
**Route:** N/A (infrastructure)
**Status:** draft
**Blast radius:** YELLOW — one feature; touches `src/api/`, `src/lib/`, `src/hooks/`

## Prerequisites
- Spec 01 (app-shell) — theme + providers mounted

## Purpose

Build the dummy data layer every Phase-1 page reads from, so the
production-shape resource modules at `src/api/*.js` exist from day one
and the backend swap (Phase 2+) is a one-file change per resource.

Covers Q-BE-01 (no backend), Q-DATA-01 (60s polling), Q-KPI-01
(prototype KPI list is authoritative).

## Scope (initial)

- `src/lib/mockData.js` — port deterministic-mock data from
  `docs/artifact.jsx` (plant list, KPIs per section/tab, machines,
  drill data, trend series). Pure data — no React.
- `src/lib/mockDelay.js` — Promise helper resolving after 200–500ms
  so loading states render.
- `src/api/client.js` — axios instance (base URL, error transform);
  configured but unused while `VITE_USE_MOCK_DATA=true`.
- `src/api/plants.js`, `src/api/kpis.js`, `src/api/drills.js`,
  `src/api/trends.js`, `src/api/anomalies.js` — dummy resource
  modules. Each exports async functions returning mock data via
  `mockDelay`. When `VITE_USE_MOCK_DATA=false`, switch to HTTP.
- `src/hooks/usePolledQuery.js` — custom hook with 60s polling,
  manual refresh, loading / error / data state, abort-on-unmount.
  Vanilla `useState` + `useEffect` (no React Query — per
  conventions.md unless a spec documents why; Phase 1 doesn't need it).

## Out of scope
- Live HTTP integration (Phase 2+).
- WebSocket / SSE push.
- Auth header injection (Q-AUTH-01).
- React Query / TanStack Query.
- Real backend contract — `docs/api-contract.md` is the proposed shape,
  not signed.
