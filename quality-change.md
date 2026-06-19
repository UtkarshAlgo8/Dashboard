Dashboard Change Spec — Quality Tab, NCM Hold & Shift Comparison
Logic only — no SQL, no query code. Targets the gold-layer data contract (section, sub_section, machine, product_type, itemcode, granularity, category, kpi_name, unit_of_measurement, drill_down_attribute, actual_value, status, remarks). Data file: gold_layer_banmore_pcr_v28.parquet (the dummy data has already been updated for everything below). Scope: only the changes from the latest change list. Navigation is attribute-driven (drill_down_attribute); drill_down_level is not used.

1. Shift-wise Comparison — content + value-match fix
Problem: the shift-wise comparison values did not match the total production value (e.g. Mixing monthly ≈ 3,258 MT, but shifts showed A 184 / B 161 / C 128).

Cause: a period mismatch — the production card showed the monthly (MTD) total while the shift comparison showed one day's shifts. A single day's shifts cannot sum to a whole month. Shift data exists only at the daily level (Shift A / Shift B / Shift C).

1a. What the table must show (columns)
The shift comparison table shows quantity KPIs only — do NOT show rates (OEE / FTQ / any %). For the current section, show per shift (for today = the latest day):

Shift	Production	Scrap	Rework
Shift A	…	…	…
Shift B	…	…	…
Shift C	…	…	…
Production = the section's production quantity for the selected/default product. In Curing this is Cured Tyre (product_type = 'Cured Tyre', unit nos); Mixing = the selected compound (MT/Batches); TBM = Green Tyre (nos); Stock = the subsection Overall (units).
Scrap = Scrap (category = Quality) for the section.
Rework = Rework (category = Quality) for the section.
No OEE %, no FTQ %, no rate columns. Only count/quantity columns belong here, because only sum-type values reconcile across shifts.
1b. Reconciliation behavior
All three columns are SUM KPIs, so Shift A + Shift B + Shift C = Daily total for each column.
Compare shifts against the same day's (Daily) totals — not MTD/YTD.
When the top time filter is Month or Year, do not compare shifts to the monthly/yearly total (no monthly shift totals exist); show the latest day's shifts and label it, or hide the comparison.
Data status: done. Scrap and Rework now have Shift A / Shift B / Shift C rows (split from Daily so they reconcile). Production already had shift rows. Example (Curing, today): Production Cured Tyre A 3043.84 / B 2723.44 / C 2242.95; Scrap A 24.45 / B 30.02 / C 27.30; Rework A 26.21 / B 26.39 / C 11.55. Scrap shifts sum to the Daily scrap (81.77), etc.

2. Quality tab — KPI list update
Old Quality tab KPIs: FTQ, Defect + Scrap, Scrap Rate, NCM Hold. New Quality tab KPIs (only these four):

FTQ
Scrap
Rework
NCM Hold
Defect + Scrap and Scrap Rate are removed.

Data status: done. Defect_Scrap* and Scrap_Rate* were removed from the Quality category; Scrap and Rework were added (category = Quality). FTQ and NCM Hold are unchanged.

3. FTQ drill-down
Flow: FTQ → Machine-wise FTQ.

FTQ drill_down_attribute = ["FTQ_m"].
Click FTQ → show machine-wise FTQ (FTQ_m), one row per machine, same context (section / sub-section / product type) as the card.
4. Scrap drill-down
Flow: Scrap → Subsection-wise Scrap → View By: Reason / Machine / SKU / Machine + SKU.

Attribute chain (navigate by attribute; do not hardcode):

Scrap          drill_down_attribute = ["Scrap_s"]
  -> Scrap_s    drill_down_attribute = ["Scrap_reason", "Scrap_m", "Scrap_sku", "Scrap_m_sku"]
       - Scrap_reason   (Reason-wise — default view)   leaf
       - Scrap_m        (Machine-wise)                 leaf
       - Scrap_sku      (SKU-wise)                     leaf
       - Scrap_m_sku    (Machine + SKU-wise)           leaf
kpi_name	Meaning
Scrap	Total scrap for the current context (parent card)
Scrap_s	Subsection-wise scrap (one row per scrap subsection)
Scrap_reason	Reason-wise scrap — the reason comes from the remarks column
Scrap_m	Machine-wise scrap
Scrap_sku	SKU-wise scrap
Scrap_m_sku	Machine + SKU-wise scrap
Important — Scrap subsections are different from the normal dashboard subsections. They come from the scrap data rows (the sub_section value on the scrap rows), and are:

Building
Curing
Engineering
Development
Behavior: 1. Click Scrap → first drill = Subsection-wise (Scrap_s, one row per Building / Curing / Engineering / Development). 2. Click a subsection → default view is Reason-wise (Scrap_reason, reason text from remarks). 3. A View By control switches the table between Reason-wise (Scrap_reason), Machine-wise (Scrap_m), SKU-wise (Scrap_sku), Machine + SKU-wise (Scrap_m_sku) — all filtered to the clicked subsection.

Reason-wise uses the remarks column (the scrap reason is stored there).

5. Rework drill-down
Rework follows the same structure as Scrap.

Flow: Rework → Subsection-wise Rework → View By: Reason / Machine / SKU / Machine + SKU.

Rework          drill_down_attribute = ["Rework_s"]
  -> Rework_s    drill_down_attribute = ["Rework_reason", "Rework_m", "Rework_sku", "Rework_m_sku"]
       - Rework_reason   (Reason-wise — default view, reason from `remarks`)   leaf
       - Rework_m        (Machine-wise)                                        leaf
       - Rework_sku      (SKU-wise)                                            leaf
       - Rework_m_sku    (Machine + SKU-wise)                                  leaf
Same scrap-style subsections (Building / Curing / Engineering / Development).
Default view after clicking a subsection = Reason-wise (Rework_reason, from remarks).
View By switches Reason / Machine / SKU / Machine + SKU, filtered to the clicked subsection.
6. NCM Hold — works on the already-selected filters
NCM Hold is a Quality-tab KPI. For all sections, it must automatically reflect the currently selected context — the user should not have to pick the product type again after clicking NCM Hold.

NCM_Hold drill_down_attribute = ["NCM_Hold_sku"].

Detail table (on click) — item-code-wise hold details, columns:

Item Code → itemcode
Hold Quantity → actual_value
Final Status → status
Remark / Reason → remarks (where available)
6a. Mixing
The top toggle selects Master Compound or Final Compound (one selected by default).
NCM Hold shows the hold quantity for the selected compound only (pin product_type = the selected compound).
Click → item-code-wise hold details for that compound.
Flow: Quality Tab → Selected Compound → NCM Hold → Item-code-wise Hold Details.
6b. Stock
The subsection is selected from the top filter (Cutter / Slitter / Extruder / Three Roll), and a product type is selected by default within it (e.g. Cutter → Ply).
NCM Hold shows the hold quantity for the selected subsection + selected product type (e.g. Ply only).
Click → item-code-wise hold details for that subsection + product type.
Flow: Quality Tab → Selected Subsection → Selected Product Type → NCM Hold → Item-code-wise Hold Details.
6c. TBM and Curing
NCM Hold depends on the selected product type (TBM → the selected Green Tyre / category; Curing → the selected Cured Tyre / category).
Click → item-code-wise hold details.
Flow: Quality Tab → Selected Product Type → NCM Hold → Item-code-wise Hold Details.
Data status: supported as-is. NCM_Hold carries product_type per section (Master Compound / Final Compound / Green Tyre / Cured Tyre), and NCM_Hold_sku already has itemcode, actual_value (hold qty), status (final status), and remarks (reason). The frontend only needs to pin the already-selected section / sub_section / product_type.

7. Important note — Scrap name exists in two categories
Scrap appears as a kpi_name in two categories: * category = Productivity — the OEE quality-loss leaf (under Quality_m in the OEE drill). * category = Quality — the new Quality-tab KPI described above.

Every Quality-tab query must pin category = 'Quality' so it does not pick up the OEE-loss Scrap. (Same discipline applies generally: pin category for the active tab.)

8. Acceptance checklist
[ ] Shift comparison shows Production / Scrap / Rework only (no OEE/FTQ/rate columns), per shift for today; Shift A+B+C = Daily total for each column.
[ ] Quality tab shows exactly: FTQ, Scrap, Rework, NCM Hold (Defect+Scrap and Scrap Rate removed).
[ ] FTQ → machine-wise FTQ (FTQ_m).
[ ] Scrap → subsection-wise (Scrap_s: Building/Curing/Engineering/Development) → View By Reason/Machine/SKU/Machine+SKU; reason from remarks; default view = Reason.
[ ] Rework → same structure as Scrap (Rework_s → Reason/Machine/SKU/Machine+SKU; reason from remarks).
[ ] NCM Hold reflects the selected section/subsection/product type without re-selection; detail table = Item Code, Hold Qty, Final Status, Remark.
[ ] Every Quality-tab query pins category = 'Quality' (so the OEE-loss Scrap is not picked up).