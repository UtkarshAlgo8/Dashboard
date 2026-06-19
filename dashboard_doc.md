Dashboard — Implementation Change Spec (Logic Only)
Targets the gold-layer data contract (columns: plant, department, section, sub_section, tyre_type, machine, product_type, itemcode, granularity, category, kpi_name, unit_of_measurement, drill_down_attribute, actual_value, threshold_value, status …). Plant: Banmore · Department: Production · Latest/anchor day in data: the maximum date present.

> Scope: This document describes *logic and behavior *
0. Ground rules (apply everywhere)
Navigation is attribute-driven. drill_down_level is NOT used for navigation. To drill, read the clicked KPI's drill_down_attribute (a JSON array of child kpi_names); load those child kpi_names; recurse if a child has its own non-empty attribute; an empty attribute ([] / null) means it is a leaf (no further drill).
Always pin ONE series before showing a card or a plot. The same kpi_name can have many rows for one date (one per product_type and/or sub_section). Pin product_type and sub_section so exactly one row per date is selected. Defaults are in §4.
Read pre-aggregated values; never recompute time. Daily, each Shift, Month-to-date (MTD) and Year-to-date (YTD) are stored as their own rows. Do not sum days to build a month, and do not average daily OEE.
Anchor "today" to the latest date present in the data, not the system clock.
Units are never combined. Production exists in two units; always filter unit_of_measurement.
1. KPI Trend Analysis — rename + 3 options
Replace Today with Daily. Trend options become:

Daily
Monthly
Yearly
(Frontend label + the value passed to the trend request.)

2. Trend chart logic (Daily / Monthly / Yearly)
A trend is a series of points over time (a card is a single value). Only the granularity and the x-axis change between the three options. Every trend series must be pinned to one product_type + sub_section (§4) so the line represents one consistent series.

Daily
Use the Daily rows.
Show the current month's day-by-day trend — one point per day, anchored to the latest available date.
Result: multiple points (e.g. day 1, day 2, day 3 …), not a single point.
Monthly
Use the MTD rows.
One point per month = the latest available MTD value within that month. For a completed month that is its last available date; for the running month it is the latest available date so far.
Do not plot every MTD row (that produces a saw-tooth that resets each month), and do not average daily values.
Yearly
Use the YTD rows.
One point per year = the latest available YTD value within that year (same idea as Monthly, one level up).
Verify: the right-most point of each trend equals that time view's KPI card value.

example
The universal idea (both KPIs)
A plot is one line over time. Before drawing, pin one series so each date returns exactly one number. The only difference between OEE and Production is what you pin:

OEE → pin sub_section, never product_type (OEE isn't product-specific; its product_type is always empty).
Production → pin product_type and unit_of_measurement (Production is product-specific and exists in two units).
Then the time button (Daily/Monthly/Yearly) just selects the granularity (Daily / MTD / YTD).

OEE plot — pin sub_section, no product_type
Section	What the plot shows	Pin	Verified value (Daily)
Mixing	Overall Mixing OEE	kpi_name=OEE_o, sub_section empty, no product_type	82.88%
TBM	Overall TBM OEE	kpi_name=OEE_o, sub_section empty, no product_type	79.35%
Curing	Overall Curing OEE	kpi_name=OEE_o, sub_section empty (= the overall row); Tredges only in drill	85.14%
Stock	Selected subsection OEE	kpi_name=OEE_o, sub_section = <selected> (Cutter/Extruder/3 Roll/Slitter), no product_type	Cutter 84.62%, Extruder 82.19%
Key rule for OEE: the disambiguator is sub_section, not machine — every OEE_o row has an empty machine, so a machine filter does nothing. For Mixing/TBM there's no subsection, so the overall is just "no subsection." For Curing the overall is the row where sub_section is empty (the 6 Tredges are separate rows for the drill). For Stock you must have a subsection selected (Stock is always viewed per subsection).

Production plot — pin product_type + unit
Section	Default product to plot	Pin	Verified value (Daily)
Mixing	the selected compound	product_type = Final Compound (or Master), unit = MT (or Batches), no sub_section	199.55 MT
TBM	total green tyres	product_type = Green Tyre, unit = nos (or kg), no sub_section	1037.85 nos
Curing	total cured tyres	product_type = Cured Tyre, unit = nos (or kg), no sub_section	8010.20 nos
Stock	subsection total	product_type = Overall, sub_section = <selected>, unit = units (or kg)	Cutter 177.94 units
Key rule for Production: - Mixing → pin the compound pill (Master/Final). - TBM/Curing → default to the sum product type (Green Tyre / Cured Tyre); if the user picks a tyre category, pin Passenger Radial / LT Radial / SUV Radial instead. - Stock → pin product_type = Overall for the subsection total; if the user picks a product (e.g. Ply), pin that; also pin the selected sub_section. - Always pin the unit — never mix MT with Batches, or units with kg.

Quick reference table
Pin product_type?	Pin sub_section?	Pin unit?
OEE (all sections)	❌ never (empty)	✅ Curing=empty(overall)/Tredge in drill · Stock=selected · Mixing/TBM=none	❌ (single unit %)
Production (all sections)	✅ Mixing=compound · TBM=Green Tyre · Curing=Cured Tyre · Stock=Overall	✅ Stock=selected · others=none	✅ always
Then for the time axis (both KPIs): Daily = Daily rows, one point per day (current month); Monthly = MTD rows, latest MTD per month; Yearly = YTD rows, latest YTD per year — with the same pins applied to every point on the line.

3. OEE (OE) plot — operational levels only, never product-type
Rule: OEE does not depend on product type. Show the OEE card/plot ONLY at: * Overall section level * Valid sub-section level * Tredge (trench) level — Curing drill-down only * Machine / Press level

Never show OEE product-type-wise (no Final Compound, Master Compound, Ply, Belt OEE).

Data status: already enforced in the data — every OEE-family row (OEE_o, OEE_s (Curing trench), OEE_m, Availability_o/s/m, Performance_o/s/m, Quality_o/s/m, and the loss leaves Breakdown, Setup, Startup, ToolChange, MinorStoppage, ReducedSpeed, Defect, Scrap) has product_type empty/NULL. So the frontend must simply never apply a product_type filter to OEE, and must pin sub_section instead.

Per-section OEE plot pinning
Section	OEE plot shows	Pin
Mixing	Overall Mixing OEE only	section-level (no sub_section, no product_type)
Curing	Overall Curing OEE only	the overall row (sub_section empty); Tredge-wise OEE appears only in drill-down
Stock	selected sub-section OEE	sub_section = the selected one (Cutter / Slitter / Extruder / 3 Roll); no product_type
TBM	Overall TBM OEE only	section-level (no sub_section, no product_type)
Critical correction (current bug): the OEE disambiguator is sub_section, not machine. Every OEE_o row has an empty machine, so filtering on "machine is blank" does NOT isolate the overall — it returns the overall and every Tredge/sub-section row, which is why the OEE plot currently stacks several points on the same date. Fix: pin sub_section empty (overall) or sub_section = the selected one. Do not use a machine filter to isolate OEE.

Verify (Curing, Daily, latest day): the OEE plot returns one row per day (overall OEE), not several rows (overall + 6 Tredges) on the same date.

4. Series-pinning defaults (most important behavior)
When the user has not picked a product/sub-section, pin these defaults so a card or plot returns exactly one series:

Section	KPI type	Default product_type	Default sub_section
Mixing	Production / Quality	Master Compound or Final Compound (pill)	— (none)
Mixing	OEE / Downtime / Cost	(none — empty)	— (none)
Stock	Production / FTQ / Defect_Scrap / Scrap_Rate	Overall	the selected subsection (required)
Stock	OEE / Downtime / Plan_Compliance	(none — empty)	the selected subsection
TBM	Production	Green Tyre	— (none)
TBM	OEE / Downtime	(none — empty)	— (none)
Curing	Production	Cured Tyre	— (none, at the parent)
Curing	OEE / Downtime	(none — empty)	empty for overall (Tredge in drill)
Scope asymmetry: * Product-scoped KPIs (pin product_type): Production, FTQ, Defect_Scrap, Scrap_Rate, NCM_Hold. * Operational KPIs (never pin product_type; it is empty in the data): OEE_o, Availability_o, Performance_o, Quality_o, Downtime, and the whole OEE drill family. Pin section / sub_section only.

5. Time filter → granularity mapping (cards)
Time view (UI)	granularity	date
Today	Daily	latest day
Today → Shift A / B / C	Shift A / Shift B / Shift C	latest day
Month	MTD	latest day
Year	YTD	latest day
The Shift A/B/C sub-filter appears only under Today; Month/Year have no shift split.
The shift selection applies to both the card and its drilldown.
Production (a SUM) reconciles: Shift A + B + C = Day. Rates (OEE / FTQ / %) do not sum — the Day value is the overall rate, not the sum of the shifts.
6. Curing OEE drill-down (Tredge → Press → A/P/Q breakdown)
Curing-only exception, mirroring the Curing Production flow. Curing OEE has its own trench-level KPI (OEE_s) so the drill is fully attribute-driven (navigate by kpi_name, not by reusing one kpi_name across sub_sections). All OEE rows have product_type empty.

Navigate by the attribute chain (do not hardcode):

OEE_o            drill_down_attribute = ["OEE_s"]
  -> OEE_s        drill_down_attribute = ["OEE_m", "Availability_s", "Performance_s", "Quality_s"]
       - OEE_m            drill_down_attribute = ["Availability_m", "Performance_m", "Quality_m"]
            - Availability_m  -> ["Breakdown", "Setup", "Startup", "ToolChange"]   (leaves)
            - Performance_m   -> ["MinorStoppage", "ReducedSpeed"]                 (leaves)
            - Quality_m       -> ["Defect", "Scrap"]                               (leaves)
       - Availability_s   leaf
       - Performance_s    leaf
       - Quality_s        leaf
kpi_name	Level	One row per	Drills to
OEE_o	section overall	(section, sub_section empty)	OEE_s
OEE_s	trench	(Tredge)	OEE_m + trench Availability_s / Performance_s / Quality_s
Availability_s / Performance_s / Quality_s	trench	(Tredge)	leaf (loss breakdown is at press level)
OEE_m	press	(Tredge, Press)	Availability_m / Performance_m / Quality_m
Availability_m / Performance_m / Quality_m	press	(Tredge, Press)	loss leaves
Flow: 1. Click the OEE card (overall Curing OEE, sub_section empty) → first drill = Trench-wise (OEE_s, one row per Tredge 1–6). Each trench row shows OEE + Availability + Performance + Quality (OEE_s, Availability_s, Performance_s, Quality_s). 2. Click a Trench → open OEE_s's attribute: Press-wise (OEE_m, presses in that Tredge), each press showing OEE + Availability + Performance + Quality (OEE_m, Availability_m, Performance_m, Quality_m). 3. Click Availability / Performance / Quality at press level → the loss breakdown leaves: * Availability_m → Breakdown, Setup, Startup, ToolChange * Performance_m → MinorStoppage, ReducedSpeed * Quality_m → Defect, Scrap

Reconciliation: OEE_s = Availability_s × Performance_s × Quality_s per trench (multiplicative); OEE_m = Availability_m × Performance_m × Quality_m per press. (As with all dummy data, the section overall vs trench/press values reconcile by logic; exactness comes with real data.)

Trench A/P/Q (Availability_s etc.) are leaves — the loss breakdown lives only at press level (per §9 of the original change list). The trench level shows the four summary columns only.

For the generic (non-Curing) OEE drill, OEE_o's attribute is ["Availability_o","Performance_o","Quality_o","OEE_m"] and OEE_m's is ["Availability_m","Performance_m","Quality_m"]. Only Curing uses the OEE_s trench flow. (Curing keeps section-level Availability_o/Performance_o/Quality_o as the overall components, but the overall OEE card drills straight to OEE_s.)

7. Curing Production drill-down (separate from OEE) — Tredge → Press / SKU
Curing-only exception. The data already supports it. Production drilldown is a separate flow from OEE — do not mix Production into the OEE press table.

Navigate by the attribute chain (do not hardcode):

Production            drill_down_attribute = ["Production_s"]
  -> Production_s      drill_down_attribute = ["Production_m", "Production_m_sku", "Production_sku_m"]
       - Production_m       (press-wise)        leaf
       - Production_m_sku   (press + SKU)       leaf
       - Production_sku_m   (SKU + press)       leaf
kpi_name	Meaning
Production_s	Trench / sub-section-wise production (one row per Tredge)
Production_m	Press-wise production
Production_m_sku	Press-wise production with SKU
Production_sku_m	SKU-wise production with press detail
Flow: 1. Click the Production card → first drill = Trench-wise (Production_s, one row per Tredge 1–6). 2. Click a Trench → open Production_s's attribute: press-wise (Production_m), press+SKU (Production_m_sku), SKU+press (Production_sku_m), all for sub_section = Tredge N.

Verify: the trench values (Production_s) sum to the parent Production; a trench's presses (Production_m) sum to that trench's value.

Casing: kpi_names are capitalised (Production_s, Production_sku_m, …). Match the drill_down_attribute strings exactly (case-sensitive). Other sections (Mixing / Stock / TBM) keep the standard ["Production_m", "Production_sku", "Production_m_sku"] — only Curing uses the Production_s flow.

8. Behaviors the backend/app must guarantee (data-source independent)
These are logic requirements, independent of where data is read from:

Anchor "today" to the latest date in the data, not the system clock. Otherwise cards/plots come back empty when the calendar is ahead of the loaded data.
Card and drilldown must use the SAME time scope — same granularity and same date. (Observed symptom when this is violated: a card shows one day's value while its drilldown table sums every day in the data, so the numbers don't match.)
Pin one series on cards, drilldowns, AND plots — same product_type and sub_section everywhere. Forgetting this blends sub-sections/products (e.g. a Stock sparkline mixing all subsections, or an Extruder drill showing machines from all five subsections).
OEE is disambiguated by sub_section, not machine (see §3) — pin sub_section, never rely on the machine column for OEE.
Support all time selections — Daily, Shift A/B/C, MTD, YTD must all be accepted; do not reject MTD/YTD.
Derive the period (day / month / year) from the date value itself — do not depend on any auxiliary period columns that may or may not exist in the data source.
Navigation is by drill_down_attribute, not drill_down_level (see §0). Identify a parent card by its kpi_name (and empty machine/itemcode), and drill by the child kpi_names in the attribute.
9. Other dashboard items
Inventory page: plant-level (section empty). Bars from kpi_name = Inventory (12 product types: FG, Cured, Green, Tread, Belt, Ply, Cap Strip, Sidewall, Inner Liner, Bead, Final Compound, Master Compound); item drill from kpi_name = Inventory_item. No section / sub-section / machine / shift picker on this page.
Stock subsection tabs: Stock must expose subsection tabs (4 Roll, Extruder, 3 Roll, Cutter, Slitter) on every category tab; the selected subsection filters all KPIs. Then product types appear per subsection (4 Roll → Rubberised Ply / Rubberised Belt; Extruder → Sidewall / Tread; Cutter → Ply / Belt; Slitter → Cap Strip / Chafer; 3 Roll → Inner Liner; plus Overall).
TBM / Curing production product types: tyre category Passenger Radial / LT Radial / SUV Radial, with Green Tyre (TBM) / Cured Tyre (Curing) = the sum of the three (the default / overall).
10. Acceptance checklist
[ ] Trend filter shows Daily / Monthly / Yearly (Today renamed to Daily).
[ ] Daily trend = current month, one point per day (multiple points); right-most point = today's card.
[ ] Monthly = one point per month (latest MTD per month); Yearly = one point per year (latest YTD).
[ ] OEE plot pinned by sub_section (never product_type); Curing OEE plot returns ONE overall point per day (not several stacked on one date).
[ ] OEE per-section plot: Mixing overall, Curing overall, Stock selected-subsection, TBM overall.
[ ] Curing OEE drill: OEE_o → OEE_s (trench, with A_s/P_s/Q_s) → OEE_m (press, with A_m/P_m/Q_m) → loss breakdown; navigate by drill_down_attribute.
[ ] Curing Production drill: Production → Production_s (trench) → Production_m / Production_m_sku / Production_sku_m; separate from OEE; values reconcile (trenches sum to parent).
[ ] Cards and drilldowns use the same date + granularity + product_type + sub_section.
[ ] "Today" anchored to the latest date in the data; MTD/YTD read verbatim (no recompute).
[ ] Period derived from the date value; no dependency on auxiliary period columns.
[ ] Navigation uses drill_down_attribute only (no drill_down_level).
[ ] Inventory page enabled (plant-level); Stock subsection tabs enabled.