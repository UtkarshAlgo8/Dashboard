# JK Dashboard

## What it is

A plant-operations dashboard for JK Tyres. It surfaces real-time KPIs,
drill-downs, and trend visualisations for plant managers, line supervisors,
and corporate stakeholders so they can act on production, quality,
engineering, and inventory data without leaving the dashboard.

The eventual product covers four plants (Banmore, Chennai, Laksar, Mysore),
three function dashboards (Production, Quality, Engineering), and a
comprehensive Inventory view. Today, all data in the prototype
([docs/artifact.jsx](artifact.jsx)) is deterministic mock data; the
document describes the behaviour, drill-down flows, and visualisations
that the prototype renders today.

**Phase 1 ships Banmore plant + Production function only.** Other plants
and dashboards are visible in the prototype as the eventual target — they
are explicitly out of scope for Phase 1 (see "What this product is NOT"
below).

The authoritative BRD lives at [../../docs/brd.docx](../../docs/brd.docx)
(shared between frontend and backend in this monorepo). Run the BRD
intake pass (Part I.5) against that doc before writing any specs;
this file is the slim, living summary.

## Who uses it

- **Plant manager (Banmore)** — opens the dashboard daily; needs the
  Production landing view (KPIs, trends, anomalies) and one-click drill
  into any underperforming KPI.
- **Line supervisor** — drives operational decisions on the floor; needs
  fast drill from a red KPI to the contributing sub-metrics and the
  recent shift trend.
- **Corporate / cross-plant stakeholder** *(Phase 2+)* — compares plants
  on the same scorecard; needs the multi-plant landing and consistent
  KPIs across plants.
- **Quality lead** *(Phase 2+)* — uses the Quality dashboard for SPC
  charts, process/product/complaint drills.
- **Engineering / reliability lead** *(Phase 2+)* — uses the Engineering
  dashboard for reliability, maintenance, utility, project, and FMEA views.
- **Inventory controller** *(Phase 2+)* — uses the Inventory view.

## Core problems it solves

1. Plant KPIs live in spreadsheets, MES exports, and tribal knowledge.
   The dashboard makes them visible in one place, with a consistent
   visualisation language, so a manager can spot a trend in seconds
   instead of an afternoon.
2. When a KPI is off-target, the path from "the number is red" to "this
   shift, this line, this defect type" is multi-tool today. The
   drill-down flows collapse that path into a click sequence.
3. Cross-plant comparison is impossible without a normalised scorecard.
   Phase 2+ delivers that; Phase 1 proves the scorecard shape on Banmore
   first.

## Key user flows

- **Flow A — Production landing (Phase 1):** Plant manager opens
  Banmore → Production → sees KPI grid with traffic-light status, recent
  trend sparklines, and the anomaly strip. Identifies a red KPI.
- **Flow B — KPI drill (Phase 1):** Clicks a red KPI → DrillPanel
  expands with sub-metric tabs, the contributing chart (bar / trend /
  control chart), and a "what to do next" hint.
- **Flow C — Trend inspection (Phase 1):** From any KPI tile, clicks the
  trend icon → TrendPanel opens as a side-sheet showing the configurable
  time range (day / week / month) with best/worst markers and the target line.
- **Flow D — Time range filter (Phase 1):** Adjusts the global time
  range (preset or custom from/to) → all KPIs, trends, and drills
  recompute against the new window.
- **Flow E — Tyre type filter (Phase 1):** Filters by tyre type (where
  applicable) → KPI grid recomputes; tiles where the filter does not apply
  show a disabled banner with the reason.
- **Flow F — Cross-plant landing** *(Phase 2+)* — picks Banmore / Chennai
  / Laksar / Mysore → opens that plant's Production dashboard.
- **Flow G — Quality / Engineering / Inventory** *(Phase 2+)* — see
  prototype.

The detailed flows, KPI list, and drill structure are encoded in the
deterministic-mock prototype at [docs/artifact.jsx](artifact.jsx) — that
file is the visual + behavioural source of truth for Phase 1 UI parity.

## What this product is NOT

Phase 1 explicit non-goals (sliding to Phase 2+ unless promoted). All
items below are confirmed by user decisions logged in
[open-questions.md](open-questions.md) on 2026-05-20 unless flagged
otherwise.

- **Multi-plant support.** Phase 1 is Banmore only. Other plant entries
  appear in navigation but are visible-but-disabled with a "Phase 2"
  tooltip (Q-NAV-01).
- **Quality, Engineering, and Inventory dashboards.** Phase 1 renders the
  Production dashboard only. The other tabs render visible-but-disabled
  in navigation; their pages are not implemented (Q-NAV-01).
- **Real backend data.** Phase 1 has no backend (Q-BE-01). The frontend
  ships against `src/lib/mockData.js` exposed via dummy resource modules
  at `src/api/*.js`. Backend work begins after Phase 1 ships.
- **User authentication.** No auth, no login page, no `<RequireAuth>` in
  Phase 1 (Q-AUTH-01). Pattern selection deferred to the backend phase.
- **Role-based access (RBAC).** Single role only in Phase 1 (Q-USR-01).
  No role branching, no avatar-gated views.
- **Phone-sized viewports.** Desktop and tablet only (Q-MOBILE-01). Exact
  tablet breakpoint set per the app-shell spec.
- **Real-time push.** Polling every 60 seconds against the dummy APIs is
  the only refresh mechanism (Q-DATA-01). No WebSocket, no SSE.
- **Export beyond browser print.** Export uses `window.print()` only
  (Q-EXP-01); the browser dialog's "Save as PDF" is the download path.
  No separate Export-PDF UI.
- **Editing data.** The dashboard is read-only in Phase 1.
- **Staging / production environments.** Dev / localhost only (Q-ENV-01).
  Staging and production hosting deferred to the backend phase.

## Current phase

**Phase 1 (greenfield)** — the prototype at docs/artifact.jsx is a
single-file mock; the structured Vite + MUI app is being scaffolded now.
Phase-1 polish target: a manager could use Banmore Production as their
daily landing without falling back to the prototype.

## Audience for the work right now

Internal stakeholders + the Banmore plant team. Phase 1 has to be
something we'd put in front of one real plant manager and a couple of
supervisors for hands-on feedback. Phase 2+ widens to cross-plant
demonstrations.

---

> **Day-0 reminder:** before writing any spec, run the **BRD intake pass**
> (Playbook Part I.5) against ../../docs/brd.docx. The output seeds
> docs/open-questions.md and patches this file. The intake pass is the
> cheapest 1.5 hours you will spend on this project.
