# Spec: export-print

**Phase:** 1
**Route:** cross-cutting (Export button in every dashboard header)
**Status:** draft
**Blast radius:** GREEN — single global stylesheet + button handler

## Prerequisites
- Spec 04 (dashboard header with Export button placeholder)

## Purpose

Wire the Export PDF button to `window.print()` and ship a
print-friendly stylesheet per BRD §9.5 (`FR-X26`, `FR-X27`).
Q-EXP-01 resolved: the browser's native "Save as PDF" inside the
print dialog is the download path — no separate UI.

## Scope

- Click handler on Export button → `window.print()`.
- Global `<PrintStyles>` component (or `@media print` block in
  `src/theme.js` / `src/index.css`) that hides:
  - User menu dropdown
  - Drill-down chevrons
  - Trend modal (if open)
  - Toast snackbars
  - Interactive hover states
- All charts and tables print legibly at A4 in landscape.
- `<title>` reflects the active dashboard so the printed page header
  reads sensibly (browsers print `document.title` by default).

## Out of scope
- Server-side PDF rendering (Q-EXP-01 explicit).
- Custom paper-size selection.
- Print preview UI inside the app.
- A4 vs Letter switch — printer/browser handles it.
