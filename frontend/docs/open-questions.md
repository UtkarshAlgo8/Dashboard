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

- OPEN - no answer yet; default assumption is in play
- RESOLVED - PM/stakeholder has decided; assumption either confirmed
  or replaced. Affected specs patched.
- DEFERRED - intentionally postponed. Trigger for revisit logged.
- WONTFIX - decided not to address (e.g. out of scope, non-issue).

## Cost-to-change levels

- LOW - isolated to one component/endpoint, no data model impact
- MEDIUM - touches a feature or two, possible API contract tweak
- HIGH - schema change, auth flow, or cross-cutting refactor

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

| ID          | Question                                                                                                                                                                                                                                                             | Category         | Affects                                                  | Default assumption                                                                                                                                                                                                                                                                                                                                   | Cost to change | Status        | Raised     | Resolved   |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | ------------- | ---------- | ---------- |
| Q-AUTH-01   | Which auth pattern does the dashboard use? (Pattern A localStorage+cookie, Pattern B memory+httpOnly, Pattern C public/VPN)                                                                                                                                          | Actors           | architecture, api-contract, app-shell spec               | Pattern C (no auth) for Phase 1; pattern selection deferred to backend phase                                                                                                                                                                                                                                                                         | HIGH           | RESOLVED      | 2026-05-20 | 2026-05-20 |
| Q-AUTH-02   | When and how should users reset a forgotten password?                                                                                                                                                                                                                | Entity lifecycle | LoginPage.jsx, auth API contract, notification delivery   | Deferred: remove the unavailable login UI until the backend reset-token, delivery, and confirmation flow are defined and implemented.                                                                                                                                                                                                                   | HIGH           | DEFERRED      | 2026-09-01 |            |
| Q-BE-01     | What is the backend repo + base URL serving Banmore Production KPIs?                                                                                                                                                                                                 | Integrations     | api-contract, all data-flow specs                        | Originally "no backend". Re-resolved by CR-07 (2026-05-27): backend at `backend/` in this monorepo. Node + Express, no DB. Proxies a single upstream `gold_dummy` API. Base URL `http://localhost:3001/api/v1` for dev.                                                                                                                              | MEDIUM         | RESOLVED      | 2026-05-20 | 2026-05-27 |
| Q-GB-01     | What is the gold_dummy column vocabulary (sections, categories, granularity, dates)?                                                                                                                                                                                 | Integrations     | backend/src/queries.js                                   | Resolved by CR-07 Postman inspection (2026-05-27): section ∈ {Mixing, Stock, TBM, Curing}; category ∈ {Cost, Morale, Productivity, Quality, Safety}; granularity ∈ {Daily, Shift A, Shift B, Shift C}; date STRING DD-MM-YYYY (use year/month/day INT columns for range); product_type per section (Compound/Cured Tyre/Green Tyre/Stock Component). | LOW            | RESOLVED      | 2026-05-26 | 2026-05-27 |
| Q-GB-02     | How are NULL string values stored in gold_dummy?                                                                                                                                                                                                                     | Integrations     | backend/src/queries.js, transformers.js                  | Literal string "nan", not SQL NULL. queries.js uses `= 'nan'`/`!= 'nan'`; transformers.js converts "nan" to null at the API boundary.                                                                                                                                                                                                                | LOW            | RESOLVED      | 2026-05-26 | 2026-05-27 |
| Q-INV-01    | Is the Inventory category in gold_dummy?                                                                                                                                                                                                                             | Integrations     | backend/src/routes/static.js, frontend CategoryTabs.jsx  | No — PM 2026-05-27 confirmed "Inventory data I will tell later, not added yet". Backend static.js marks the tab `enabled: false`; frontend CategoryTabs renders disabled with a "Phase 2" tooltip. inventory.js route returns []. Revisit when data lands. **2026-10-28:** Gold now carries `category = 'Inventory'` (CTP inventory master + spec 17 Overage read it).                                                                                           | LOW            | RESOLVED      | 2026-05-27 | 2026-10-28 |
| Q-DATA-01   | Is the dashboard polling-refreshed or push-driven (WebSocket/SSE)? If polling, what interval?                                                                                                                                                                        | Non-functional   | api-contract, landing spec                               | Polling every 60s. No WebSocket/SSE in Phase 1.                                                                                                                                                                                                                                                                                                      | MEDIUM         | RESOLVED      | 2026-05-20 | 2026-05-20 |
| Q-TR-01     | Time-range presets — what is the exact list?                                                                                                                                                                                                                         | Entity lifecycle | time-range-filter spec                                   | Per BRD FR-X7 originally Today / Week / Month / Year + custom; revised by CR-05 to three presets: Today / Month / Year + custom (Week dropped).                                                                                                                                                                                                      | LOW            | RESOLVED      | 2026-05-20 | 2026-05-26 |
| Q-SH-01     | Does the new Shift selector (Today only) filter mock data, or is it pure UI for Phase 1?                                                                                                                                                                             | Entity lifecycle | TimeRangeSelect, ProductionHeader, BanmoreProduction     | Pure UI for Phase 1. State lives on the page and is wired through props so consumers can opt in later when shift-tagged mock data lands. No API filter wiring.                                                                                                                                                                                       | LOW            | RESOLVED      | 2026-05-26 | 2026-05-26 |
| Q-PD-01     | How does the Production drill's "View by Machine" lens know which machine produced each TBM/Curing/Stock SKU row?                                                                                                                                                    | Entity lifecycle | mockData.js, ProductionDrillPanel                        | Add `machine` field to each row in `mockData.js`. Avoids two-source-of-truth between mock data and renderer code. Deterministic assignment from the artifact's machine pools (TBM: VMI Max/VMI Exium/BJ Modules/Stage 1/Stage 2; Curing: Tredge 1–6; Stock: per-sub-selector).                                                                       | LOW            | RESOLVED      | 2026-05-26 | 2026-05-26 |
| Q-KPI-01    | Is the KPI list in artifact.jsx the authoritative Phase-1 KPI set?                                                                                                                                                                                                   | Entity lifecycle | landing spec                                             | Yes — the prototype KPI list is the Phase-1 scope. Mock data backs it; KPI list may be revised when the BRD intake walk completes.                                                                                                                                                                                                                   | MEDIUM         | RESOLVED      | 2026-05-20 | 2026-05-20 |
| Q-USR-01    | Are there role-based views in Phase 1?                                                                                                                                                                                                                               | Actors           | landing spec                                             | No. Phase 1 is single-role, read-only. Avatar may render an initial set but does not gate access.                                                                                                                                                                                                                                                    | MEDIUM         | RESOLVED      | 2026-05-20 | 2026-05-20 |
| Q-NAV-01    | Are Quality / Engineering / Inventory tabs visible-but-disabled in Phase 1 navigation, or hidden entirely?                                                                                                                                                           | Non-goals        | app-shell spec                                           | Visible but disabled, with a "Phase 2" tooltip. Same for non-Banmore plants.                                                                                                                                                                                                                                                                         | LOW            | RESOLVED      | 2026-05-20 | 2026-05-20 |
| Q-EXP-01    | Is browser-print PDF the only export format for Phase 1?                                                                                                                                                                                                             | Non-goals        | export spec                                              | Yes — Export button triggers `window.print()` (per BRD FR-X26). The browser's native "Save as PDF" is the download path. No separate download UI.                                                                                                                                                                                                    | LOW            | RESOLVED      | 2026-05-20 | 2026-05-20 |
| Q-ENV-01    | What environments are in scope (dev, staging, prod) and what hosts back them?                                                                                                                                                                                        | Non-functional   | architecture, env config                                 | dev=localhost only for Phase 1. Staging and prod deferred to the backend phase.                                                                                                                                                                                                                                                                      | LOW            | RESOLVED      | 2026-05-20 | 2026-05-20 |
| Q-MOBILE-01 | What's the minimum supported viewport?                                                                                                                                                                                                                               | Non-functional   | every page spec                                          | Desktop + tablet supported in Phase 1. Phone not supported. Exact tablet breakpoint TBD per spec.                                                                                                                                                                                                                                                    | LOW            | RESOLVED      | 2026-05-20 | 2026-05-20 |
| Q-OEE-01    | The OEE Trend Modal "View by Product Type" pill groups OEE rows by which column? `product_type` is NULL for OEE rows (PRODUCT_AGNOSTIC_KPIS exemption, [dashboard-query.js:106-115](../backend/src/queries/dashboard-query.js#L106-L115)); `tyre_type` is populated. | Entity lifecycle | TrendModal.jsx (CR-08), any future product-type grouping | View By "Product Type" maps to the `tyre_type` gold column. The pill label says "Product Type" but the data layer groups by `tyre_type`. Revisit if/when a new gold kpi_name carries a true product_type on OEE rows.                                                                                                                                | LOW            | OPEN          | 2026-08-21 |            |
| Q-KPI-02    | Does the Landing page KPI list expand beyond the prototype's OE / OTIF / Yield?                                                                                                                                                                                       | Entity lifecycle | PlantCard.jsx, specs/03-landing-page.md, specs/cr/CR-10                                                       | CR-10 (2026-08-21) adds "Cured Tire Production" + "Scrap Percentage" to the per-plant PlantCard tiles alongside OE / OTIF / Yield. This deviates from Q-KPI-01 (prototype KPI list = Phase 1 scope). Revisit the BRD intake walk before further landing-KPI changes.                                                                                                                                                  | LOW            | OPEN          | 2026-08-21 |            |
| Q-LP-01     | Should the Landing page's time-range preset set diverge from the production dashboard's?                                                                                                                                                                              | Entity lifecycle | LandingHeader.jsx, TimeRangeSelect.jsx, specs/03-landing-page.md, specs/cr/CR-10                            | Landing shows Today + Month pills only (Year dropped from the visible preset row); Year is still reachable via the custom-range dialog. Differs from Q-TR-01 which applies Today / Month / Year + custom to the production dashboard.                                                                                                                                                                          | LOW            | OPEN          | 2026-08-21 |            |
| Q-LP-02     | How is Cured Tire Production's MT (mass) value derived?                                                                                                                                                                                                              | Entity lifecycle | backend/src/controllers/static.controller.js, CR-10, PlantCard.jsx                                            | Gold carries only NOS for Curing Production_product. MT is computed as `NOS * AVG_MASS_PER_TIRE_KG / 1000` with a config constant (placeholder 10 kg/tire for PCR — configurable per plant). Revisit when the gold layer carries a true mass field or per-tire-mass lookup.                                                                                                                                              | LOW            | OPEN          | 2026-08-21 |            |
| Q-DT-01     | How is the new "Total Downtime" KPI value computed?                                                                                                                                                                                                                  | Entity lifecycle | kpi-transformer.js, DowntimeDrillPanel.jsx, MultiSeriesTrendModal (CR-11)                                    | "Total Downtime" is a frontend virtual kpi_name. The v2 endpoint accepts the 6 availability-loss reasons (Breakdown, No Schedule, Power Failure, Preventive Maintenance, Setup & Change, Operations/Material/Manpower) in one `drillKpis` array; the frontend sums them per day for the tile value and the plot's "Overall" series. No backend virtual-kpi plumbing today; revisit if/when a single-row "TotalDowntime" gold row appears. | LOW            | OPEN          | 2026-08-21 |            |
| Q-DT-02     | What does the deepest drill level for Downtime look like — true sub-reasons or per-event rows?                                                                                                          | Entity lifecycle | DowntimeDrillPanel.jsx (CR-11)                                                                               | The 6 reason leaves are gold-level leaves (no further hierarchy). The deepest drill is the per-event table — (date, machine, actual_value) rows where that reason fired, sorted by value desc. Revisit if/when a sub-reason taxonomy lands in the gold layer.                                                                                                                                                    | LOW            | OPEN          | 2026-08-21 |            |
| Q-OVG-01    | Does each Gold run replace the inventory rows, or do old runs accumulate in the table? | Integrations | backend overage query, specs/17-overage-material.md | Each run replaces the rows. Overage reads all dates with no run filter. If runs accumulate, every lot is counted once per run — Gold then needs a run-timestamp column and the query a latest-run filter. | MEDIUM | OPEN | 2026-10-28 |            |
| Q-OVG-02    | What does "Last refreshed" on the Overage card show while Gold has no run timestamp? | Integrations | OverageDrill, specs/17-overage-material.md | Plant as-of date from `getAsOf` (latest data date, not Gold run time). Switch to the run timestamp once Gold exposes one. | LOW | OPEN | 2026-10-28 |            |
| Q-OVG-03    | What is the target / RAG rule for Overage Material? | Entity lifecycle | BanmoreTechnical.jsx (Stock `ovg` card), specs/17-overage-material.md | No target defined — the card shows no status colour and no target line. | LOW | OPEN | 2026-10-28 |            |
| Q-OVG-04    | Which requirement ID (FRS/US) does the Overage Material card trace to? | Non-goals | specs/17-overage-material.md | None found — flagged. Spec proceeds on the Gold read note supplied 2026-10-28. | LOW | OPEN | 2026-10-28 |            |

## BTP Safety follow-up (2026-11-10)

- **Q-BTP-SAFETY-01 — OPEN (data team):** Live Gold has no November Safety rows; latest DAY/SHIFT data for all three names is 10-Jun-2026, with MONTH anchor 01-Jun-2026. Confirm source coverage and backfill if observations exist. See [data-team handoff](../../docs/btp-safety-data-team-handoff-2026-11-10.md).
- **Q-BTP-SAFETY-02 — RESOLVED (dashboard):** User approved Safety-specific handling of upstream SQL NULL encoded as exactly `""`, preserving missing data as null and explicit zero as zero. Strict numeric, pagination and reconciliation validation remains in place. User requested removing the page-level red Safety error banner; unavailable/no-published-data card states remain. Upstream JSON-null preservation is a separate data-team follow-up.

## BTP Stock Cost follow-up (2026-11-10)

See [spec 19](../specs/19-btp-stock-cost.md).

- **Q-BTP-STOCK-01 — RESOLVED:** User chose latest published DAY within the selected month/range for the card, explicitly labelled, with no sum across dates. DAY-only Stock Cost ignores the shift selection and says All shifts. Trends open in a modal; the category drill uses the existing right-hand panel.
- **Q-BTP-STOCK-02 — DEFERRED:** Daily movement vs closing stock balance remains unconfirmed. Do not implement MTD or other sums across dates until clarified.
- **Q-BTP-STOCK-03 — DEFERRED:** No budget/threshold is defined. Card and change percentage stay neutral; no RAG or inferred better/worse direction.
- **Q-BTP-STOCK-04 — DEFERRED:** No item-level Gold block is published. Stop at category; revisit only when level-3 itemcode data is confirmed.
- **Q-BTP-STOCK-05 — RESOLVED:** Live Gold includes BT and L beyond the guide's example units. User confirmed displaying every published nonempty UoM separately, preserving its raw label, never combining or converting units.

## BTP compliance follow-up (2026-11-05)

See [spec 18](../specs/18-btp-compliance-kpis.md).

- **Q-BTP-COMP-01 — RESOLVED:** User confirmed that PM/Daily Check Sheet/Critical Parameter percentages use exact stored periods only. Unsupported arbitrary ranges show an explanation; never average/sum percentages or substitute the last day.
- **Q-BTP-COMP-02 — RESOLVED (UI follow-up supersedes original choice):** User now requests removing the five inactive Maintenance placeholders and the not-connected heading. Keep the two real connected cards visible even on empty/error periods. Remove only the standalone Daily counts summary strip; retain section → machine navigation and count columns in drill tables.
- **Q-BTP-COMP-03 — OPEN (data team):** The November 2026 PM `_m` row for Curing has a blank machine. The drill excludes anonymous machine rows and displays an empty state until Gold supplies the machine dimension. No non-PM count/name fallback.
- **Q-BTP-COMP-04 — OPEN (business rules):** No target/RAG thresholds are specified for the three new KPIs. User approved non-RAG brand-blue card presentation using existing theme tokens, explicitly not a pass/fail rule; no thresholds or targets are invented. Critical Parameter's guide defines a severe-violation percentage (lower is better); its raw Gold value is not inverted and the old mock 100% target is removed.

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
