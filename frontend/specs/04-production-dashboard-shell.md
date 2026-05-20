# Spec: production-dashboard-shell

**Phase:** 1
**Route:** `/banmore/production`
**Status:** draft
**Blast radius:** YELLOW — one feature, single page chrome (KPI content from spec 05+)

## Prerequisites
- Spec 01, 02 (theme + data layer)
- Spec 03 nice-to-have but not strict (URL-direct entry works)

## Purpose

Replace `BanmoreProductionPlaceholder` with the Production dashboard
chrome per BRD §6.1–6.3 (`FR-P1`–`FR-P9`) and `docs/artifact.jsx`
(`function ProductionDashboard`). KPI content + drills come in
specs 05+.

## Scope

- Top header bar: brand + active plant name + back arrow → `/`.
- Right side of header: Time Range selector (preset Today/Week/Month/Year
  + custom From/To per Q-TR-01), Tyre Type filter
  (per BRD `FR-X1`–`FR-X5`; Banmore is "PCR ONLY" badge per `FR-X2`),
  Export button (PDF — defers actual `window.print()` to spec 13),
  avatar.
- Left section sidebar with four sections: Mixing (MIX), TBM, Curing
  (CUR), Stock (STK). Currently-active section highlighted.
- Plant Card at bottom of sidebar: OEE in large type + "Prod: 92%"
  + "Scrap: 1.05%" pills.
- Main content region: category-tab strip (P/Q/C/D/M/S/I) above an
  empty KPI grid container (KPI cards arrive in spec 05+).
- Tab "I" (Inventory) — visible but Phase 1 lands the Production tabs
  first; Inventory page is spec 15 (stretch).
- Default section = Mixing, default tab = Productivity.

## Reuse check (early)
- `PageContainer` likely too opinionated for this chrome (it has a
  centred `<Container>`); a project-only `<DashboardShell>` is
  expected. Search common/ first.
- `<RoleAvatar>` from spec 03 if landed.

## Out of scope
- Real KPI cards / values (spec 05+).
- Drill-down panels (specs 06–09).
- Trend modal (spec 10).
- Print stylesheet (spec 13).
- User menu dropdown body (spec 14).
- Inventory tab page (spec 15).
- Active-section state persistence across navigation.
