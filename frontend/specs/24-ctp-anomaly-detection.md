# 24 — CTP Engineering / Anomaly Detection frontend

## Scope and decisions

Enable Chennai Engineering without enabling its unavailable KPI sections. Preserve
Overall, Reliability, Maintenance, Utilities, Capex Projects, Ops & Compliance as
disabled sections; Anomaly Detection is the only active entry. User selected a
separate Engineering landing page and dedicated anomaly route, and existing
Highcharts rather than introducing Plotly. Live APIs are not ready; use the supplied
export through a replaceable data provider, with honest demo labeling.

Reference: `Quintoplex_PdM_Demo 4 (4).html` supplied by the user.

## Context

- `src/lib/landingConfig.js`, `src/pages/LandingPage.jsx`: CTP function availability.
- `src/router.jsx`, `src/routerComponents.jsx`: protected, lazy routes.
- `src/components/production/ProductionHeader.jsx`: opt-in primary-only mode and
  parent breadcrumb; default existing behavior unchanged.
- `src/components/ProtectedRoute.jsx`: opt-out chat launcher for dedicated UI.
- `src/pages/CtpEngineering.jsx`, `src/pages/CtpAnomalyDetection.jsx`.
- `src/pages/engineering/anomaly/`: native workspace, six screens, sub-equipment,
  timeline, charts, tag/mode/episode drawers, hierarchy and visibility review.
- `src/api/anomalyDetection.js`, `src/hooks/useAnomaly*.js`, `src/lib/anomaly/`.
- `src/theme.js`: isolated reference palette, Geist typography, control-room theme.
- `public/anomaly/quintoplex-demo.json`: lazily requested historical data fixture.
- `scripts/extract-anomaly-demo.py`: reproducible data-only extraction.
- `docs/anomaly-api-handoff.md`: data requirements, assumptions, deployment caveat.

No backend, package/dependency, or shared-common-library changes.

## Acceptance

1. CTP Engineering opens `/chennai/engineering`; only the Anomaly Detection tab
   and CTA are active. Other plants/functions are unchanged.
2. `/chennai/engineering/anomaly-detection` has the existing primary navbar but no
   dashboard secondary navigation/filter/export row or global floating chat.
3. Reference screens work: Home, Sensor health (all five tabs), Failure graph,
   Trends, Diagnoses & alerts (all four tabs), Hierarchy & coverage, Sub-equipment.
4. Mode and tag drawers, episode and transient evidence, historical selection,
   timeline ranges, stopped-period controls, stacked/overlay charts, CSV export,
   source and Unknown states, and local theme switching are functional.
5. Browser history, refresh, invalid query fallback, authenticated entry, and
   shared drawer links work. Desktop and mobile layouts remain usable.
6. “Latest available” never implies live data. No detection API is invented.
7. `npm run check` plus browser click-through validation. No production requests
   or mail sends are used for offline validation.

## Validation performed

- `npm run check`: passed (two pre-existing lint warnings and existing large-chunk
  build notices; no lint/build/forbidden-pattern failures).
- Offline Chromium walkthrough: Engineering disabled tabs, all workspace screens
  and sub-tabs, mode/episode/tag drawers, heatmap-cell drill-down, graph keyboard
  activation, hierarchy selection, sensor search, CSV download, timeline keyboard
  and pointer selection, chart zoom, query fallback, theme persistence, mobile
  navigation, missing-source Retry, and unauthenticated redirect. No runtime errors.
- Existing `tests/ctpSpc.browser.mjs`: passed, including existing tabs, selectors,
  scope, refresh, error/empty/stale handling, exports, and mobile layout.
- External font loading was intentionally blocked during offline validation;
  system fallbacks remained usable. No new repository tests or packages added.

## Deferred

Live endpoints/transport, authenticated production data, time semantics and
availability contract, server-side range/tag/episode loading. See handoff.
