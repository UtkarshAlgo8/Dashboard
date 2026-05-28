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
  - b4eb8f9 — fix: round every API numeric to 2 decimals _(Vishwajit Khanna)_
  - 9469bb9 — feat(trend): swap custom SVG charts for Highcharts (line / column) _(Vishwajit Khanna)_
  - 889194b — fix(trend): normalise highcharts-react-official UMD default import _(Vishwajit Khanna)_

## 2026-05-28
  - 4cf71dd — fix(dashboard): cards render correctly across all category tabs _(Vishwajit Khanna)_
  - 70e23cf — fix(date-filter): wire Today/Month/Year presets through to backend _(Vishwajit Khanna)_
  - 574981a — fix(date-filter): support from/to ranges; move date out of context _(Vishwajit Khanna)_
  - 7ca314a — fix(shift-comparison): derive values from fetched rows + date range _(Vishwajit Khanna)_
  - a8ee26c — fix(dashboard): preserve date filter across section/category navigation _(Vishwajit Khanna)_
  - acf02d9 — fix(trend-modal): date filter actually narrows the chart _(Vishwajit Khanna)_
  - 46c8e62 — feat(drill): single open card at a time _(Vishwajit Khanna)_
  - 1b06581 — feat(dashboard): section title bar + product-type pills (per artifact) _(Vishwajit Khanna)_
  - a9ef63d — fix(productivity): apply spec aggregations to card values _(Vishwajit Khanna)_
  - 4b9551a — fix(quality): apply spec — drop Rework, add Scrap_Rate, set agg _(Vishwajit Khanna)_
  - 247c336 — fix(cost): apply spec — agg + units for all 3 cards _(Vishwajit Khanna)_
  - 0a52cf1 — fix(morale): apply spec — agg + drill children + plant-level Absenteeism _(Vishwajit Khanna)_
  - 45c40b7 — fix(safety): apply spec — agg + drill children for all 4 cards _(Vishwajit Khanna)_
  - 1d5658e — fix(dashboard): section-header OEE uses Daily-only rows to match card _(Vishwajit Khanna)_
  - d43cf39 — feat(oee-drill): wire to real backend data for all 4 sections _(Vishwajit Khanna)_
  - 5bdfe46 — feat(productivity-drills): wire all 4 drill panels to real backend rows _(Vishwajit Khanna)_
  - 00b7ae1 — fix(productivity): pin Shift Comparison at bottom; Plan Compliance is leaf _(Vishwajit Khanna)_
  - d878a51 — fix(oee-drill): A/P/Q as a proper KPI-card row + separate machine section _(Vishwajit Khanna)_
  - a52395e — fix(layout): force 4 KPI columns + A/P/Q sub-cards visually distinct _(Vishwajit Khanna)_
  - 64ecbce — fix(layout): grid columns use minmax(0,1fr) so the 4th card stays on row 1 _(Vishwajit Khanna)_
  - 4a45d86 — fix(drill-fetch): split landing + drill into two queries so all 4 KPI cards survive _(Vishwajit Khanna)_
  - bf758f4 — fix(drills): map drill children correctly + aggregate per spec §9/§10/§11 _(Vishwajit Khanna)_
  - 2d23797 — fix(drills): Stock Production + Defect/Scrap dimension link + Scrap Rate panel _(Vishwajit Khanna)_
  - dc78e5f — fix(landing): restore plant sx/sy + sub + oe/otif/yield so India map renders dots _(Vishwajit Khanna)_
  - 88e999d — feat(oee-drill): wire sub-category panel when a machine A/P/Q cell is clicked _(Vishwajit Khanna)_
  - 8b2d550 — chore(deploy): add Docker images, nginx configs, and deploy scripts _(Vishwajit Khanna)_
  - 6ffaf87 — r3fvgte4rg _(Vishwajit Khanna)_
  - dac8ae5 — cwdcd _(Vishwajit Khanna)_
  - 36d2e2d — cdw _(Vishwajit Khanna)_
  - b0b4adc — cdwc _(Vishwajit Khanna)_
  - 0b1a3b8 — chore(deploy): run git pull from repo root + drop stale image before rebuild _(Vishwajit Khanna)_
  - 4b9a1cd — chore(docker): bump base to node:20-slim and tighten Dockerfile _(Vishwajit Khanna)_
  - 9b949fa — fix(docker): backend runs Node directly, not nginx _(Vishwajit Khanna)_
  - cffee32 — chore(deploy): align backend on port 8814 end-to-end _(Vishwajit Khanna)_
