# 23 — Consistent Maintenance KPI presentation

## User-confirmed scope

- Make Engineering → Maintenance's five KPI cards consistent: Calibration Due, Stock Cost, PM Compliance, Daily Check Sheet Compliance and Safety Observations.
- Use the existing Production/Quality card design and neutral theme tokens for all five. Preserve real indicators such as Calibration's red overdue subline. Do not invent thresholds, targets or pass/fail colors.
- Use uniform skeleton loading instead of mixed skeletons, circular loaders and loading text inside cards.
- **Maintenance only for now:** do not redesign Production, Quality or other Engineering tabs, or change their loading defaults, status rules, calculations, APIs or filters.

## Implementation

- A single pure `maintenanceKpiPresentation` adapter normalizes presentation/state for every Maintenance card. Continue using `QKpiCard`, shared theme tokens, existing icons, typography, spacing, selection border and drill/trend actions. No new card implementation or dependencies.
- Neutral backgrounds and values; blue remains selection/action styling. Hide decorative progress bars where no target exists. Use a consistent 160px minimum card height and aligned title/value baselines with bottom-pinned footers for these content-rich cards, without changing the shared 136px/default layout elsewhere.
- Source models still own values, units, dates, scopes, trends and alerts. Do not change `complianceCard` globally: its brand-blue treatment remains available to the other dashboards. Remove its now-inapplicable blue explanation only in the Maintenance presentation adapter.
- First load or a new reporting scope with no current value: identical value/caption/footer skeletons and no drill/trend actions. Explicitly pass the actual request state for Compliance, whose source model does not forward `isLoading`.
- Background refresh with a valid current-scope value: keep the value and actions stable; expose `aria-busy` and a refreshing label rather than replacing it with another loader. This does not retain data across reporting scopes; the existing source-key/context guards remain intact.
- Valid zero remains zero. No published value shows a dash and `No published data for this scope`. An error shows a dash and `Data unavailable · Open details`, without old value/subline/trend leakage. Unsupported period/shift selections retain their KPI-specific explanation and do not remain in a loading state.
- Shared-card changes are opt-in metadata only (`cardMinHeight`, `alignMetrics`, `isRefreshing`). Existing callers retain their previous dimensions, colors, loader and status behavior. Backend, network/cache behavior, date semantics and download functionality are unchanged.

## Verification

- Pure adapter checks passed across all five source models: loading/ready/refresh/empty/error/unsupported, valid zero, preservation of alert values/trends/scopes and immutability. Legacy Compliance source models remain brand-blue.
- Mock-backed desktop/tablet browser checks passed: five equal neutral 160px cards, aligned metric baselines, identical skeletons with no circular card loaders, no stale values on period change, stable current-scope values during an actual polling refresh, empty/error recovery, and existing drill/download interactions. All real PDF/XLSX Maintenance download checks passed again after the presentation changes.
- Separate legacy `QKpiCard` browser checks passed: brand-blue and genuine green/red RAG colors, circular-loading fallback, existing skeleton opt-in and 136px default minimum height unchanged. No browser runtime errors were reported.
- Full `npm run check` and all 151 existing frontend helper regressions passed. The helper tests used the existing temporary Node alias/MUI resolver outside the repository; no new frontend test files or tooling were added.
