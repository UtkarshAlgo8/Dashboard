# Frontend Roadmap

Last updated: 2026-05-20

## Working agreement

- Build in phase order. Cut features rather than shuffle.
- Each feature gets a spec in specs/ before any code.
- Tick the box when the feature works end-to-end in the browser AND
  `npm run check` exits zero.
- Never delete items — strike them through if cut.

## Phase 0 — Scaffold

- [x] Vite + React project initialised  *(pending — Day-0)*
- [x] MUI installed, theme set up in src/theme.js  *(pending — Day-0)*
- [ ] ESLint + Prettier configured
- [ ] `@/` path alias in vite.config.js and jsconfig.json
- [ ] App shell: AppBar + nav + main content
- [ ] Router mounted with placeholder home route (`/` → `/banmore/production`)
- [ ] src/api/client.js (axios, interceptors, refresh flow)
- [x] src/components/common/ synced (via Appendix C copy on Day-0)
- [x] scripts/check.sh committed and wired to `npm run check`
- [x] scripts/log-history.sh + .githooks/post-commit wired
- [x] logs/history.md initialised
- [ ] docs/open-questions.md seeded from BRD intake pass *(Part I.5 — not yet run)*
- [ ] .env.example committed

> The boxes marked `[x]` above are scaffolded by the Day-0 pass.
> The `[ ]` items still need to happen — Vite init, ESLint/Prettier,
> theme.js, axios client, and the BRD intake pass (Part I.5) come next.

## Phase 1 — Banmore Production (visual + behavioural parity with prototype)

Goal: a structured Vite + MUI app that reproduces the Production
dashboard for Banmore from docs/artifact.jsx, against either mock data
(src/lib/mockData.js) or a live backend if Q-BE-01 is resolved before
implementation starts.

Per-feature specs will be drafted via `bash scripts/scaffold-spec.sh
<name>` once the BRD intake pass surfaces the right slicing.
Provisional spec list:

- [ ] Spec: specs/01-app-shell.md — Theme, AppBar, layout, router stub
- [ ] Spec: specs/02-api-client.md — axios client, refresh flow (or
      mock-data toggle), error interceptors, toast wiring
- [ ] Spec: specs/03-banmore-production-landing.md — KPI grid, traffic-light
      tiles, sparklines, anomaly strip
- [ ] Spec: specs/04-kpi-drill-panel.md — DrillPanel with sub-metric tabs
      and contributing charts
- [ ] Spec: specs/05-trend-panel.md — TrendPanel side-sheet, time-range
      selector, best/worst markers, target line
- [ ] Spec: specs/06-tyre-type-filter.md — Global filter with
      disabled-tile reason banner
- [ ] Spec: specs/07-time-range-filter.md — Preset + custom from/to
- [ ] Spec: specs/08-export-pdf.md — Browser print stylesheet parity

## Phase 2 — Multi-plant + Quality + Engineering + Inventory

Sketched only. Not in scope until Phase 1 ships and stakeholders confirm
the scorecard shape.

- [ ] Spec: specs/NN-plant-picker.md
- [ ] Spec: specs/NN-quality-dashboard.md
- [ ] Spec: specs/NN-engineering-dashboard.md
- [ ] Spec: specs/NN-inventory.md

## Polish phase

- [ ] Empty states look intentional
- [ ] Loading skeletons consistent across pages
- [ ] 404 page
- [ ] Error boundary at the root
- [ ] Mobile responsive check on key screens
- [ ] Print stylesheet matches prototype's `_printPage` behaviour

## Stretch

- [ ] Real-time push (WebSocket / SSE) — only if a spec calls for it
- [ ] User preference persistence (default plant, default time range)

## Cut

~~Struck-through items we decided against, with reasons.~~
