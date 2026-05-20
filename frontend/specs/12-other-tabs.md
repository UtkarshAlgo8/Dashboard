# Spec: other-tabs

**Phase:** 1
**Route:** `/banmore/production` (Q / C / D / M / S tabs across all 4 sections)
**Status:** ready
**Blast radius:** YELLOW — KPI parity across 20 (section, tab) combos

## Prerequisites
- Specs 05 + 11 — landed (KPI grid + all sections wired).

## Context

- CLAUDE.md, conventions.md
- BRD §6.3 (`FR-P7`–`FR-P9`) — tab list
- BRD §7 — Quality dashboard reference (Phase 2 surface; only the
  Q tab inside Production needs Phase 1 KPIs)
- src/components/production/KpiGrid.jsx — already handles
  drillable / non-drillable KPIs
- src/api/kpis.js — extends dispatch
- src/lib/mockData.js — adds OTHER_TAB_KPIS
- src/components/trend/pickChartType.js — extends id map for new
  KPIs (counters → progress)

## Assumptions in play

None. BRD names the tabs without per-tab KPI lists; spec picks a
deterministic mock set per tab consistent with industry KPIs and
the artifact's surface.

## Purpose

Replace the "KPIs for this view land in specs 11/12" placeholder
for the remaining 5 category tabs. After this spec, every
(section, tab) combo except Inventory has a populated KPI grid.

## Scope

### KPI set per tab (fixed across sections)

The same 4 KPIs render in every section under each tab; values vary
section-to-section.

- **Q (Quality)**:
  - `ftq` — First Time Quality % (line in trend)
  - `defect-rate` — Defect Rate % (line)
  - `ncm-hold` — NCM Hold qty (bar)
  - `customer-complaints` — Customer Complaints count (bar)
- **C (Cost)**:
  - `cost-per-unit` — Cost per Unit ₹ (bar)
  - `energy-cost` — Energy Cost ₹/unit (bar)
  - `conversion-cost` — Conversion Cost ₹ (bar)
  - `material-cost` — Material Cost ₹ (bar)
- **D (Delivery)**:
  - `otif` — OTIF % (line)
  - `schedule-adherence` — Schedule Adherence % (line)
  - `plan-vs-actual` — Plan vs Actual % (line)
  - `order-lead-time` — Order Lead Time days (bar)
- **M (Morale)**:
  - `attendance` — Attendance % (line)
  - `manpower-vs-plan` — Manpower vs Plan % (line)
  - `training-hours` — Training Hours (bar)
  - `engagement-score` — Engagement Score % (line)
- **S (Safety)**:
  - `days-without-incident` — Days Without Reportable Incident
    (progress / counter)
  - `near-misses` — Near Misses (bar)
  - `safety-observations` — Safety Observations (bar)
  - `audit-score` — Safety Audit Score % (line)

### Drillability

All Q/C/D/M/S KPIs are **non-drillable** in Phase 1 (`drillable: false`).
BRD §6.12 only defines drills for Productivity-tab KPIs. Trend modal
remains available for every KPI via the Trend Icon.

### Mock data

`src/lib/mockData.js` gains:
- `OTHER_TAB_KPI_TEMPLATES` — keyed by tab → array of 4 KPI shapes
  with baseline values + spark + target.
- `OTHER_TAB_KPIS_BY_SECTION` — for each (section, tab), the
  resolved KPI list. Section-specific value tweaks live here so the
  data export is fully static (no runtime generators).

### API

`getKpis` dispatch:
- `tab === "p"` → existing PRODUCTIVITY_KPIS_BY_SECTION path
- `tab in ["q","c","d","m","s"]` → OTHER_TAB_KPIS_BY_SECTION[section][tab]
- `tab === "i"` → `[]` (Inventory is spec 15 stretch)

### Chart picker

`pickChartType` already has entries for many of the new KPI IDs;
add the missing ones (`ftq`, `defect-rate`, `ncm-hold`,
`customer-complaints`, `cost-per-unit`, `energy-cost`,
`conversion-cost`, `material-cost`, `otif`, `schedule-adherence`,
`plan-vs-actual`, `order-lead-time`, `attendance`,
`manpower-vs-plan`, `training-hours`, `engagement-score`,
`days-without-incident`, `near-misses`, `safety-observations`,
`audit-score`).

Counter KPIs (`days-without-incident`) → `progress`; rate KPIs →
`line`; count KPIs → `bar`.

## Reuse check

- [x] KpiCard already handles `drillable: false` (no chevron).
- [x] TrendModal already handles all three chart types.
- [x] No new components needed.

## Data

- API call shape unchanged from spec 11.

## States

- Loading / empty / error / success — same as parent specs.

## Out of scope

- Real drills for Q/C/D/M/S KPIs — Phase 2 (Quality / Engineering
  dashboards have their own drills per BRD §7 / §8).
- MANUAL badge on Q tab KPIs (per FR-Q3 — Quality Dashboard surface,
  not the Production Q tab).
- Trend mock data for Q/C/D/M/S KPIs — trend modal will show
  "No trend data" for these. Phase 2 populates.
- Inventory tab — spec 15.

## Done when

- Switching to Q / C / D / M / S in any section renders 4 KPI cards
  with section-appropriate values.
- All cards show name + value + unit + sparkline + trend %.
- No chevrons appear on non-Productivity KPI cards (non-drillable).
- Trend modal opens for any KPI; gracefully shows "No trend data
  for this period" for the new KPIs.
- `npm run check` exits zero.
- Manual click-through.
- Commit lands → `logs/history.md`.
