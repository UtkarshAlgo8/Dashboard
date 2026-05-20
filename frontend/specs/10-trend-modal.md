# Spec: trend-modal

**Phase:** 1
**Route:** modal overlay launched from any KPI card's Trend Icon
**Status:** draft
**Blast radius:** YELLOW — cross-cutting (every KPI card uses it)

## Prerequisites
- Spec 02 (trend mock data)
- Spec 05 (Trend Icon on KPI cards)

## Purpose

Implement the KPI Trend Analysis modal per BRD §9.3 (`FR-X10`–`FR-X17`)
and `function TrendPanel` in `docs/artifact.jsx`. Also delivers the
shared Time Range component used in the dashboard header per §9.2
(`FR-X6`–`FR-X9`).

## Scope

- Modal overlay with backdrop, Escape-key dismissal, X button, click-
  outside dismissal (`FR-X10`, `FR-X17`).
- Header: "KPI TREND ANALYSIS" small caps label + KPI name large
  (`FR-X11`). PCR/TBR pill if non-default Tyre Type AND plant ≠
  Banmore (Banmore is PCR-only per `FR-X2`).
- Shared Time Range component with four presets (Today / Week / Month
  / Year per Q-TR-01) + From / To custom inputs (`FR-X6`–`FR-X9`).
- Chart auto-selection by `pickChartType()` helper (`FR-X13`):
  - Line for continuous rate KPIs (OEE %, FTQ %, Scrap Rate %, MTBF, …)
  - Bar for discrete count KPIs (Breakdown Hours, NCM Hold, Customer
    Complaints, Production Loss ₹, Repeat Failures, Anomalies, …)
  - Progress bar for counter KPIs (Days Without Reportable Incident, …)
- Charts include dashed amber target line + BEST (green) / WORST (red)
  markers (`FR-X14`).

## Out of scope
- Per-statistic tiles (Current / Target / Gap / Average / Best /
  Worst) — explicitly excluded by `FR-X15`.
- Chart-type badge ("LINE CHART", "BAR CHART") — explicitly excluded
  by `FR-X16`.
- Auto-generated Insight panel — `FR-X15`.
- Chart export from inside the modal.
