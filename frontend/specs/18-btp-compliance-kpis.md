# BTP compliance KPIs — Engineering Maintenance and Quality Process

Implemented against the user-supplied `checksheet_pm_compliance_kpis (3).md` (2026-11-05). The previously supplied Uniformity guide is not the specification for this work.

## UI scope

- `/banmore/engineering` → **Maintenance**: show only the connected **PM Compliance** and **Daily Check Sheet Compliance** cards, with plant → section → machine drills. The follow-up UI request removes the five inactive placeholder cards and the not-connected heading. Connected cards remain visible for empty periods, loading and upstream errors.
- `/banmore/quality` → **Process** → **Critical Parameter Compliance**, using the same section → machine drill component.
- Both BTP pages use one selected drill in the right-hand `KpiSplitLayout` panel, with the other cards stacked at the left on desktop and the established stacked layout below `lg`. Switching Quality Process drills replaces the prior panel; opening a Process trend closes the drill and vice versa.
- BTP only; no CTP behavior changes. No infrastructure, deployment or new dependencies.

## Authoritative mapping

| UI/API ID | Exact overall Gold name | Section / machine |
| --- | --- | --- |
| `daily` | `mechanicalchecksheet_Plan_Compliance_o` | replace `_o` with `_s` / `_m` |
| `pm` | `technicalchecksheet_Plan_Compliance_pm_o` | replace `_o` with `_s` / `_m` |
| `critical` | `Critical_Parameter_Compliance_o` | replace `_o` with `_s` / `_m` |

Daily Check Sheet also reads exact level-matched `mechanicalchecksheet_Total_Planned_*`, `mechanicalchecksheet_Complied_*`, `mechanicalchecksheet_Non_Complied_*`, `mechanicalchecksheet_Missed_*`, and `mechanicalchecksheet_In_Progress_*` counts. The standalone “Daily Check Sheet counts (NOS) · BTP” plant-summary tile strip is removed by the follow-up UI request. Section/machine count columns remain in the actual drill tables alongside their published percentages; API counts are unchanged. Missing counts stay missing, not zero-filled.

**No PM or Critical Parameter count KPIs are invented.** In particular, `technicalchecksheet_Planned_Nos_*` / `technicalchecksheet_Actual_Nos_*` must not be paired with PM Compliance.

All reads use `plant = 'BTP'`, exact case-sensitive KPI names, one date/granularity and the current drill dimension. **No department/category predicates:** the current feed labels even the mechanical/PM rows as Quality / Process Audit, despite displaying them under Engineering Maintenance.

## Business semantics

- Daily: completed ÷ planned check sheets, excluding cancelled schedules.
- PM: completed PM check sheets ÷ PM check sheets planned up to today, excluding cancellations.
- Critical Parameter: severe / Severe and Poka Yoke violations ÷ critical-parameter questions checked in submitted process audits up to today × 100. Despite its compliance name, the guide defines a **violation percentage: lower is better**. The UI explains this; it does not show `100 − value` or keep the old mock 100% target.
- Gold percentages remain authoritative at **every** level. Never sum/average child percentages, derive an overall value from counts, or add shifts to make a day. Critical precision remains intact in the API; display formatting does not alter stored values.
- No target/RAG thresholds were supplied. The user approved a **non-RAG brand-blue presentation** using the existing card/theme tokens: tinted background, brand value/icon/progress colours, and an explanatory tooltip. Blue does not imply pass/fail. Raw values, `status: null` and `target: null` remain unchanged. Existing status-coloured Quality/Production cards and default CTP card behavior are unaffected by the opt-in presentation.
- `drill_down_attribute` is NULL for this family. The registry links `_o` → `_s` → `_m` explicitly; machines are leaves.

## Period contract

User confirmed: **stored periods only** for these KPIs. An arbitrary custom range shows an explanation and does not query/recompute compliance; other dashboard KPIs retain their existing behavior.

- DAY: selected schedule date.
- SHIFT A/B/C: selected schedule date, exact shift grain; Maintenance's Today view now exposes the shift selector.
- MONTH: first date of the selected month.
- YEAR: 1 January.
- Single-day, whole-month or whole-year custom selections can resolve to their exact published DAY/MONTH/YEAR row. Any other range is unsupported, including a partial-month range: it must not silently become its last day.
- Future schedule dates exist in the source (some Daily Check Sheet dates extend to 2120). No automatic latest-date fallback is used; all new reads pin the selected period.

The backend uses the existing configured Gold source policy: recent DAY/SHIFT reads go to `gold.gold_daily` within the configured reliable fresh window, historical dates to `gold.gold`, and MONTH/YEAR always to the base table. Sources are never unioned to add duplicate percentages. All network reads explicitly use **Athena**.

## API

Authenticated route:

```text
GET /api/v1/compliance
    ?plant=BTP
    &kpis=pm,daily,critical
    &date=2026-11-01
    &granularity=MONTH
    &level=overall|section|machine
    [&section=Curing]  # required only for level=machine
```

`kpis` accepts only the three registered IDs. Granularity accepts DAY, MONTH, YEAR, SHIFT A/B/C. Invalid dates, bad period anchors, unknown IDs/levels, non-BTP plants, and range parameters return 400 before any Athena call. Section literals are escaped.

Response: `{data:{context:{plant,ids,date,granularity,level,section?},kpis:{[id]:{value,counts,rows}}}}`. Overall has one published value; child levels return independent rows `{section,machine,value,counts}`. Empty rows/values remain unavailable. Successful exact contexts cache for 60 seconds; failures are not cached as empty data. Conflicting duplicate published values or a potentially truncated 5,000-row response fail closed rather than silently choosing/summing rows.

## Live validation / data-team follow-up

Read-only Athena checks on 2026-11-05, MONTH / 2026-11-01:

- PM overall: **100%**; Curing section: **100%**.
- Daily overall: **12.34%**. Counts: planned **2,739**, complied **338**, non-complied **10**, missed **24**, in-progress **24**. Six section rows; Curing machine drill returned **172** machines and their exact counts/percentages.
- Critical overall: **1.744186046511628%** (not inverted). Five section rows; Curing machine drill returned **34** machines.
- **PM data issue:** `technicalchecksheet_Plan_Compliance_pm_m` exists, but its November MONTH/Curing row has a blank `machine`. The app excludes anonymous machine dimensions and shows “No published machine rows for this period.” The data team must populate the machine field for a usable PM machine drill; do not synthesize names or fall back to non-PM technical checksheets.

Reproduce the PM issue:

```sql
SELECT date, granularity, section, machine, actual_value
FROM gold.gold
WHERE plant = 'BTP'
  AND kpi_name = 'technicalchecksheet_Plan_Compliance_pm_m'
  AND granularity = 'MONTH'
  AND date = DATE '2026-11-01';
```

## UI follow-up verification

- 17 frontend checks passed (8 compliance presentation/state regressions and 9 existing Engineering period tests); 50 backend compliance/Quality/Engineering checks passed with one existing workbook-integration skip.
- Frontend ESLint, full source formatting and production build passed. The full mechanical gate still fails on existing forbidden patterns; all 21 files responsible were verified unchanged from `HEAD`.
- Headless Chrome with mocked API fixtures verified brand tint, retention of connected cards on empty/error responses, removal of only the standalone summary/inactive placeholders, Daily drill count columns, section → machine navigation, desktop right-hand positioning, mobile stacked panels, and mutually exclusive Quality CPC/PQR/close/trend transitions. No uncaught browser exceptions. These follow-up UI checks did not query live Athena or modify backend contracts.

## Context / verification

Backend: `backend/src/compliance/{registry,queries,routes,compliance.test}.js`, mounted under the existing auth gate in `backend/src/app.js`.

Frontend: `src/api/compliance.js`, `src/lib/compliance.js`, `src/components/compliance/ComplianceDrillPanel.jsx`, `src/pages/engineering/EngineeringMaintenanceSection.jsx`, `src/pages/BanmoreEngineering.jsx`, `src/pages/quality/QualityDashboard.jsx`, and the Maintenance tab flag in `src/lib/mockData.js`.

Validation includes exact-name SQL/registry checks, BTP scoping, input/escaping validation, daily count isolation, no PM count pairing, raw percentage precision, no aggregation, fresh-vs-base routing, duplicate/truncation handling, caching/error propagation, existing Engineering/Quality regressions, frontend lint/format/build and headless Chrome. Browser verification forwarded new compliance requests through the isolated backend to **real Athena**, while mocking unrelated page APIs/auth hydration. It covered both pages, drill hierarchy, counts, missing PM machines, shift input, custom-range rejection without compliance requests, and visible upstream errors with no uncaught browser exceptions. This is not a deployed-environment/auth-session validation.
