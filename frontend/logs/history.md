# Change log

Append-only log. One entry per commit. See PLAYBOOK.pdf Part I §9 and the
"Roll back via the change log" prompt in Part IV for the rollback workflow.

Entries below this line are appended by `.githooks/post-commit` → `scripts/log-history.sh`.

## 2026-05-20
  - a0c3228 — scaffold + spec 01 app-shell _(Vishwajit Khanna)_
  - 5804b8c — spec 02 mock-data-layer _(Vishwajit Khanna)_
  - b0a4e92 — spec 03 landing-page _(Vishwajit Khanna)_
  - feadaf4 — fix: default to mock data when VITE_USE_MOCK_DATA is unset _(Vishwajit Khanna)_
  - 932cd4d — spec 04 production-dashboard-shell _(Vishwajit Khanna)_
  - 8fb9a8b — spec 05 mixing-productivity-kpis _(Vishwajit Khanna)_
  - 75b7063 — spec 06 oee-drill _(Vishwajit Khanna)_
  - 2f2de7d — spec 07 production-drill _(Vishwajit Khanna)_
  - 6d75056 — spec 08 scrap-traceability _(Vishwajit Khanna)_
  - 6406d22 — fix(usePolledQuery): stop re-fetch loop with inline arrow-function fetchers _(Vishwajit Khanna)_
  - a59909e — spec 09 other-drills _(Vishwajit Khanna)_
  - 37c90ee — spec 10 trend-modal _(Vishwajit Khanna)_
  - 472f52e — spec 11 other-sections _(Vishwajit Khanna)_
  - 7bf7691 — spec 12 other-tabs _(Vishwajit Khanna)_
  - ace4f83 — spec 13 export-print _(Vishwajit Khanna)_
  - 9613bae — spec 14 user-menu _(Vishwajit Khanna)_
  - 137d091 — spec 15 inventory-page _(Vishwajit Khanna)_
  - b1b5c65 — cr: landing modal flow + map hover callout _(Vishwajit Khanna)_
  - 5e7d802 — cr: mark Quality + Engineering as SOON in the plant-function modal _(Vishwajit Khanna)_
  - f1e9ed1 — cr: single date-range picker in TimeRangeSelect _(Vishwajit Khanna)_
  - 3550a17 — cr: replace TimeRangeSelect popover with custom Date Filter modal _(Vishwajit Khanna)_

## 2026-05-26
  - 4b65710 — cr: drop Week preset + Today-only Shift + Production View-by lens _(Vishwajit Khanna)_
  - 34eea39 — Revert "cr: scaffold backend (CR-06 Commit A)" _(Vishwajit Khanna)_

## 2026-05-27
  - 6973fa6 — cr: re-scaffold backend on confirmed gold_dummy vocabulary (CR-07) _(Vishwajit Khanna)_
  - a0828fe — cr: wire time-range + shift + gold_dummy values through; trend charts default to line _(Vishwajit Khanna)_
  - f76320d — fix: pickChartType matches artifact (name+unit, not id) _(Vishwajit Khanna)_
  - 5058f61 — fix: remove stray 'downtime' bar hint that diverged from artifact _(Vishwajit Khanna)_
