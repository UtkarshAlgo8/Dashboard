# Open Questions Registry

Living file. Every question raised against the BRD lives here.
Every assumption made in lieu of a PM answer lives here.

## How this file is used

- Read by Claude at the start of every spec — open items must be
  surfaced in the spec's Context section.
- Read by you when a PM clarifies something — grep the ID, find every
  affected spec, patch the specs (or write a change request if specs
  have already shipped).
- Read at retrospectives — the resolved entries are a record of what
  the BRD missed. The patterns are how next quarter's BRD gets better.

## Status values

- OPEN      - no answer yet; default assumption is in play
- RESOLVED  - PM/stakeholder has decided; assumption either confirmed
              or replaced. Affected specs patched.
- DEFERRED  - intentionally postponed. Trigger for revisit logged.
- WONTFIX   - decided not to address (e.g. out of scope, non-issue).

## Cost-to-change levels

- LOW    - isolated to one component/endpoint, no data model impact
- MEDIUM - touches a feature or two, possible API contract tweak
- HIGH   - schema change, auth flow, or cross-cutting refactor

## Phase 1 decision summary

User confirmed the following Phase 1 scope on 2026-05-20 (resolving the
ten seed entries Q-AUTH-01 through Q-MOBILE-01):

- **Frontend-only build.** No backend in Phase 1. The frontend ships
  against deterministic mock data + dummy APIs at `src/api/*.js` so the
  resource module shape is in place when the backend is built later.
- **No auth in Phase 1.** Public app behind dev (localhost). Auth
  pattern selection is deferred to the backend phase.
- **Polling every 60 seconds** for KPI / drill / trend data (against the
  dummy APIs in Phase 1; against the real backend later). No WebSocket.
- **KPI set = prototype/artifact** ([artifact.jsx](artifact.jsx)) for
  Phase 1.
- **Single role.** No role branching, no avatar-based routing in Phase 1.
- **Other dashboards visible-but-disabled** in navigation (Quality /
  Engineering / Inventory / other plants) with a tooltip.
- **Export = browser print dialog only.** The dialog's native "Save as
  PDF" is the download path. No separate Export-PDF UI.
- **Environment = dev / localhost only.** Staging and prod deferred.
- **Viewport support = desktop + tablet.** Phone not supported in Phase 1.

The broader BRD gap analysis (122 rows across 8 categories) lives in
[brd-intake-2026-05-20.md](brd-intake-2026-05-20.md). That table still
needs to be walked with the PM and the named Heads to convert
UNANSWERED rows into the full OQR. The ten entries below are the
narrow subset that gates Day-0 scaffolding; the bigger walk produces
the remainder.

## Registry

| ID | Question | Category | Affects | Default assumption | Cost to change | Status | Raised | Resolved |
|----|----------|----------|---------|--------------------|----------------|--------|--------|----------|
| Q-AUTH-01 | Which auth pattern does the dashboard use? (Pattern A localStorage+cookie, Pattern B memory+httpOnly, Pattern C public/VPN) | Actors | architecture, api-contract, app-shell spec | Pattern C (no auth) for Phase 1; pattern selection deferred to backend phase | HIGH | RESOLVED | 2026-05-20 | 2026-05-20 |
| Q-BE-01 | What is the backend repo + base URL serving Banmore Production KPIs? | Integrations | api-contract, all data-flow specs | Originally "no backend". Re-resolved by CR-07 (2026-05-27): backend at `backend/` in this monorepo. Node + Express, no DB. Proxies a single upstream `gold_dummy` API. Base URL `http://localhost:3001/api/v1` for dev. | MEDIUM | RESOLVED | 2026-05-20 | 2026-05-27 |
| Q-GB-01 | What is the gold_dummy column vocabulary (sections, categories, granularity, dates)? | Integrations | backend/src/queries.js | Resolved by CR-07 Postman inspection (2026-05-27): section ∈ {Mixing, Stock, TBM, Curing}; category ∈ {Cost, Morale, Productivity, Quality, Safety}; granularity ∈ {Daily, Shift A, Shift B, Shift C}; date STRING DD-MM-YYYY (use year/month/day INT columns for range); product_type per section (Compound/Cured Tyre/Green Tyre/Stock Component). | LOW | RESOLVED | 2026-05-26 | 2026-05-27 |
| Q-GB-02 | How are NULL string values stored in gold_dummy? | Integrations | backend/src/queries.js, transformers.js | Literal string "nan", not SQL NULL. queries.js uses `= 'nan'`/`!= 'nan'`; transformers.js converts "nan" to null at the API boundary. | LOW | RESOLVED | 2026-05-26 | 2026-05-27 |
| Q-INV-01 | Is the Inventory category in gold_dummy? | Integrations | backend/src/routes/static.js, frontend CategoryTabs.jsx | No — PM 2026-05-27 confirmed "Inventory data I will tell later, not added yet". Backend static.js marks the tab `enabled: false`; frontend CategoryTabs renders disabled with a "Phase 2" tooltip. inventory.js route returns []. Revisit when data lands. | LOW | OPEN-DEFERRED | 2026-05-27 | |
| Q-DATA-01 | Is the dashboard polling-refreshed or push-driven (WebSocket/SSE)? If polling, what interval? | Non-functional | api-contract, landing spec | Polling every 60s. No WebSocket/SSE in Phase 1. | MEDIUM | RESOLVED | 2026-05-20 | 2026-05-20 |
| Q-TR-01 | Time-range presets — what is the exact list? | Entity lifecycle | time-range-filter spec | Per BRD FR-X7 originally Today / Week / Month / Year + custom; revised by CR-05 to three presets: Today / Month / Year + custom (Week dropped). | LOW | RESOLVED | 2026-05-20 | 2026-05-26 |
| Q-SH-01 | Does the new Shift selector (Today only) filter mock data, or is it pure UI for Phase 1? | Entity lifecycle | TimeRangeSelect, ProductionHeader, BanmoreProduction | Pure UI for Phase 1. State lives on the page and is wired through props so consumers can opt in later when shift-tagged mock data lands. No API filter wiring. | LOW | RESOLVED | 2026-05-26 | 2026-05-26 |
| Q-PD-01 | How does the Production drill's "View by Machine" lens know which machine produced each TBM/Curing/Stock SKU row? | Entity lifecycle | mockData.js, ProductionDrillPanel | Add `machine` field to each row in `mockData.js`. Avoids two-source-of-truth between mock data and renderer code. Deterministic assignment from the artifact's machine pools (TBM: VMI Max/VMI Exium/BJ Modules/Stage 1/Stage 2; Curing: Tredge 1–6; Stock: per-sub-selector). | LOW | RESOLVED | 2026-05-26 | 2026-05-26 |
| Q-KPI-01 | Is the KPI list in artifact.jsx the authoritative Phase-1 KPI set? | Entity lifecycle | landing spec | Yes — the prototype KPI list is the Phase-1 scope. Mock data backs it; KPI list may be revised when the BRD intake walk completes. | MEDIUM | RESOLVED | 2026-05-20 | 2026-05-20 |
| Q-USR-01 | Are there role-based views in Phase 1? | Actors | landing spec | No. Phase 1 is single-role, read-only. Avatar may render an initial set but does not gate access. | MEDIUM | RESOLVED | 2026-05-20 | 2026-05-20 |
| Q-NAV-01 | Are Quality / Engineering / Inventory tabs visible-but-disabled in Phase 1 navigation, or hidden entirely? | Non-goals | app-shell spec | Visible but disabled, with a "Phase 2" tooltip. Same for non-Banmore plants. | LOW | RESOLVED | 2026-05-20 | 2026-05-20 |
| Q-EXP-01 | Is browser-print PDF the only export format for Phase 1? | Non-goals | export spec | Yes — Export button triggers `window.print()` (per BRD FR-X26). The browser's native "Save as PDF" is the download path. No separate download UI. | LOW | RESOLVED | 2026-05-20 | 2026-05-20 |
| Q-ENV-01 | What environments are in scope (dev, staging, prod) and what hosts back them? | Non-functional | architecture, env config | dev=localhost only for Phase 1. Staging and prod deferred to the backend phase. | LOW | RESOLVED | 2026-05-20 | 2026-05-20 |
| Q-MOBILE-01 | What's the minimum supported viewport? | Non-functional | every page spec | Desktop + tablet supported in Phase 1. Phone not supported. Exact tablet breakpoint TBD per spec. | LOW | RESOLVED | 2026-05-20 | 2026-05-20 |

## Resolution log

When a question is resolved, append a short note here with the date,
the decision, and which specs were patched as a result. This is the
audit trail.

### 2026-05-20

- **Q-AUTH-01 resolved**: Pattern C (no auth) confirmed for Phase 1.
  Patched: `docs/architecture.md#authentication` (marked Patterns A/B
  as Phase-2-or-later reference), `docs/product.md` (Phase 1 non-goal
  re-confirmed). No specs shipped yet.
- **Q-BE-01 resolved**: backend deferred. Frontend ships against
  `src/lib/mockData.js`. Patched: `docs/api-contract.md` (marked
  DRAFT-DEFERRED status), `docs/architecture.md#data-flow` (mock-data
  toggle becomes the default path for Phase 1).
- **Q-DATA-01 resolved**: 60-second polling, no push. Patched:
  `docs/architecture.md#data-flow`. Each KPI / drill / trend spec must
  reference this cadence.
- **Q-TR-01 resolved**: four presets — Today / Week / Month / Year —
  plus custom From/To, per BRD FR-X7. Seed table previously listed
  "day/week/month/custom" which was incomplete — corrected.
- **Q-KPI-01 resolved**: prototype KPI list is authoritative for Phase 1.
  May be revised after the broader BRD walk
  ([brd-intake-2026-05-20.md](brd-intake-2026-05-20.md)).
- **Q-USR-01 resolved**: single role, no RBAC enforcement in Phase 1.
  Patched: `docs/product.md` Personas section already lists Phase 2+
  for role-specific dashboards.
- **Q-NAV-01 resolved**: visible-but-disabled for the other plants and
  the Quality / Engineering / Inventory tabs. App-shell spec must
  render disabled state with a "Phase 2" tooltip.
- **Q-EXP-01 resolved**: `window.print()` only. No separate PDF download
  UI. Print stylesheet hides interactive overlays per BRD FR-X27.
- **Q-ENV-01 resolved**: dev/localhost only for Phase 1. Patched:
  `docs/architecture.md#environment-variables` (only `VITE_API_BASE_URL`
  pointing at localhost is needed; mock-data toggle handles offline dev).
- **Q-MOBILE-01 resolved**: desktop + tablet supported in Phase 1; phone
  not supported. Tablet breakpoint to be defined in the app-shell spec.

### 2026-05-26

- **CR-05 — artifact refresh** (Today/Month/Year + Shift + View-by):
  - **Q-TR-01 revised**: Week preset dropped. Affected specs patched:
    `specs/04-production-dashboard-shell.md`, `specs/10-trend-modal.md`.
    Trend mock series still includes `week` — leave for future cleanup.
  - **Q-SH-01 raised + resolved**: pure UI. Patched `TimeRangeSelect`,
    `ProductionHeader`, `BanmoreProduction`. CR document at
    `specs/cr/CR-05-time-range-shift-and-view-by.md`.
  - **Q-PD-01 raised + resolved**: machine field added to TBM/Cur/Stock
    drill rows in `mockData.js`. ProductionDrillPanel rewritten with
    `View by` (Machine/SKU/Machine+SKU) and `Unit` (Mixing MT/Batches,
    Stock Units/Kg) lenses. Spec `07-production-drill.md` patched.

### 2026-05-27

- **CR-07 — backend rebuild** (after CR-06's revert):
  - **Q-BE-01 re-resolved**: backend in. Node + Express. Confirmed
    vocabulary baked into queries (no more guessing).
  - **Q-GB-01 raised + resolved**: section / category / granularity /
    product_type / date format all confirmed by Postman SELECT.
  - **Q-GB-02 raised + resolved**: "nan" sentinel instead of SQL
    NULL. Filters + transformers updated.
  - **Q-SH-01 reversed**: was "pure UI". CR-07 wires Shift A/B/C →
    `granularity = 'Shift A/B/C'` in the SQL builders. Today + no
    shift → `granularity = 'Daily'`. The dropdown is no longer a
    no-op.
  - **Q-INV-01 raised, OPEN-DEFERRED**: Inventory data not loaded;
    tab disabled in CategoryTabs with "Phase 2" tooltip.
  - Frontend env flipped: `VITE_USE_MOCK_DATA=false`,
    `VITE_API_BASE_URL=http://localhost:3001/api/v1`.

### Pending (broader BRD walk)

The 122-row intake table at
[brd-intake-2026-05-20.md](brd-intake-2026-05-20.md) is still pending a
PM walk. Once walked, the UNANSWERED + escalated-INFERRED rows will be
added to this registry as Q01, Q02, … and the seed naming convention
(Q-AUTH-01 etc.) will retire.
