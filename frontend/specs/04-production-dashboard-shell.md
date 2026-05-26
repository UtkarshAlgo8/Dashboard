# Spec: production-dashboard-shell

**Phase:** 1
**Route:** `/banmore/production`
**Status:** ready
**Blast radius:** YELLOW — one feature, single page chrome; KPI content from spec 05+

## Prerequisites
- Spec 01 (app-shell) — landed
- Spec 02 (mock-data-layer) — landed
- Spec 03 (landing-page) — landed (navigation source)

## Context

- CLAUDE.md, conventions.md
- docs/product.md, docs/architecture.md
- docs/open-questions.md (Q-NAV-01, Q-USR-01, Q-TR-01, Q-MOBILE-01 — all RESOLVED)
- docs/artifact.jsx (visual reference — `function ProductionDashboard`)
- BRD §6.1–6.3 — `FR-P1` through `FR-P9`
- BRD §9.1, §9.2 — `FR-X1`, `FR-X2`, `FR-X6`–`FR-X9` (filters)
- src/components/common/ (PageContainer, useToast)
- src/components/landing/LandingHeader.jsx (avatar + brand pattern to reuse)
- src/api/plants.js (getPlant)
- src/lib/mockData.js (adds: SECTIONS, CATEGORY_TABS, BANMORE_SUMMARY)
- src/router.jsx

## Assumptions in play

None active. Q-NAV-01, Q-USR-01, Q-TR-01 (4 presets + custom),
Q-MOBILE-01 (tablet+desktop) all RESOLVED on 2026-05-20.

## Purpose

Replace `BanmoreProductionPlaceholder` with the Production dashboard
chrome per BRD §6.1–6.3. KPI cards, drills, and trend modal are
intentionally out of scope — they ship in specs 05+. After this spec
lands, navigating to `/banmore/production` shows the full layout
(header + sidebar + plant card + tab strip + empty KPI grid area) so
subsequent specs only need to fill in the main content slot.

## User flow

1. From `/`, user clicks Banmore card → Production tile.
2. Lands at `/banmore/production`.
3. Sees the dashboard shell: header chrome, section sidebar, plant
   summary card, category tab strip, and an empty KPI grid area
   with "KPI grid lands in spec 05+" copy.
4. Clicks a section (MIX / TBM / CUR / STK) → active highlight moves;
   KPI grid copy updates to name the active section (`section X tab Y
   — pending spec 05`).
5. Clicks a category tab (P / Q / C / D / M / S / I) → active
   highlight moves; KPI grid copy updates.
6. Clicks back arrow in the header → returns to `/`, preserving the
   Banmore selection (router-level, no extra state needed since the
   landing page rehydrates on every visit in Phase 1).

## UI elements

### `src/components/production/ProductionHeader.jsx`

Top header bar. Three regions per BRD `FR-P1`–`FR-P3`:

- **Left**: back arrow (← icon) + brand block + active plant name
  ("Banmore Plant" pulled from `getPlant("banmore")`).
- **Center**: empty (visual breathing room).
- **Right**: TimeRangeSelect (visual, see below) + TyreTypeBadge
  (Banmore = "PCR ONLY" per `FR-X2`) + ExportButton (visual) + Avatar.

Filter widget rules for spec 04:
- **TimeRangeSelect**: renders 3 preset pills (Today / Month / Year,
  per Q-TR-01 as revised by CR-05 — "Week" dropped) + From/To date
  inputs. When `preset === "today"` and `onShiftChange` is supplied,
  a compact Shift `<select>` (All Shifts / A / B / C) appears nested
  directly under the preset pills. The shift selector is hidden for
  Month/Year/custom ranges. Local state tracks the active preset;
  switching presets visually highlights but does NOT fetch data (no
  consumer yet). Real wiring is spec 05+ via lifted state from
  `BanmoreProduction`. Shift state is also lifted to the page
  (default `"all"`); for Phase 1 it is pure UI and not threaded
  into drill API calls (Q-SH-01 resolved "pure UI").
- **TyreTypeBadge**: hardcoded "PCR ONLY" badge with tooltip "Banmore
  plant produces PCR only" (per `FR-X2`).
- **ExportButton**: renders the down-arrow icon, calls a `onExport`
  prop. Spec 04 passes a no-op + toast "Export PDF arrives in spec
  13". Spec 13 wires it to `window.print()`.
- **Avatar**: PH initials in orange. No-op (spec 14 wires the menu).

### `src/components/production/SectionSidebar.jsx`

Left vertical sidebar listing four sections (BRD `FR-P4`):
- Mixing (MIX), TBM, Curing (CUR), Stock (STK).
- Active row highlighted with primary background + accent border.
- Hover state for inactive rows.
- Returns the selected section id via `onSelect`.

### `src/components/production/PlantSummaryCard.jsx`

Plant card pinned at the bottom of the sidebar (BRD `FR-P6`):
- Plant name (small caps label).
- Overall OEE in large type (pulled from `plant.oe`).
- Two pill chips: "Prod: 92%" (Banmore = high green) and "Scrap:
  1.05%" (red). For Phase 1 these are static mocked values from
  `BANMORE_SUMMARY` in `mockData.js`.

### `src/components/production/CategoryTabs.jsx`

Horizontal tab strip above the KPI grid (BRD `FR-P7`–`FR-P9`):
- Seven tabs: P (Productivity), Q (Quality), C (Cost), D (Delivery),
  M (Morale), S (Safety), I (Inventory).
- Single-letter code on left + full label.
- Active tab in primary color with underline.
- Returns selected category id via `onSelect`.

### `src/pages/BanmoreProduction.jsx`

Composes the shell. Owns:
- `section` state (default "mix")
- `category` state (default "p")
- `timeRange` state (default "today" preset, no `from`/`to` yet)
- Calls `getPlant("banmore")` via `usePolledQuery({ interval: 0 })`.
- Main content area renders a centred placeholder reading
  "Section: {section} · Tab: {category} — KPIs land in spec 05+".

### Mock data additions

`src/lib/mockData.js` gains:
- `SECTIONS = [{ id: "mix", code: "MIX", name: "Mixing" }, ...]` (4
  entries per BRD `FR-P4`).
- `CATEGORY_TABS = [{ id: "p", code: "P", name: "Productivity" }, ...]`
  (7 entries per BRD `FR-P7`).
- `BANMORE_SUMMARY = { prodPct: 92, scrapPct: 1.05 }` (per BRD
  `FR-P6` example values).
- `getSections()`, `getCategoryTabs()`, `getPlantSummary(plantId)`
  added to `src/api/plants.js` — same mock/HTTP switch.

## Reuse check

- [x] Searched `src/components/common/`.
  - `PageContainer` doesn't fit (this page has its own header chrome).
  - `useToast` used for the "Export arrives in spec 13" hint.
- [x] Searched `src/components/landing/`.
  - `LandingHeader` shares the brand-block + FY pill pattern. Spec 04
    does NOT promote a shared `<AppBrand>` component yet — premature
    abstraction risk (the dashboard header has different surrounding
    chrome). Promote in spec 14 (user-menu) when the avatar dropdown
    needs to be shared.
- No new common primitive proposed.

## Data

- Reads from: `getPlant("banmore")`, `getSections()`, `getCategoryTabs()`,
  `getPlantSummary("banmore")` via `usePolledQuery` with `interval: 0`.
- Writes to: none.
- Local state: `section`, `category`, `timeRange`.

## States

- Loading: page header renders immediately; main region shows centred
  `CircularProgress` while plant data resolves.
- Empty: never (mock always populated).
- Error: toast "Could not load Banmore Production".
- Success: full shell rendered, default `section="mix"`,
  `category="p"`.

## Out of scope

- KPI cards / KPI grid (spec 05).
- Drill panels (specs 06–09).
- Trend modal (spec 10).
- Print stylesheet + real `window.print()` (spec 13).
- User menu (spec 14).
- Inventory tab page (spec 15).
- Active-section persistence across navigation.
- Anomaly strip (deferred to spec 09 or later).
- Mixing-section "Master / Final" compound sub-selector — spec 05.
- Stock-section sub-selector — spec 11.

## Done when

- `/banmore/production` renders the full shell without console errors.
- Header shows back arrow, brand block, "Banmore Plant" text,
  TimeRange (visual), "PCR ONLY" badge, Export button, PH avatar.
- Left sidebar lists 4 sections; clicking switches the active
  highlight.
- Plant Summary card at bottom of sidebar shows OEE + Prod + Scrap.
- Category tab strip lists 7 tabs; clicking switches the active
  highlight.
- Main content area shows the placeholder message that updates with
  the active section + category id.
- Back arrow in header navigates to `/`.
- `npm run check` exits zero.
- Manual click-through: shell renders + interactions update visually.
- Commit lands → `logs/history.md` gets the entry.
