# BRD Intake Pass — 2026-05-20

8-category gap analysis run against [`../../docs/brd.docx`](../../docs/brd.docx)
(Document Version 1.1, 01 May 2026, "One Factory One Dashboard").

**Status: draft.** Walk this table with the PM (and the named Heads where
applicable). Per Playbook Part I.5:

- Every **UNANSWERED** row → OQR entry in `docs/open-questions.md`.
- Every **INFERRED** row → confirmed (becomes ANSWERED, add the missing
  line to `docs/product.md`) or escalated (becomes UNANSWERED, OQR entry).
- Every **ANSWERED** row → no action; the cited BRD section is the answer.

After the walk, replace the seed table in `docs/open-questions.md` with
the UNANSWERED + escalated-INFERRED rows (assigned IDs Q01, Q02, …).

---

| #  | Category | Question | Status | Evidence / Inference |
|----|----------|----------|--------|----------------------|
| 1  | Actors & permissions | Does the production deployment enforce role-based access (RBAC), or remain avatar-only as the prototype does? | UNANSWERED | §4: "the prototype does not enforce role-based access." Production rollout is silent. |
| 2  | Actors & permissions | What is the canonical role list for production (PH, PFH, TFH, QFH, EFH, Supervisor) and the read/write capabilities of each? | UNANSWERED | §4 enumerates avatar codes only. No capability matrix. |
| 3  | Actors & permissions | Can a non-Plant-Head user view the Production Dashboard for any plant, or only their home plant? | UNANSWERED | §5.3 (FR-L12) describes plant selection without access scoping. |
| 4  | Actors & permissions | Who is permitted to download the Traceability Report CSV? | UNANSWERED | FR-P56 specifies the click action only. No actor restriction. |
| 5  | Actors & permissions | Who is permitted to change a user's password? Self-service only, or admin-reset path too? | INFERRED | FR-X21 describes a self-service Change Password modal. Admin reset path is not mentioned. |
| 6  | Actors & permissions | Is there a default landing page per role, or do all roles see the same Landing Page? | UNANSWERED | §5 describes one Landing Page; per-role customisation is unspecified. |
| 7  | Actors & permissions | Are there service accounts / shared kiosk logins for on-floor displays? | UNANSWERED | Not addressed. |
| 8  | Actors & permissions | For Banmore Phase 1, which roles must be functional at launch (PH, PFH, Supervisor)? | UNANSWERED | BRD does not sequence phases. |
| 9  | Actors & permissions | Can the same user be signed in from multiple devices simultaneously? | UNANSWERED | Not addressed. |
| 10 | Actors & permissions | Does the Theme preference (FR-X22) persist per user, per device, or per session? | UNANSWERED | FR-X22 lists options only; persistence model is unspecified. |
| 11 | Entity lifecycle | What states does a Production ID move through (planned → in-progress → completed → on-hold → scrapped)? | UNANSWERED | FR-P53 lists Production ID fields; no state machine. |
| 12 | Entity lifecycle | When is a Production ID created and by whom (MES, manual entry, both)? | UNANSWERED | Source system is unspecified. |
| 13 | Entity lifecycle | Can a Production ID be edited or its scrap quantity adjusted retroactively from the dashboard? | INFERRED | All FRs are display-only; the dashboard appears read-only. Not stated. |
| 14 | Entity lifecycle | What states does a Customer Complaint have? (FR-Q5 mentions a "status" column but does not enumerate values.) | UNANSWERED | FR-Q5. |
| 15 | Entity lifecycle | What states does a Lot Hold / Segregation case have? | UNANSWERED | FR-Q5. |
| 16 | Entity lifecycle | What states does an Anomaly (FR-E2) have? (Detected → Acknowledged → Resolved → False positive?) | UNANSWERED | FR-E2 mentions count only. |
| 17 | Entity lifecycle | What states does a PM Task have? (Scheduled → In progress → Done → Overdue?) | UNANSWERED | FR-E4 mentions "Overdue PMs" count only. |
| 18 | Entity lifecycle | What states does a Capex Project have? | UNANSWERED | FR-E6 mentions "Active Projects" count only. |
| 19 | Entity lifecycle | What is the lifecycle of a Spare Stockout (Open → Replenished)? | UNANSWERED | FR-E4. |
| 20 | Entity lifecycle | When the active section is switched (Mixing → TBM), what happens to any open drill-down panel? | UNANSWERED | Not addressed. |
| 21 | Entity lifecycle | When Time Range or Tyre Type changes while a drill is open, does the drill recompute, close, or stay stale? | UNANSWERED | FR-X1 & FR-X6 describe the controls but not their interaction with open drills. |
| 22 | Entity lifecycle | Do filter selections (Time Range, Tyre Type, Shift, plant) persist across navigation back to Landing? | INFERRED | FR-L18 says plant selection is preserved on back-arrow. Other filters are silent. |
| 23 | Entity lifecycle | Is the Trend Modal time range coupled to the dashboard time range or independent? | INFERRED | FR-X6 says the same component is used in both; coupling is ambiguous. |
| 24 | Entity lifecycle | When KPI source data becomes stale (e.g. MES offline), how is that surfaced — stale badge, blank, last-good value? | UNANSWERED | Not addressed. |
| 25 | Entity lifecycle | Is there a scheduled maintenance / blackout window where KPIs are intentionally blank? | UNANSWERED | Not addressed. |
| 26 | Error & exception flow | What does the user see when the backend is unreachable? | UNANSWERED | No FR addresses connectivity errors. |
| 27 | Error & exception flow | What does the user see on a 401 (session expired)? | UNANSWERED | Not addressed. |
| 28 | Error & exception flow | What does the user see on 5xx errors from the backend? | UNANSWERED | Not addressed. |
| 29 | Error & exception flow | What does a KPI card render when its data is missing for the current time range — zero, dash, "no data" badge? | INFERRED | FR-P42 defines an empty-state for sub-drills only ("No [sub-category] recorded for [Machine]…"). KPI-card empty state is unspecified. |
| 30 | Error & exception flow | What if the user enters From > To in the Time Range custom inputs? Validation? Silent swap? Disabled? | UNANSWERED | FR-X9 says editing clears the preset highlight; no validation rule. |
| 31 | Error & exception flow | What if the user picks a future date or a date before data availability begins? | UNANSWERED | Not addressed. |
| 32 | Error & exception flow | What is the maximum custom range allowed (e.g. ≤ 365 days)? | UNANSWERED | Not addressed. |
| 33 | Error & exception flow | If CSV generation fails client-side, how is the user notified? | UNANSWERED | FR-P56–FR-P59 describe success path only. |
| 34 | Error & exception flow | If the Trend modal's data fails to load, does the modal show an error inline or close? | UNANSWERED | Not addressed. |
| 35 | Error & exception flow | What if a section has no machines configured (e.g. a new plant during onboarding)? | UNANSWERED | Not addressed. |
| 36 | Error & exception flow | What if a Process Parameter normal range is undefined for a given Banbury — does the chip render unflagged or flagged-unknown? | UNANSWERED | FR-P55 describes out-of-range flagging only. |
| 37 | Error & exception flow | What about the case where Print is cancelled by the user or printing fails — silent or toast? | INFERRED | FR-X26 calls window.print(); browser-native silent behaviour assumed. |
| 38 | Error & exception flow | Which errors are recoverable (retry button) vs terminal (logout / redirect)? | UNANSWERED | Not addressed. |
| 39 | Error & exception flow | Are errors logged client-side (Sentry, etc.) for triage? | UNANSWERED | Not addressed. |
| 40 | Data ownership (CRUD) | Where do KPI values originate in production — MES, SCADA, manual entry, calculated client-side? | UNANSWERED | §1 says "deterministic mock data" today; production source is unspecified. |
| 41 | Data ownership (CRUD) | Who owns Machine master data (machine names, section assignment)? | INFERRED | FR-P32 hard-codes Banbury 1–5, VMI Max, etc. Production source is unspecified. |
| 42 | Data ownership (CRUD) | Who owns Compound master data (item codes, descriptions, batch sizes)? | UNANSWERED | FR-P45–FR-P48 describe usage; ownership system unspecified. |
| 43 | Data ownership (CRUD) | Who owns Process Parameter normal ranges (Drop Temp, TCU, Rotor, Mix Time, Power)? | UNANSWERED | FR-P55 uses ranges; ownership unspecified. |
| 44 | Data ownership (CRUD) | Who owns User Profile data (name, role, plant, email, phone, employee ID, joined date)? | UNANSWERED | FR-X20 lists fields; HRIS or identity provider unspecified. |
| 45 | Data ownership (CRUD) | Are the My Profile fields editable from the dashboard or read-only? | INFERRED | FR-X20 says "opens a modal showing"; editability is not stated → likely read-only by default. |
| 46 | Data ownership (CRUD) | Can a MANUAL-input KPI (per FR-Q3) be edited from the dashboard, or only viewed? Who has edit rights? | UNANSWERED | FR-Q3 describes the badge but not the edit workflow. |
| 47 | Data ownership (CRUD) | Are Customer Complaints editable from the Quality Dashboard or view-only? | INFERRED | FR-Q5 says "supports drill into … cases listing …" — view-only inferred. |
| 48 | Data ownership (CRUD) | Are Capex Project status updates editable from the Engineering Dashboard? | UNANSWERED | FR-E6 lists KPIs only. |
| 49 | Data ownership (CRUD) | Are Anomalies acknowledgeable / closable from the dashboard? | UNANSWERED | FR-E2 lists count only. |
| 50 | Data ownership (CRUD) | Is there an audit log of who viewed which plant / downloaded which CSV / saved which PDF? | UNANSWERED | Not addressed. |
| 51 | Data ownership (CRUD) | When the dashboard cache disagrees with the source system (MES/SCADA), which wins? | UNANSWERED | Cache strategy unspecified. |
| 52 | Data ownership (CRUD) | Is the live Inventory stock figure (FR-P65) authoritative or a cached read from a WMS? | UNANSWERED | Source system unspecified. |
| 53 | Data ownership (CRUD) | Does the dashboard persist any per-user preference (default plant, default time range, theme)? Where? | UNANSWERED | Not addressed. |
| 54 | Data ownership (CRUD) | Does the dashboard write any data (e.g. CSV-download events for audit)? | UNANSWERED | Not addressed. |
| 55 | Concurrency & idempotency | What is the KPI data refresh strategy — poll (cadence?), WebSocket push, on-demand only? | UNANSWERED | Not addressed. |
| 56 | Concurrency & idempotency | If two users download a Traceability CSV for the same Item Code on the same day, the filename is identical — is that acceptable? | INFERRED | FR-P57 specifies `traceability_[ItemCode]_[YYYY-MM-DD].csv`; collision is possible. |
| 57 | Concurrency & idempotency | If a user has the dashboard open in two tabs, do filter changes in one tab affect the other? | UNANSWERED | Not addressed. |
| 58 | Concurrency & idempotency | If a user clicks Download Traceability twice in quick succession, is it idempotent (one file) or fire-twice (two files)? | INFERRED | Browser default would fire twice; explicit dedupe not specified. |
| 59 | Concurrency & idempotency | While Trend Modal data is loading, what happens if the user changes Time Range inside the modal? | UNANSWERED | Not addressed. |
| 60 | Concurrency & idempotency | If a user changes Tyre Type while a drill is open and data is in-flight, which response wins (latest request or first-arriving)? | UNANSWERED | Not addressed. |
| 61 | Concurrency & idempotency | If the access token expires while a long CSV generation is in flight, does the download fail or auto-refresh? | UNANSWERED | Not addressed. |
| 62 | Concurrency & idempotency | If two users edit the same MANUAL-input KPI simultaneously, what's the resolution rule (last-write-wins, conflict prompt)? | UNANSWERED | Edit flow itself is not specified, so concurrency is moot until then. |
| 63 | Non-functional | Expected peak concurrent users (per plant, total)? | UNANSWERED | Not addressed. |
| 64 | Non-functional | Expected average concurrent users? | UNANSWERED | Not addressed. |
| 65 | Non-functional | Page-load latency budget for the Landing Page? | UNANSWERED | Not addressed. |
| 66 | Non-functional | KPI-grid load latency budget after section switch? | UNANSWERED | Not addressed. |
| 67 | Non-functional | Drill-open latency budget? | UNANSWERED | Not addressed. |
| 68 | Non-functional | Trend Modal open latency budget? | UNANSWERED | Not addressed. |
| 69 | Non-functional | Traceability CSV generation max time (and max row count) before a progress indicator is required? | UNANSWERED | Not addressed. |
| 70 | Non-functional | Supported browser matrix (min Chrome, Edge, Safari, Firefox versions)? | UNANSWERED | Not addressed. |
| 71 | Non-functional | Tablet support — required, best-effort, or out of scope? | UNANSWERED | Not addressed. Prototype is desktop-first by appearance. |
| 72 | Non-functional | Phone support — same question. | UNANSWERED | Not addressed. |
| 73 | Non-functional | Minimum supported viewport width? | UNANSWERED | Not addressed. |
| 74 | Non-functional | Data retention period for Production IDs, Scrap events, Downtime events, Process Parameters? | UNANSWERED | Not addressed. |
| 75 | Non-functional | Audit log retention period (if audit is required at all)? | UNANSWERED | Not addressed. |
| 76 | Non-functional | Compliance constraints — Indian IT Act / DPDP Act, EU users (GDPR), industry-specific (ISO 9001 audit trail)? | UNANSWERED | Not addressed. |
| 77 | Non-functional | Accessibility — target WCAG level (A / AA / AAA)? Screen-reader compatibility expectation? | UNANSWERED | Not addressed. |
| 78 | Non-functional | Internationalisation — English-only, or multi-language at launch / later? | INFERRED | BRD copy is English; multi-lang requirement is unspecified. |
| 79 | Non-functional | Time-zone handling — display in plant local time, browser local, or fixed (IST)? CSV timestamps in which zone with which suffix? | UNANSWERED | Not addressed. |
| 80 | Non-functional | Number formatting — Indian numbering (1,00,000) or Western (100,000)? | UNANSWERED | Not addressed. |
| 81 | Non-functional | Currency for Production Loss (₹) and Capex (₹) — confirmed INR, no FX. | ANSWERED | FR-E2 uses "Production Loss (₹)". |
| 82 | Non-functional | Print stylesheet target — A4, US Letter, both, or auto? | UNANSWERED | FR-X27 mentions print-friendly stylesheet but not paper size. |
| 83 | Non-functional | Observability — what dashboards / logs are operators expected to consult when the app misbehaves? | UNANSWERED | Not addressed. |
| 84 | Non-functional | Uptime SLA for the dashboard service? | UNANSWERED | Not addressed. |
| 85 | Non-functional | Backup and disaster-recovery RPO/RTO? | UNANSWERED | Not addressed. |
| 86 | Non-functional | Security — pen-test cadence, vulnerability scanning, dependency-audit policy? | UNANSWERED | Not addressed. |
| 87 | Non-functional | Network footprint — VPN-fronted intranet, public Internet, both? | UNANSWERED | Not addressed. |
| 88 | Integrations | Backend repository / API base URL — does this monorepo house the backend, or is it a separate repo? | UNANSWERED | Not addressed. |
| 89 | Integrations | MES integration — which product (which version), which protocol (REST / OPC-UA / file drop)? | UNANSWERED | Not addressed. |
| 90 | Integrations | SCADA / Banbury PLC integration for Drop Temp, TCU, Rotor, Mix Time, Power readings — which system? | UNANSWERED | FR-P54 lists readings but no upstream source. |
| 91 | Integrations | WMS / inventory system feeding Live Stock (FR-P65) — which system, push or pull? | UNANSWERED | Not addressed. |
| 92 | Integrations | SAP / ERP for compound item codes and descriptions — which system, which interface? | UNANSWERED | Not addressed. |
| 93 | Integrations | CMMS / EAM for PM compliance, Overdue PMs, MTBF, MTTR — which system? | UNANSWERED | FR-E2, FR-E4 list metrics; source system unspecified. |
| 94 | Integrations | Identity provider — corporate AD / Azure AD / Okta / OIDC / SAML / local? | UNANSWERED | Not addressed. |
| 95 | Integrations | Email / SMS alerting for anomalies, repeat failures — required at launch, later, or never? | UNANSWERED | Not addressed. |
| 96 | Integrations | Capex / Project tracking system (Smartsheet, JIRA, MS Project, custom)? | UNANSWERED | FR-E6 mentions Capex Projects KPIs but not upstream system. |
| 97 | Integrations | Quality lab feeding FTQ, NCM, defect data — which system? | UNANSWERED | FR-Q1–FR-Q6 list KPIs; source unspecified. |
| 98 | Integrations | Utility metering feeding Power Factor, kWh/MT, Steam Pressure, Compressed Air, Chilled Water, Boiler Efficiency — which meter / SCADA tags? | UNANSWERED | FR-E5 describes the strip; source unspecified. |
| 99 | Integrations | CSV downloads are explicitly Excel-compatible (UTF-8 BOM, RFC 4180 escaping). | ANSWERED | FR-P57, FR-P59, FR-X28. |
| 100 | Integrations | Export-to-PDF is browser-native window.print() only — no server-side PDF service. | ANSWERED | FR-X26. |
| 101 | Integrations | Fallback behaviour when an upstream integration is down — last-good cache, blank, error banner? | UNANSWERED | Not addressed. |
| 102 | Integrations | Rate limits on backend reads — paginated lists (sub-drills, traceability) — what's the max page size? | UNANSWERED | Not addressed. |
| 103 | Integrations | Are there webhook callbacks the dashboard must respond to (e.g. anomaly detected → push to UI)? | UNANSWERED | Not addressed. |
| 104 | Explicit non-goals | RBAC is not enforced in the prototype. | ANSWERED | §4 states this explicitly. (Whether RBAC is a planned production non-goal is separately UNANSWERED — see row 1.) |
| 105 | Explicit non-goals | Plant Head function tile is a placeholder for a future consolidated view — explicit deferral. | ANSWERED | FR-L15. |
| 106 | Explicit non-goals | Technical function tile is a placeholder — explicit deferral. | ANSWERED | FR-L15. |
| 107 | Explicit non-goals | Dark theme and System theme are "coming soon" — explicit deferral. | ANSWERED | FR-X22. |
| 108 | Explicit non-goals | Per-statistic tiles (Current / Target / Gap / Average / Best / Worst) and the auto-Insight panel inside the Trend Modal are explicitly excluded. | ANSWERED | FR-X15. |
| 109 | Explicit non-goals | Chart-type badge ("LINE CHART", "BAR CHART") inside the Trend Modal is explicitly excluded. | ANSWERED | FR-X16. |
| 110 | Explicit non-goals | The Overall OEE is intentionally NOT shown as a fourth tile in the OEE drill. | ANSWERED | FR-P27. |
| 111 | Explicit non-goals | Tyre Type filter is intentionally disabled on Engineering Utilities and Capex Projects tabs (plant-wide infrastructure). | ANSWERED | FR-E7, FR-X5. |
| 112 | Explicit non-goals | Is real-time WebSocket / SSE push explicitly out of scope for v1? | UNANSWERED | Not addressed. |
| 113 | Explicit non-goals | Is mobile-responsive layout explicitly out of scope for v1? | UNANSWERED | Not addressed. |
| 114 | Explicit non-goals | Is editing / write-back of any entity (Manual KPI input, Complaint status, Anomaly acknowledge) in scope for v1, deferred, or never? | UNANSWERED | Not addressed. |
| 115 | Explicit non-goals | Is multi-language support out of scope? | UNANSWERED | Not addressed. |
| 116 | Explicit non-goals | Is a cross-plant comparison view out of scope (plant cards only on Landing, no side-by-side comparison page)? | INFERRED | §5 describes the Landing Page; no comparison view is described. Inferred out of scope. |
| 117 | Explicit non-goals | Is per-user preference persistence (default plant, default time range, default Tyre Type, theme) in scope? | UNANSWERED | Not addressed. |
| 118 | Explicit non-goals | Is a native mobile app out of scope? | INFERRED | BRD describes a single-page React app only. Inferred out of scope. |
| 119 | Explicit non-goals | Is offline mode (PWA, cached data) out of scope? | UNANSWERED | Not addressed. |
| 120 | Explicit non-goals | Is in-app push notification / alerting (banner / badge) out of scope? | UNANSWERED | Not addressed. |
| 121 | Phasing (cross-cutting) | The user has stated Phase 1 = Banmore + Production only. The BRD does NOT sequence phases — what is the agreed Phase 1 → Phase 2 → … cut, and who owns the sequencing decision? | UNANSWERED | User statement; BRD silent. |
| 122 | Phasing (cross-cutting) | For Phase 1, does the frontend ship against deterministic mock data (matching the prototype) or against a live backend? | UNANSWERED | §1 says "all data is currently deterministic mock data"; production phasing silent. |

---

## Summary

- **Total rows:** 122
- **ANSWERED:** 11 (intentional design decisions and explicit deferrals captured in the BRD)
- **INFERRED:** 11 (assumptions you can confirm in ≤ 1 minute each with the relevant Head)
- **UNANSWERED:** 100 (real gaps — these become the OQR after PM walk)

## Suggested walk order with the PM

1. **Phasing (rows 121, 122)** — these gate every other decision. Decide Phase 1 cut and mock-vs-live first.
2. **Integrations (rows 88–103)** — name the upstream systems. Cannot draft the API contract without these.
3. **Actors & permissions (rows 1–10)** — RBAC stance shapes auth pattern.
4. **NFRs (rows 63–87)** — performance + browser support + retention shape architecture.
5. **Entity lifecycle (rows 11–25)** — drives every spec's state diagram.
6. **CRUD ownership (rows 40–54)** — clarifies write paths (or confirms read-only).
7. **Errors (rows 26–39)** — finalise once integrations are named.
8. **Concurrency (rows 55–62)** — finalise once refresh strategy from NFRs is decided.

## Notes on what was NOT done in this pass

- No answers are proposed for UNANSWERED rows. Those are decisions for
  the PM, Plant Head, Production Head, Quality Head, and Engineering Head.
- No code, plan, or spec was produced.
- No edits to `docs/product.md` were made. After the walk, every
  confirmed INFERRED row should add a missing line to that file.

After the walk, replace the seed table in
[`docs/open-questions.md`](open-questions.md) with the UNANSWERED +
escalated-INFERRED rows, assigning sequential IDs Q01, Q02, …
