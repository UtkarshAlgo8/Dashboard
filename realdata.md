Backend Change Spec — Run the Dashboard on REAL Data
Goal: the dashboard was built and tested on dummy data; make the existing backend work on the real data. Two hard rules from the brief: 1. Only the Production department — ignore all other departments. 2. Only plant BANMORE — never include BTP. 3. Cost, Morale, Safety are disabled — show those tab but make it not clickable

The real data uses the same column set as the dummy plus one new column (plot_data), but the values differ (different casing, different granularity names, extra sections, a new SPC category, and a different drill_down_attribute format). Each section below is a required change, in priority order.

0. Core principle — normalize on read, stop hardcoding
Most breakages below come from the backend hardcoding exact dummy values. The robust fix is to normalize values as they are read and compare normalized forms, instead of matching frozen literals:

Plant → compare uppercase.
Department → compare lowercase.
Granularity → map synonyms to a canonical set.
drill_down_attribute → tolerant parser (accepts single or double quotes).
Units → map/normalize, treat (unset) as "no unit".
Do this once in a shared normalization layer so future small data changes don't break the dashboard again.

1. Plant — use BANMORE, exclude BTP (blocks everything)
The data has two plants: BANMORE and BTP (uppercase).
The backend currently filters on Banmore (mixed case) → no rows match the real uppercase value.
Required: filter to BANMORE (case-insensitive match is safest), and always apply the plant filter so BTP rows are excluded on every endpoint (cards, trends, drills, inventory).
2. Department — only Production, case-insensitive (blocks everything)
The data has departments: Production, production (lowercase), and Quality.
The backend filters on exact Production → the lowercase production rows are dropped.
Required:
Match the production department case-insensitively (treat Production and production as the same). (Note: in this data, Banmore rows are Production (capital P) and BTP rows are production (lowercase) — so excluding BTP by plant already removes the lowercase ones, but case-insensitive matching is still the safe rule.)
Keep only the production department; exclude department = Quality (and any other) department rows.
CRITICAL — department = Quality is NOT the same as category = Quality:
department = Quality → excluded (this is where the SPC data lives — see §8).
category = Quality → KEPT (this is the Quality tab: Scrap, Rework, NCM Hold — these rows are department = Production, category = Quality). Confirmed present after the filter.
So the department filter removes SPC automatically without removing the Quality tab.
3. Granularity — remap names + the time filter (biggest change)
The real granularity names are completely different from the dummy. There is no YTD in the real data.

Mapping table (dummy → real)
Dashboard time filter	Dummy granularity (old)	Real granularity (use this)
Today / Daily	Daily	DAY
Month	MTD	MONTH
Year	YTD	— (not present)
Shift A	Shift A	SHIFT A
Shift B	Shift B	SHIFT B
Shift C	Shift C	SHIFT C
(The data also has a Real-time granularity, but it only appears on SPC rows under department = Quality, which are excluded — so the production dashboard never sees it. No need to handle Real-time.)

Required
Update the granularity allow-list to: DAY, MONTH, SHIFT A, SHIFT B, SHIFT C.
Update the time-filter mapping everywhere it is used: Today/Daily → DAY, Month → MONTH, Shift → SHIFT A/B/C.
The OEE/section default granularity that currently falls back to MTD must fall back to MONTH.
Year — DISABLE for now, keep easy to re-enable. There is no YTD data yet. Hide/disable the Year option in the UI, but implement it as a single feature flag / config switch (e.g. ENABLE_YEAR = false and a one-line mapping Year → YTD/whatever the future granularity is). Do not delete the Year code path — the user will turn it on via a future change request when yearly data arrives. When enabled, it should map to the yearly granularity and otherwise behave like Month.
4. Sections — keep ONLY Mixing, TBM, Curing, Stock
Real sections after the BANMORE + Production filter: Mixing, Stock, Curing, TBM, Final Finish, TUO & DBM.
Show only these four: Mixing, TBM, Curing, Stock.
Required
Section allow-list = {Mixing, TBM, Curing, Stock} (this matches the current code's list — no change needed there).
Exclude Final Finish and TUO & DBM (and any other section value) — do not show them as tabs.
The name TBM matches the real data as-is (no rename needed; Tyre Building only appeared under BTP/other rows that the filter already removes).
5. Categories — keep Productivity / Quality / Inventory (Cost/Morale/Safety & SPC gone automatically)
Real categories in the file: Productivity, Quality, Inventory, SPC.
After the BANMORE + Production filter, only Productivity, Quality, Inventory remain.
Required
Allow-list = Productivity, Quality, Inventory.
Keep category = Quality — this is the Quality tab (Scrap, Rework, NCM Hold). It survives the filter (department = Production).
Cost / Morale / Safety: do not exist in the real data, and weren't requested → nothing to do (keep those tab but not clicable).
SPC: gone automatically — SPC rows are department = Quality, which the §2 filter excludes. No SPC handling needed (see §8). Do not confuse this with category = Quality, which is kept.
6. drill_down_attribute — fix the parser (drilldowns are dead otherwise)
The dummy stored this as JSON with double quotes: ["Production_m", "Production_sku", "Production_m_sku"].
The real data stores it as a Python-style list with single quotes: ['Production_m', 'Production_sku', 'Production_m_sku'].
The current parser does a strict JSON parse, which fails on single quotes and silently returns the raw string → no drilldown works.
Required
Make the attribute parser tolerant: accept single or double quotes (e.g. convert single to double before parsing, or parse Python-style lists). It must return a real array of child KPI names.
The real drill chains are richer than the dummy — handle the new child KPI names that appear, e.g.:
['Production_product', 'Production_s', 'Production_m', 'Production_sku', 'Production_m_sku']
['Scrap_s', 'Scrap_reason', 'Scrap_m', 'Scrap_sku', 'Scrap_m_sku']
['Rework_s', 'Rework_reason', 'Rework_m', 'Rework_sku', 'Rework_m_sku']
New child KPIs the drill UI must recognise include Production_product and Production_s (in addition to the ones already handled).
Navigation stays attribute-driven (follow drill_down_attribute); do not rely on drill_down_level for navigation.
6a. Production_product — NEW product-type drill level (Production drilldown)
Production_product is a new KPI that did not exist in the dummy. It is the "production by product type" view — the first level of the Production drilldown.

What it is
One row per product type (the product_type column), showing the quantity each tyre category produced. No machine, sub-section, or SKU — it is a flat product split.
Present in TBM and Curing only (the sections with multiple tyre categories). Mixing and Stock do not have it — so do not assume it is always present; follow drill_down_attribute.
Unit: NOS. Granularities: DAY, MONTH, SHIFT A/B/C. Its own drill_down_attribute is empty → it is a leaf (no further drill from here).
Where it sits in the drill chain
The real Production chain starts with it: * TBM: ['Production_product', 'Production_m', 'Production_sku', 'Production_m_sku'] * Curing: ['Production_product', 'Production_s', 'Production_m', 'Production_sku', 'Production_m_sku']

So the Production drilldown order is: Production_product (by product type) → Production_s (trench, Curing only) → Production_m (machine) → Production_sku → Production_m_sku.

Required
Treat Production_product as the first "View By" option of the Production drilldown (product-type-wise). Render it as a flat table/list: product type → quantity. It does not drill further.
It is attribute-driven — once the single-quote parser (§6) is fixed, it appears automatically as the first child; just add a label/handler for it. Do not hardcode it as always-present (Mixing/Stock omit it).
Handle the "overall" row (important)
The product split includes an overall entry that equals the parent Production total, alongside the real categories: * TBM product types: Green Tyre (= overall total), Passenger Radial, LCV, Unknown. * Curing product types: Cured Tyre (= overall total), Passenger Radial, LCV, Unknown.

When showing the per-product breakdown, exclude the overall row (Green Tyre for TBM, Cured Tyre for Curing) so the products don't double-count — or show it explicitly labelled as the total. The remaining real products (Passenger Radial, LCV, Unknown) sum to the overall.
Decide how to treat the Unknown product type — show it as an "Unknown/Other" bucket or hide it.
7. Units — read from data, don't hardcode
Dummy units: MT, Batches, units, kg, nos, %.
Real units: %, KG, M, NOS, min, (unset) (uppercase; (unset) = missing).
Required
Do not hardcode unit labels (e.g. MT/Batches). Read unit_of_measurement from the data and pin the selected one.
Normalize labels for display (e.g. KG, NOS casing) and treat (unset) as "no unit" (show nothing, don't print the literal text).
Keep the existing rule: a multi-unit KPI shows a unit toggle and never combines units; a single-unit KPI just displays its unit.
8. SPC + plot_data — NOT APPLICABLE (handled by the department filter)
SPC content (Cp/Cpk/Pp/Ppk control charts) is stored under department = Quality.
Since §2 keeps only the Production department, all SPC rows are excluded automatically (confirmed: 0 SPC rows after the BANMORE + Production filter).
No action needed: do not build an SPC view, and do not worry about the plot_data column — it only carries data on SPC rows, which never reach the dashboard. (If SPC is ever wanted, it would be a separate effort on the Quality department.)
9. KPI names — verify the literals against real data
After the BANMORE + Production filter, the surviving KPI names differ from the dummy in places, and the legacy code matches some exact names.

Plain OEE and Performance are GONE after the filter (they were BTP / Quality-department rows) — so that mismatch resolves itself. Banmore production uses OEE_o / OEE_m (and OEE_p, OEE_s).
Real OEE-loss reason KPIs are different from the dummy's Breakdown/Setup/Startup/... — they include No Schedule, Power Failure, Preventive Maintenance, Setup & Change, Operations/Material/Manpower (plus Breakdown). The OEE drill leaves should use these real names.
New Production drill children appear: Production_product, Production_s.
There is still a UNKNOWN kpi_name (~1,056 rows) in Banmore production → decide whether to exclude it.
Required
Anywhere the backend matches an exact KPI name, verify it against the real surviving names and fix mismatches (esp. OEE-loss reasons, and the new Production children).
Prefer attribute-driven drilling and data-driven rules (e.g. "rows where product_type is empty are operational") over frozen KPI-name lists, so new names work automatically.
Optionally filter out the UNKNOWN kpi_name rows.
10. Date / "today" anchor
Real date is a true date type, ISO YYYY-MM-DD, in June 2026.
Required: anchor "today" to the latest date present in the data (max date), not the system clock, so cards/trends aren't empty. Confirm the date is read consistently (ISO) wherever it is parsed.
11. Priority order (to get it running)
The plant + department filter does a lot of the work (it removes BTP, SPC, plain OEE/Performance, the UNKNOWN section, and any Cost/Morale/Safety). The remaining real changes are short:

Plant = BANMORE + department = Production (§1, §2) — without this every query returns nothing; this also auto-removes SPC, BTP, plain OEE, UNKNOWN section.
Granularity remap DAY/MONTH/SHIFT, drop YTD (§3) — cards & trends return data.
Fix the drill_down_attribute parser for single quotes + new children Production_product/Production_s (§6) — drilldowns work.
Sections — keep only {Mixing, TBM, Curing, Stock}; exclude Final Finish and TUO & DBM (allow-list already matches — just ensure others are filtered out) (§4).
Units normalization (§7).
KPI-name verification for OEE-loss reasons (§9); optionally exclude the UNKNOWN kpi_name.
Dropped (no longer needed): SPC / plot_data handling, Cost/Morale/Safety disabling, plain-OEE fix, TBM→Tyre Building rename — all handled automatically by the data + filter.

13. Per-KPI status vs the dummy logic (real-data audit)
Audited every KPI family on Banmore + Production. Summary of what carries over and what changes.

Works the same as the dummy (no change)
Production parent — overall card has product_type NULL; multi-unit (KG / M / NOS) → unit toggle still applies; pin one unit.
Production_m / Production_sku / Production_m_sku — machine / SKU / machine+SKU views, product-scoped, in all four sections.
Scrap family (Scrap → Scrap_s → [Scrap_reason, Scrap_m, Scrap_sku, Scrap_m_sku]) — category = Quality, reason from remarks. As designed.
Rework family — same chain as Scrap.
Inventory (Inventory → [Inventory_item]) — product-type bars, drill to items. (Sections: Mixing/Stock/TBM.)
Works but DIFFERENT from the dummy
Production_product — NEW first drill level (product-type split), TBM/Curing only. See §6a.
Production_s = the SUBSECTION level (Curing only). The _s suffix means sub_section. It exists in Curing only (1,017 rows, product_type NULL, machine NULL — it is a subsection total). Mixing/Stock/TBM Production drills skip straight to Production_m. Follow the attribute; don't assume Production_s exists. Real-data facts to honour:
Subsection values are Trench1…Trench8 (no space), and Trench3 is missing (7 trenches: Trench1, Trench2, Trench4, Trench5, Trench6, Trench7, Trench8). The dummy used Tredge 1 (with a space) — read the sub_section values from the data; do not hardcode Tredge/Trench names or a 1–6 range.
In real data, Production_s is a leaf (drill_down_attribute = []) — it does not drill further into presses/SKU. (The dummy had Production_s → [Production_m, Production_m_sku, Production_sku_m]; the real data does not, so trench → press is not wired yet.)
Production_m / OEE_m rows in Curing have no sub_section, so a press cannot currently be linked back to its trench via sub_section.
Production_sku_m — treat as the SAME as Production_m_sku for now. Real data only has Production_m_sku (the dummy also defined Production_sku_m as a separate SKU-first view). For now, alias the two names to the same data: if a drill attribute lists Production_sku_m, serve Production_m_sku rows (and vice-versa). Do not show two separate views and do not error on either name. The user will make these consistent in a future change request. (So the Production leaves are effectively Production_m, Production_sku, Production_m_sku, with Production_sku_m aliased to Production_m_sku.)
Scrap / Rework currently exist in Curing only (few rows). Structure is correct, but Mixing/Stock/TBM have no Scrap/Rework yet — their Quality tab will show NCM Hold only until that data arrives.
NCM_Hold — works (category = Quality, → [NCM_Hold_sku], product_type set; detail has Item Code + Hold Qty + Final Status). But: the remarks (Reason) column is empty (0% filled) — the Reason column will be blank; keep the column but expect no data for now. NCM Hold is in Mixing / Stock / Curing only (not TBM), and has a (unset) unit alongside KG/M/NOS → normalize (unset) to blank (§7).
ABSENT in real data — keep the card, show NULL (do not remove)
These have no data yet. Per §15, render the card with an empty/null value (placeholder like —), do not hide it: * FTQ / FTQ_m — not present. The Quality tab keeps the FTQ card but shows null until FTQ data arrives. * Plan_Compliance — not present. Keep the Plan Compliance card with a null value. * Scrap / Rework — keep null cards in Mixing / Stock / TBM (data exists only for Curing — show normally there). * NCM Hold — keep a null card in TBM (data exists for Mixing/Stock/Curing). * TBM OEE — keep a null card (no overall OEE in data — see §14).

NOT needed — do NOT show (intentional)
Downtime / Downtime_category — not required. Its purpose is served by the OEE availability-loss reasons (No Schedule, Power Failure, Preventive Maintenance, Setup & Change, Operations/Material/Manpower, Breakdown). Remove it entirely — not even a null card.
Specific_Power — out of scope. No card.
Defect_Scrap, Scrap_Rate — intentionally removed (replaced by Scrap / Rework). No card.
Net KPI set (real data, Banmore production)
Productivity tab: Production (+ Production_product / Production_s (Curing) / Production_m / Production_sku / Production_m_sku), OEE family.
Quality tab: Scrap, Rework, NCM Hold, FTQ (FTQ shown as a null card until data arrives — §15).
Inventory tab: Inventory → Inventory_item.
Shown as null cards (no data yet): TBM OEE, FTQ, Plan Compliance, and Scrap/Rework (Mixing/Stock/TBM), NCM Hold (TBM).
Removed entirely (no card): Downtime / Downtime_category (served by OEE loss reasons), Specific Power, Defect_Scrap, Scrap_Rate, Cost/Morale/Safety. (Production_sku_m is aliased to Production_m_sku, not removed.)
14. OEE — real-data status (per your decision)
Curing trench-level OEE_s — IGNORED for now. The real data has no OEE_s for Curing; Curing OEE uses the generic chain OEE_o → [Availability_o, Performance_o, Quality_o, OEE_m] → loss reasons. The trench-wise OEE drill is deferred to a future change request (the user will provide the data). Keep the generic Curing OEE drill working; do not build the trench level now.
OEE level availability per section (real data):
Mixing — has overall OEE_o. Card = OEE_o. ✅
Curing — has overall OEE_o (sub_section NULL). Card = OEE_o; drills to press (OEE_m), not trench. ✅
Stock — no OEE_o; has OEE_s (per subsection) + OEE_m. Card = OEE_s for the selected subsection.
TBM — no OEE_o and no OEE_s; only press-level OEE_m (+ Availability_m/Performance_m/Quality_m). Decision: keep the TBM overall-OEE card but show a NULL value (no overall value exists in the data yet — fills in via a future change request). Press-level OEE remains available in the drill.
Unchanged OEE rules that still hold: OEE rows are product_type NULL (never pin product); disambiguate by sub_section, not machine (machine is always NULL on OEE_o/OEE_s); OEE is single-unit %.
15. KPIs with no data yet — KEEP the card, show NULL (future change request)
Several KPIs that existed in the dummy are not present in the current real data. Keep their cards visible with a null/empty value — do NOT hide or remove them. Keep each behind a simple toggle (like the Year flag in §3) only for disabling queries, not for hiding the card. The user will provide this data via a future change request, at which point the cards fill in automatically.

KPIs with no data now — KEEP the card, show null value (do NOT remove)
These exist in the design but have no data yet. Render each card with a null/empty value (— / "No data"); fill in via a future change request.

KPI / feature	Where	Show as	Re-enable when
TBM OEE (overall)	TBM, Productivity	card with null	TBM overall-OEE data provided
Scrap (+ Scrap_s/_reason/_m/_sku/_m_sku)	Mixing, Stock, TBM	card with null	Scrap data for those sections provided
Rework (+ Rework_*)	Mixing, Stock, TBM	card with null	Rework data for those sections provided
NCM Hold (+ NCM_Hold_sku)	TBM	card with null	NCM Hold data for TBM provided
Plan Compliance (Plan_Compliance)	Productivity	card with null	Plan Compliance data provided
FTQ (+ FTQ_m)	Quality	card with null	FTQ data provided
Curing trench OEE (OEE_s for Curing)	Productivity (OEE drill)	omit the trench drill for now (see §14)	trench-OEE data provided
Year / YTD time filter	global	disabled toggle (see §3)	yearly data provided
Scrap/Rework do have data for Curing (show normally there); only Mixing/Stock/TBM are null. NCM Hold has data for Mixing/Stock/Curing (show normally); only TBM is null.

NOT needed — do NOT show (intentional)
Downtime (Downtime) and Downtime_category — not required. Its purpose is already served by the OEE availability-loss reasons: No Schedule, Power Failure, Preventive Maintenance, Setup & Change, Operations/Material/Manpower (plus Breakdown), which appear under the OEE → Availability drill. Do not show a Downtime card and do not show a null Downtime card — remove it entirely.
Defect + Scrap (Defect_Scrap*) and Scrap Rate (Scrap_Rate*) — intentionally removed (replaced by Scrap / Rework). No card.
Specific Power (Specific_Power), Cost / Morale / Safety (incl. Absenteeism) — out of scope. No card.
Required behavior
Keep the card/tab visible even when there is no data — do NOT hide or remove it. Render the card with a null/empty value (e.g. show —, N/A, or "No data" in place of the number) so the user can see the KPI exists but has no data yet.
Skip/short-circuit the underlying query (or let it return empty) — but still render the card shell with the KPI name and an empty value.
Never error if one of these KPIs is requested — return an empty value and render the placeholder card gracefully.
This applies to KPIs with no data yet (FTQ, Plan Compliance, TBM OEE) and to KPIs present in some sections but not others (Scrap/Rework in Mixing/Stock/TBM, NCM Hold in TBM): show the card with a null value rather than omitting it. (Downtime is the exception — it is removed entirely, not shown as null; see above.)
16. Subsection names — read from data, don't hardcode
sub_section values in the real data differ from the dummy and are not uniform. Read them from the data per section; never hardcode names or counts.

Section	Real sub_section values
Mixing	none (no subsection)
TBM	none (no subsection)
Stock	4 Roll, 3 Roll, Three Roll, Extruder, Cutter, Slitter, Bead
Curing	Trench1, Trench2, Trench4, Trench5, Trench6, Trench7, Trench8 (production trenches; no Trench3) — plus BUILDING, CURING, ENGINEERING (these appear on Scrap/Rework rows as scrap areas)
Notes for the implementer: * Curing has TWO kinds of subsection values: the Trench values (Trench1…8) used by Production_s, and the scrap-area values (BUILDING, CURING, ENGINEERING, all uppercase) used by Scrap_s / Rework_s. Don't mix them — they belong to different KPIs. * Stock has both 3 Roll and Three Roll (two spellings for what is likely the same subsection). Treat as the same or surface both — but be aware of the duplicate; the user may clean this up later. * Trench naming is TrenchN (no space) in real data vs Tredge N in the dummy, and the set is not 1–6. Always populate the subsection picker/labels from the distinct sub_section values present, not from a fixed list. * The scrap subsections are uppercase (BUILDING/CURING/ENGINEERING) — normalize casing for display if desired, but match the raw value when filtering.

17. KPI logic + drill-downs, with REAL-data examples
All examples are from plant = BANMORE, department = Production. Navigation is attribute-driven — every "→" below is the clicked KPI's drill_down_attribute. Pin one series before reading a card (product_type / sub_section / unit as noted).

IMPORTANT — KPIs live on different dates. In the real data, Production has data up to 2026-06-25, but Curing OEE only up to 2026-06-23, and Scrap/NCM/Inventory on their own latest dates. So anchor "today" per KPI (each card uses the latest date that KPI has), not one global date — otherwise OEE/Scrap cards look empty on a day that only has Production. Examples below use each KPI's own latest available day.

17.1 Production (Productivity tab)
Card: pin kpi_name=Production, product_type IS NULL (overall), unit (Curing/TBM = NOS; Mixing = KG; Stock = M/NOS), granularity = time filter.

Drill chain (Curing — fullest): Production → ['Production_product', 'Production_s', 'Production_m', 'Production_sku', 'Production_m_sku'] (TBM omits Production_s; Mixing/Stock omit both Production_product and Production_s — follow the attribute.)

Real example — Curing, DAY 2026-06-25, NOS: * Production card = 10,367 * Production_product (1st drill — by product type): Cured Tyre 10,367 (overall), Passenger Radial 7,029, LCV 1,389, Unknown 1,949. → Passenger + LCV + Unknown = 10,367. Exclude the overall row Cured Tyre from the per-product list (it equals the total). * Production_s (by subsection/trench): Trench1 1,683, Trench2 1,958, Trench4 1,346, Trench5 1,726, Trench6 1,556, Trench7 2,098 → sum = 10,367 ✓ (no Trench3). Leaf in real data — does not drill further. * Production_m (by machine/press): one row per press (e.g. 14801LH = 36); ~252 machine rows. * Production_sku (by SKU): e.g. 120/80R12 ULTIMA XPC1 74F TL = 504. * Production_m_sku (machine + SKU): finest level. (Production_sku_m aliased to this — §13.)

17.2 OEE (Productivity tab)
Rules: OEE rows are product_type NULL (never pin product); disambiguate by sub_section (machine always NULL on OEE_o/OEE_s); single unit %.

Per section (real data): * Mixing / Curing — overall OEE_o. Card = OEE_o (sub_section NULL). * Stock — no overall; card = OEE_s for the selected subsection. * TBM — no overall, no subsection → null card (press-level only in drill).

Drill chain (Mixing/Curing): OEE_o → ["Availability_o", "Performance_o", "Quality_o", "OEE_m"] OEE_m → ["Availability_m", "Performance_m", "Quality_m"] Availability_m → ["Breakdown", "No Schedule", "Operations/Material/Manpower", "Power Failure", "Preventive Maintenance", "Setup & Change"] (Performance_m and Quality_m similarly drill to their own loss reasons.)

Real example — Curing OEE, DAY 2026-06-23: * OEE_o = 31.73% → components Availability_o 83.86, Performance_o 40.36, Quality_o 96.00. * OEE_m (by press): 14807 = 39.57, 15202 = 39.85, 24812 = 14.61, … * Click Availability_m for press 14807 → loss reasons, e.g. Operations/Material/Manpower = 60.0 (min). These OEE-loss reasons replace the old Downtime KPI (§15).

Real example — Mixing: OEE_o = 18.83% (DAY 2026-06-25), same chain. Real example — Stock: OEE_s by subsection, e.g. 3 Roll = 27.63%, attribute ["OEE_m", "Availability_s", "Performance_s", "Quality_s"].

17.3 Scrap (Quality tab) — Curing only (others = null card)
Card: pin kpi_name=Scrap, category=Quality, unit NOS. Drill chain: Scrap → ['Scrap_s', 'Scrap_reason', 'Scrap_m', 'Scrap_sku', 'Scrap_m_sku'] * Scrap_s = scrap-area subsection (default first drill); reason from remarks; then View By Machine / SKU / Machine+SKU.

Real example — Curing, DAY 2026-06-25, NOS: * Scrap card = 216 * Scrap_s (by scrap area): BUILDING 123, CURING 65, ENGINEERING 13. (These uppercase areas — not the Trenches.) * Scrap_reason (from remarks): IL Blister 11, Light SW 4, Flash cure 3, MP Drop 2, …

17.4 Rework (Quality tab) — Curing only (others = null card)
Same structure as Scrap: Rework → ['Rework_s', 'Rework_reason', 'Rework_m', 'Rework_sku', 'Rework_m_sku']; scrap-area subsections; reason from remarks; View By Reason / Machine / SKU / Machine+SKU. Unit NOS. (Real data: present for Curing.)

17.5 NCM Hold (Quality tab)
Card: reflects the already-selected section / sub_section / product_type (no re-selection). Present for Mixing / Stock / Curing; TBM = null card. Drill chain: NCM_Hold → ['NCM_Hold_sku'] → item-code detail. Detail columns: Item Code (itemcode), Hold Qty (actual_value), Final Status (status), Reason (remarks — currently empty, keep column).

Real example — DAY 2026-06-25: NCM_Hold cards: Mixing/Compound = 24,080, Stock/SideWall = 380, Curing/Cured Tyre = 12. Detail rows: 7.00R15 STEEL KING… qty 2, status Finish; K4 WA qty 1,400, status Rework; SW1657014… qty 110, status Use As.

17.6 Inventory (Inventory tab)
Card/page: plant-level (read section from row); product-type bars. Multi-unit (KG / M / NOS) → pin unit. Drill chain: Inventory → ['Inventory_item'] → item-code detail.

Real example — DAY 2026-06-25: Stock/Belt = 101,204 M, Stock/Cap Strip = 194,111 M, Stock/Chaffer = 45,706 M, … → drill Inventory_item for item-level rows. (Sections with inventory: Mixing, Stock, TBM.)

17.7 Quick reference — pinning per KPI
KPI	Pin product_type	Pin sub_section	Pin unit	First drill
Production	NULL (overall)	— (Stock: selected)	yes (NOS/KG/M)	Production_product (TBM/Cur) → else Production_m
OEE (OEE_o)	never (NULL)	NULL=overall (Stock: OEE_s per sub)	no (%)	Availability_o/Performance_o/Quality_o/OEE_m
Scrap / Rework	—	scrap-area in drill	yes (NOS)	Scrap_s / Rework_s
NCM Hold	selected (per section)	selected (Stock)	yes (or (unset)→blank)	NCM_Hold_sku
Inventory	the product bar	—	yes (KG/M/NOS)	Inventory_item
18. CARD SELECTION LOGIC — exact backend filters per KPI (real-data verified)
This is the precise filter set the backend applies to fetch one card value. Each was verified to return exactly one row on the real data. The Production and OEE cards differ by section — this is critical and different from the dummy.

Common to every card: plant = BANMORE, department = production (case-insensitive), granularity = the time filter (DAY / MONTH / SHIFT A/B/C), date = that KPI's latest available day (anchor per KPI — see §17).

18.1 Production card — filter depends on section
Section	product_type	sub_section	unit	machine	Result (real, DAY 2026-06-25)
TBM	NULL (overall)	NULL	NOS	NULL	14,331
Curing	NULL (overall)	NULL	NOS	NULL	10,367
Mixing	selected compound (Master Compound / Final Compound) — no overall exists	NULL	KG	NULL	Master 14,927 / Final 12,452
Stock	selected product (Belt/Ply/Cap Strip/Inner Liner/Bead Apex/Bead Bundle) — no overall exists	selected (Extruder/Cutter/Slitter/Three Roll/Bead)	M or NOS	NULL	e.g. Cutter+Ply (M), Extruder+Belt (M)
Key rules: * TBM / Curing — pin product_type IS NULL for the overall card. (The product split lives one level down in Production_product.) * Mixing — there is NO overall Production row. The card must pin a compound (Master Compound or Final Compound); default to one and drive it from the Mixing compound toggle. Unit = KG. * Stock — there is NO overall Production row. The card must pin sub_section + product_type (each Stock subsection has one product), driven by the Stock subsection tab + product selection. Unit follows the row (M for most, NOS for Bead / Inner Liner). * Always pin one unit — never combine NOS and M.

18.2 OEE card — filter depends on section
Section	KPI	product_type	sub_section	machine	Result (real)
Mixing	OEE_o	NULL	NULL (overall)	NULL	18.83% (2026-06-25)
Curing	OEE_o	NULL	NULL (overall)	NULL	31.73% (2026-06-23)
Stock	OEE_s	NULL	selected subsection	NULL	e.g. 3 Roll 27.63% (no overall)
TBM	—	—	—	—	NULL card (no OEE_o/OEE_s)
Key rules: * OEE: never pin product_type (always NULL); never pin machine (always NULL on OEE_o/OEE_s); disambiguate by sub_section. * Mixing/Curing: card = OEE_o with sub_section IS NULL (the overall). Curing's latest OEE day is earlier than Production's — anchor per KPI. * Stock: no overall → card = OEE_s for the selected subsection. * TBM: no overall OEE in data → null card (press-level OEE_m still appears in the drill). * Unit is always % (no toggle).

18.3 Scrap / Rework card (Quality tab)
Filter	Value
kpi_name	Scrap (or Rework)
category	Quality (pin this — Scrap also exists as an OEE-loss leaf under category Productivity)
product_type	the section's overall (Curing = Cured Tyre)
sub_section	NULL (the scrap-area split is in the drill, not the card)
unit	NOS
Real example — Curing, DAY 2026-06-25: Scrap card = 216 (category=Quality, product_type=Cured Tyre, sub NULL). Mixing/Stock/TBM = null card (no data yet).

18.4 NCM Hold card (Quality tab)
Filter	Value
kpi_name	NCM_Hold
category	Quality
product_type	the already-selected product/compound for that section (Mixing = Compound, Stock = the selected product e.g. SideWall, Curing = Cured Tyre)
sub_section	the selected subsection where applicable (Stock)
unit	follows the row (NOS/KG/M, or (unset) → show blank)
Real example — DAY 2026-06-25: Mixing/Compound = 24,080; Stock/SideWall = 380; Curing/Cured Tyre = 12. TBM = null card. Detail (click → NCM_Hold_sku): Item Code, Hold Qty, Final Status (status), Reason (remarks, currently blank).

18.5 Inventory card (Inventory tab)
Filter	Value
kpi_name	Inventory
category	Inventory
product_type	the inventory product bar (Belt, Cap Strip, Green, Master Compound, …)
section	read from the row (Mixing / Stock / TBM)
unit	pin one (KG / M / NOS)
Real example — DAY 2026-06-25: Stock/Belt = 101,204 M, Stock/Cap Strip = 194,111 M. Drill → Inventory_item for item-level rows.

18.6 Summary — what each card pins (aligned to real data)
TBM Production     : product_type=NULL,           unit=NOS
Curing Production  : product_type=NULL,           unit=NOS
Mixing Production  : product_type=<compound>,     unit=KG          (NO overall — pin a compound)
Stock Production   : sub_section=<sub> + product_type=<product>, unit=M/NOS   (NO overall)
Mixing OEE         : OEE_o, sub_section=NULL,      unit=%
Curing OEE         : OEE_o, sub_section=NULL,      unit=%
Stock OEE          : OEE_s, sub_section=<sub>,     unit=%           (NO overall OEE_o)
TBM OEE            : NULL card                                       (no OEE_o/OEE_s)
Scrap / Rework     : category=Quality, product_type=<overall>, sub=NULL, unit=NOS   (Curing only; else null)
NCM Hold           : category=Quality, product_type=<selected>, sub=<selected>      (TBM null)
Inventory          : category=Inventory, product_type=<bar>, unit=KG/M/NOS
19. DRILL-DOWN LOGIC — filters & parameters passed at each step (real-data verified)
19.1 How a drill request is built (general mechanics)
A drill inherits the parent context and swaps the KPI to a child from drill_down_attribute. Specifically, every drill query carries forward:

plant = BANMORE, department = production
section (same as the card)
category (same — esp. Quality for Scrap/Rework, so the OEE-loss Scrap isn't picked up)
granularity and date (same time scope as the card — never sum across dates)
…and then: * sets kpi_name = the clicked child (from the parent's drill_down_attribute) * the child rows are grouped/keyed by that child's own dimension (see table).

19.2 CRITICAL: most child levels are FLAT (section-wide), not nested
In the real data, most child levels do NOT carry sub_section (Production_m, Production_sku, Production_m_sku, Curing OEE_m, Scrap_reason, Scrap_m, Scrap_sku all have sub_section = NULL). Consequence:

You cannot filter those machine/SKU/reason views by a clicked trench or scrap-area — those rows aren't tagged with it.
So the children listed in a parent's attribute are alternative "View By" lenses on the whole section, not a nested drill. Example (Production): "View By Product", "View By Subsection", "View By Machine", "View By SKU", "View By Machine+SKU" are five parallel section-wide breakdowns — clicking a trench does not then filter machines.
Production_s (subsection) is itself a leaf — it does not drill further.
The exceptions where nesting IS possible: * OEE press path (all sections): from OEE_m you click a press and pass machine down to Availability_m/Performance_m/Quality_m and their loss reasons. * Stock OEE (OEE_s) — nests by sub_section: Stock's OEE_m does carry sub_section, so from the OEE_s subsection card you can pass sub_section to get that subsection's presses. (This is unique to Stock OEE — see §19.4a.)

For everything else: do not pass sub_section as a filter to _m/_sku/_reason levels — it would return nothing. Pass machine for the OEE press path; pass sub_section only for the Stock OEE drill.

19.3 Production drill — parameters per step
Parent card context: section, granularity, date (+ for the card: product_type per §18; the View-By children below are section-wide).

Click (child kpi_name)	Filters passed	Grouped/keyed by	Drills further?
Production_product	section, gran, date	product_type	no (leaf) — exclude the overall row (Cured Tyre/Green Tyre)
Production_s	section, gran, date	sub_section (Trench1…)	no (leaf in real data)
Production_m	section, gran, date	machine	no (leaf)
Production_sku	section, gran, date	itemcode	no (leaf)
Production_m_sku	section, gran, date	machine + itemcode	no (leaf)
Real example — Curing, DAY 2026-06-25: Production_s returns Trench1 1,683 … Trench7 2,098 (section-wide); Production_m returns ~252 machine rows (section-wide, not filtered to any trench). Production_sku_m is aliased to Production_m_sku (§13).

19.4 OEE drill — parameters per step (nests by machine)
Step (child kpi_name)	Filters passed	Keyed by	Next
OEE_o (card)	section, gran, date, sub_section IS NULL	(one overall row)	→ ["Availability_o","Performance_o","Quality_o","OEE_m"]
Availability_o / Performance_o / Quality_o	section, gran, date, sub NULL	(one row each)	leaves (overall components)
OEE_m	section, gran, date	machine (per press)	click a press → pass that machine
Availability_m / Performance_m / Quality_m	section, gran, date, machine = <clicked press>	(one row each for that press)	→ loss reasons
loss reasons (Breakdown, No Schedule, Operations/Material/Manpower, Power Failure, Preventive Maintenance, Setup & Change)	section, gran, date, machine = <clicked press>	per reason	leaves
Real example — Curing OEE, DAY 2026-06-23: OEE_o 31.73 → components (A 83.86 / P 40.36 / Q 96.0); OEE_m press 14807 = 39.57; click 14807 → Availability_m for machine 14807 → loss Operations/Material/Manpower = 60. Pass machine=14807 at the A/P/Q and loss steps — this is the only place a dimension is passed down. (Stock OEE starts at OEE_s per subsection; its attribute ["OEE_m","Availability_s","Performance_s","Quality_s"]. TBM OEE = null card, no drill.)

19.4a Stock OEE drill — OEE_s (nests by subsection, then machine)
Stock has no overall OEE_o — its OEE starts at the subsection level (OEE_s). The card is OEE_s for the selected subsection; the drill then exposes the subsection's components and its presses.

Step (child kpi_name)	Filters passed	Keyed by	Next
OEE_s (card)	section=Stock, gran, date, sub_section = <selected>, machine NULL	one row for that subsection	→ ["OEE_m", "Availability_s", "Performance_s", "Quality_s"]
Availability_s / Performance_s / Quality_s	section, gran, date, sub_section = <selected>	one row each (subsection components)	leaves
OEE_m	section, gran, date, sub_section = <selected> (Stock OEE_m carries sub_section)	machine (presses in that subsection)	click a press → pass machine → Availability_m/Performance_m/Quality_m → loss reasons
Key points: * OEE_s, Availability_s, Performance_s, Quality_s are keyed by sub_section (the subsection's own values). * Stock OEE_m carries sub_section — so pass sub_section = <selected subsection> to list only that subsection's presses (this sub_section nesting works only for Stock OEE; Curing OEE_m has no sub_section). * From a press, the OEE press path continues by machine as in §19.4.

Real example — Stock, DAY 2026-06-25: OEE_s for 3 Roll = 27.63% → components Performance_s 33.24, Quality_s 95.0 (Availability_s may be absent on a given day — show null). OEE_m filtered to a subsection returns its presses, e.g. Extruder/901 = 23.56, Bead/2102 = 22.53.

Note: Stock OEE data is sparse/uneven (some Availability_s/Availability_m rows missing on a given day) — render null where a component is absent rather than erroring.

19.5 Scrap / Rework drill — parameters per step (flat View-By)
Parent context: section, category = Quality, product_type (Curing = Cured Tyre), granularity, date. Children are section-wide (no sub_section nesting).

Click (child kpi_name)	Filters passed	Keyed by	Note
Scrap_s	section, category=Quality, gran, date	sub_section (scrap area: BUILDING/CURING/ENGINEERING)	View By Subsection
Scrap_reason	section, category=Quality, gran, date	remarks (the reason)	default View; reason text from remarks
Scrap_m	section, category=Quality, gran, date	machine	View By Machine
Scrap_sku	section, category=Quality, gran, date	itemcode	View By SKU
Scrap_m_sku	section, category=Quality, gran, date	machine + itemcode	View By Machine+SKU
Real example — Curing, DAY 2026-06-25: Scrap_s → BUILDING 123 / CURING 65 / ENGINEERING 13; Scrap_reason → IL Blister 11, Light SW 4, Flash cure 3 (section-wide, not under a clicked area). Rework_* identical with remarks reasons.

19.6 NCM Hold drill — parameters
Step	Filters passed	Detail columns
NCM_Hold (card)	section, category=Quality, product_type = <selected> (+ sub_section for Stock), gran, date	the hold quantity
→ NCM_Hold_sku	same section + product_type (+ sub_section) + gran + date	itemcode (Item Code), actual_value (Hold Qty), status (Final Status), remarks (Reason — blank for now)
NCM_Hold_sku rows carry section + product_type + itemcode, so the detail inherits the card's selected section/product_type directly. Real example — Mixing/Compound: detail rows K4 WA qty 1,400 status Rework, etc.

19.7 Inventory drill — parameters
Step	Filters passed	Keyed by
Inventory (card)	category=Inventory, product_type = <bar>, section (from row), unit, gran, date	the bar value
→ Inventory_item	same category + product_type + section + unit + gran + date	itemcode
19.8 Summary — parameter inheritance rule
Every drill: inherit plant, department, section, category, granularity, date.
Swap kpi_name -> child from drill_down_attribute (parse single-quoted list).
Pass an extra filter ONLY where the child carries that dimension:
   • OEE press path (all sections): pass machine = <clicked press> to Availability_m/Performance_m/Quality_m + loss reasons.
   • Stock OEE only: card is OEE_s for the selected subsection; pass sub_section to OEE_s/Availability_s/Performance_s/Quality_s AND to OEE_m (Stock OEE_m carries sub_section) to list that subsection's presses.
   • NCM Hold / Inventory: keep the card's product_type (+ sub_section for Stock) on the _sku/_item detail.
Do NOT pass sub_section to _m / _sku / _reason levels EXCEPT Stock OEE_m (others have sub_section = NULL -> would return nothing).
The _s (subsection) and _m/_sku/_reason children are PARALLEL View-By lenses on the section (except Stock OEE, which nests subsection -> machine).