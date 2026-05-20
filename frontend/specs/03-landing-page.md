# Spec: landing-page

**Phase:** 1
**Route:** `/`
**Status:** draft
**Blast radius:** YELLOW — one feature, single page, uses mock data only

## Prerequisites
- Spec 01 (app-shell) — theme, providers, router stub
- Spec 02 (mock-data-layer) — `src/api/plants.js`, `usePolledQuery`

## Purpose

Replace `LandingPagePlaceholder` with the real Landing surface per BRD §5
(`FR-L1`–`FR-L18`) and `docs/artifact.jsx` (search for
`function LandingPage`). Banmore + Production tile are active; other
plants and other function tiles render visible-but-disabled with a
"Phase 2" tooltip per Q-NAV-01.

## Scope

- Header: brand block ("One Factory / One Dashboard") + FY pill +
  avatar (PH initials, orange accent — see Q-USR-01: single role, no
  RBAC enforcement).
- India map (SVG, GeoJSON-derived) on the right with four plant markers
  at fixed coordinates (Banmore, Chennai, Laksar, Mysore).
- Plant cards on the left (one per plant). Each shows name, sub-location,
  three headline KPIs (Overall Effectiveness, OTIF, Yield).
- Banmore card → fully interactive. Other plants → reduced opacity,
  non-clickable, tooltip "Phase 2".
- Function tiles strip below the cards. Production tile active.
  Quality / Engineering tiles render visible-but-disabled per Q-NAV-01.
  Plant Head / Technical tiles stay disabled (BRD FR-L15 explicit
  deferral).
- Plant↔map hover reciprocity (`FR-L7`, `FR-L8`).
- Clicking the active Production tile navigates to `/banmore/production`.

## Reuse check (early)
- `PageContainer` for top-level layout.
- Avatar — likely needs a project-only component (`<RoleAvatar>` or
  similar). Search common/ first; if absent, propose adding to
  common/ since avatar is reusable across plants.

## Out of scope
- Sub-roles for the avatar (Q-USR-01: single role in Phase 1).
- Real map zoom / pan interactions.
- Plant onboarding / dynamic plant list (master data is hard-coded).
