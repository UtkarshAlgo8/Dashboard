# Spec: export-print

**Phase:** 1
**Route:** cross-cutting (Export button in every dashboard header)
**Status:** ready
**Blast radius:** GREEN — single click handler + global @media print rules

## Prerequisites
- Spec 04 — Export button placeholder exists in ProductionHeader

## Context

- CLAUDE.md, conventions.md
- BRD §9.5 (`FR-X26`, `FR-X27`)
- docs/open-questions.md (Q-EXP-01 — browser print only)
- src/components/production/ProductionHeader.jsx — Export button host
- src/theme.js — could host @media print but we'll keep print rules
  isolated in a dedicated component

## Assumptions in play

None. Q-EXP-01 RESOLVED: window.print() only; the browser's native
"Save as PDF" handles the download path. No separate export UI.

## Purpose

Replace the "Export PDF arrives in spec 13" toast in
`ProductionHeader` with a real `window.print()` call, and ship a
global print stylesheet that hides interactive chrome during print
per `FR-X27`.

## Scope

### `src/components/common/PrintStyles.jsx`

New shared component. Renders MUI `<GlobalStyles>` with an
`@media print` block. Mounted once in `App.jsx` so every route gets
the same print behaviour.

Rules:
- Force light backgrounds + preserve theme colours
  (`-webkit-print-color-adjust: exact; print-color-adjust: exact`).
- Hide:
  - `.no-print` class (escape hatch for non-essential controls)
  - All `IconButton` elements (back arrow, Export icon, avatar
    menu trigger, chevrons)
  - `MuiToggleButtonGroup-root` (TimeRange + Compound +
    Stock sub-selectors)
  - `MuiSnackbar-root` (toasts)
  - `MuiDialog-root` (open modals — closes on print)
  - `.MuiTableSortLabel-root` (sort affordances if added later)
  - Trend chart BEST/WORST labels kept (they're part of the chart).
- Page margins set to `0.5in` for A4/Letter compatibility.

### `src/App.jsx`

Mount `<PrintStyles />` once next to `<CssBaseline />`.

### `src/components/production/ProductionHeader.jsx`

Replace the Export-button `onClick={() => toast.info("Export PDF arrives in spec 13...")}` with `onClick={() => window.print()}`. The Tooltip
text becomes "Export to PDF (browser print)".

### `src/components/common/index.js`

Add `PrintStyles` export so consumers import from the barrel.

## Reuse check

- [x] `<GlobalStyles>` is MUI built-in; no new common primitive
  beyond the wrapper.
- [x] `ProductionHeader` already wires onClick; just changes the body.

## Data

None.

## States

- Print preview opens via browser native dialog.
- Cancellation is silent (browser default).

## Out of scope

- Server-side PDF (Q-EXP-01).
- A custom paper-size selector (browser handles).
- Print-only summary footer (e.g. "Generated 2026-05-20 by PH" — could
  add via @page, but Phase 2).
- Per-page header/footer with brand block (Phase 2 polish).

## Done when

- Clicking the Export icon in `/banmore/production` opens the
  browser's print dialog.
- The print preview hides: the back arrow, JK badge, brand block,
  TimeRange + PCR-only badge + Export icon, PH avatar — only the
  dashboard content remains. Chevrons and sub-selectors hidden too.
- Modals + snackbars do not appear in the preview.
- Colors render (no all-white printout).
- `npm run check` exits zero.
- Manual verification: open print preview (`Cmd+P` / `Ctrl+P`), see
  the expected hidden elements.
- Commit lands → `logs/history.md`.
