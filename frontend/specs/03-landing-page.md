# Spec: landing-page

**Phase:** 1
**Route:** `/`
**Status:** ready
**Blast radius:** YELLOW — one feature, single page, mock data only

## Prerequisites
- Spec 01 (app-shell) — landed
- Spec 02 (mock-data-layer) — landed (`getPlants`, `getFunctions`, `usePolledQuery`)

## Context

- CLAUDE.md, conventions.md
- docs/product.md (Banmore-only Phase 1, others visible-but-disabled)
- docs/architecture.md
- docs/open-questions.md (Q-NAV-01, Q-USR-01, Q-MOBILE-01 all RESOLVED)
- docs/artifact.jsx (visual reference — `function LandingPage`)
- BRD §5 — `FR-L1` through `FR-L18`
- src/components/common/ — `PageContainer` (won't fit; building a
  landing-specific layout), `useToast`
- src/api/plants.js — `getPlants`, `getFunctions`
- src/hooks/usePolledQuery.js
- src/lib/indiaMap.js — `SP`, `MAP_W`, `MAP_H` (extracted in this spec)
- src/theme.js — palette + Montserrat

## Assumptions in play

None active. Q-NAV-01 (visible-but-disabled), Q-USR-01 (single role,
no RBAC), Q-MOBILE-01 (desktop + tablet) all RESOLVED on 2026-05-20.

## Purpose

Replace `LandingPagePlaceholder` with the real Landing surface per
BRD §5 and the artifact's `LandingPage`. Banmore + Production are the
only active interactions in Phase 1.

## Files

**New components** in `src/components/landing/`:

- `LandingHeader.jsx` — brand block ("One Factory / One Dashboard"
  with vertical divider + JK Tyre logo placeholder) + FY pill
  ("FY 2025-26") + avatar (initials "PH" in orange accent per
  `FR-L1`–`FR-L3`). Avatar click is a no-op in spec 03 (user menu is
  spec 14).
- `PlantCard.jsx` — single plant card. Renders name, sub-location, 3
  headline KPIs (OE / OTIF / Yield). Banmore: active + clickable;
  others: reduced opacity, non-clickable, MUI Tooltip "Phase 2 — not
  yet available". Hover raises (shadow + border accent). Selected
  state = stronger accent border (`FR-L9`–`FR-L12`).
- `PlantCardList.jsx` — vertical list wrapper.
- `FunctionTile.jsx` — single tile (icon + label). Production: full
  saturation, clickable. Quality + Engineering: visible-but-disabled
  with "Phase 2" tooltip (Q-NAV-01 override of the artifact's
  `active:true` data flag). Plant Head + Technical: visible-but-
  disabled per the artifact's `active:false` (BRD `FR-L15` explicit
  deferral) (`FR-L14`–`FR-L17`).
- `FunctionTileStrip.jsx` — horizontal strip; appears beneath the
  cards once a plant is selected (`FR-L13`).
- `IndiaMap.jsx` — SVG map. Renders `SP` paths twice (fill layer +
  outline filter), then `PLANTS.map(...)` for markers with
  animated pulse rings. Hover/select reciprocity with the cards
  (`FR-L7`, `FR-L8`).

**New page** in `src/pages/`:
- `LandingPage.jsx` — composes the above. Owns `hov` and `sel`
  state (hovered plant id, selected plant id). Fetches plants via
  `usePolledQuery(getPlants, { interval: 0 })` (the plant list
  doesn't change at runtime — polling would be wasted). Fetches
  functions via the same pattern.

**New data**:
- `src/lib/indiaMap.js` — already extracted from
  `docs/artifact.jsx` (171KB of state paths + `MAP_W=480`,
  `MAP_H=560`). No-React data only.

**Updated**:
- `src/router.jsx` — `/` route swaps from
  `LandingPagePlaceholder` → `LandingPage`.

**Deleted**:
- `src/pages/LandingPagePlaceholder.jsx`.

## Reuse check

- [x] Searched `src/components/common/`.
  - `PageContainer` is for body-with-header pages; the landing has a
    custom multi-region layout (header bar + 2-column body) — does
    not fit. Build a landing-specific layout using MUI Box/Stack.
  - `useToast` available if we want to show "Coming in Phase 2" toasts
    on disabled clicks (preferred over no feedback at all).
  - No new common primitive proposed yet. Avatar (`<RoleAvatar>`)
    could be reusable later; defer the common/ promotion until spec 04
    needs the avatar in the dashboard header too.

## Data

- Reads from: `getPlants()`, `getFunctions()` via `usePolledQuery`
  with `interval: 0` (one-shot, no polling).
- Writes to: none.
- Local state: `hov`, `sel` (plant ids; `null` when none).

## States

- Loading: header renders immediately; main region shows a centred
  `CircularProgress` while `isLoading=true` (≤ 500ms for mock).
- Empty: `plants` is always populated in mock; render the centred
  empty-state copy if the array is ever empty in future.
- Error: surface a toast "Could not load plants" via `useToast`.
- Success: cards + map render; Banmore active, others disabled with
  tooltip; function tiles appear once any plant is selected. Click
  active Production tile → `navigate("/banmore/production")`.

## Out of scope

- User menu (avatar dropdown) — spec 14.
- Real JK Tyre logo asset — placeholder typography for now.
- Real-time updates (plant list is static).
- Map zoom / pan.
- Touch interactions on tablet beyond MUI defaults.

## Done when

- `/` renders the LandingHeader + 4 plant cards + India map without
  console errors.
- Banmore card is interactive; clicking selects it and reveals the
  function-tiles strip beneath the cards.
- Other 3 plant cards render at reduced opacity, non-clickable, with
  a "Phase 2 — not yet available" tooltip on hover.
- All 5 function tiles render; Production is active, others show
  disabled state with a tooltip.
- Hovering a plant card highlights its map marker; hovering a marker
  highlights the corresponding card (BRD `FR-L7`, `FR-L8`).
- Clicking the active Production tile navigates to
  `/banmore/production` (placeholder still — spec 04 fills it).
- Theme tokens used throughout — no hex codes outside `theme.js` and
  `src/components/common/`.
- `npm run check` exits zero.
- Manual click-through in browser confirms layout matches the
  artifact's spirit (not pixel-perfect — Montserrat substitutes for
  artifact's IBM Plex Sans, MUI primitives substitute for raw divs).
- Commit lands → `logs/history.md` gets the entry.
