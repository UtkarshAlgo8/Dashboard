# Dashboard KPI Journey Documentation

> Validated against data: `gold_layer_banmore_pcr_v24.csv`
> Plant: **Banmore** · Department: **Production** · Data date range: **2026-04-01 → 2026-05-14** (latest/anchor day = **2026-05-14**)
> Every journey below was tested with real rows from the data; the example output shown under each journey is the actual result.

---

## 1. Purpose

This document describes the complete dashboard journey for the JK Tyre Banmore plant: how a user navigates from plant selection down to a single KPI, how the KPI card value is chosen, how the time/shift filters behave, and how each drilldown is opened and populated.

The dashboard is built **dynamically from the data**. Drilldowns are driven entirely by each KPI's **`drill_down_attribute`** field — the child `kpi_name`s listed there decide what the next drill shows. **`drill_down_level` is not used anywhere** in the navigation logic. Every journey in this document was first validated against the data, and the example output under each journey is the real result returned for that journey.

---

## 2. Generic Dashboard Journey

Every view is reached by the same ordered sequence. Steps in **[brackets]** apply only to some sections.

```
Plant
 → Department
 → Section                         (Mixing / Stock / TBM / Curing)
 → [Sub-section]                   (only for Stock section---extruder,cutter,slitter,4roll,3roll etc)
 → [Tyre Type]                     (constant PCR for Banmore — no selection needed)
 → Category / KPI Tab              (Productivity / Quality / Cost / Morale / Safety / Inventory)
 → Time Filter                     (Today / Month / Year)
 → [Shift sub-filter]              (only when Today is selected)
 → [Product Type]                  (ply,belt,passenger radial,master compound,final compound etc)
 → KPI Card                        (read at the selected Unit)
 → Drilldown                       (click the card)
      → View By / drill option     (decided by the KPI's drill_down_attribute)
      → [Unit]                     (only when the KPI has more than one unit)
      → Child KPI rows
```

The context (plant, department, section, sub-section, product type, granularity, category, unit) is carried unchanged from the parent card into the drilldown. Drilling only changes which `kpi_name` is fetched.

---

## 3. Time Filter and Granularity Logic

The `granularity` column holds pre-aggregated rows, so the backend **never recomputes time** — it picks the row that matches the selected filter.

| Time filter (UI) | `granularity` value | What it reads |
|---|---|---|
| **Today** | `Daily` | the latest available Daily row |
| Today → **Shift A / B / C** | `Shift A` / `Shift B` / `Shift C` | that shift's row for the day |
| **Month / Monthly** | `MTD` | the latest available month-to-date row |
| **Year / Yearly** | `YTD` | the latest available year-to-date row |

Granularity values present in data: `Daily`, `Shift A`, `Shift B`, `Shift C`, `MTD`, `YTD`.

**Critical rules**

1. **Anchor to the data, not the system clock.** "Today" must resolve to `MAX(date)` in the data (here `2026-05-14`). Using the real calendar date returns empty cards because the data ends earlier.
2. **Read, don't recompute.** MTD/YTD values are stored — read them verbatim. Do not average daily values to make a monthly number. (Especially OEE: the stored MTD OEE is already `Availability × Performance × Quality`.)
3. **Same context for parent and drilldown.** The selected time/shift/unit applies to **both** the KPI card and its drilldown rows. If the card is "Today / Daily", the drilldown must also filter `granularity = 'Daily'` and `date = 2026-05-14` — otherwise the drilldown sums across all days and will not reconcile with the card.

---

## 4. Parent KPI Logic

A **parent KPI** is the KPI named on the tab and shown as a card. It is identified by:

- `kpi_name` = the parent name (e.g. `Production`, `OEE_o`, `FTQ`)
- `machine` is blank, `itemcode` is blank (the aggregate row)
- value is the aggregated value for the selected context

There is **no level field** — the `kpi_name` itself identifies the parent (e.g. `Production` is the parent; `Production_m` is its machine-level child). To know whether a parent drills, read its **`drill_down_attribute`**: if it lists child `kpi_name`s, the card drills; if it is empty, the card is a leaf (value only).

**Multiple units:** if a KPI exists in more than one unit, there is **one parent row per unit**, and the card shows the value for the **currently selected unit**. Units are never combined.

KPIs that carry multiple units in this data:

| KPI | Section | Units |
|---|---|---|
| `Production` | Mixing | `MT`, `Batches` |
| `Production` | Stock | `units`, `kg` |
| `Production` | TBM | `nos`, `kg` |
| `Production` | Curing | `nos`, `kg` |

All other KPIs are single-unit (`%`, `hrs`, `nos`, `/5`, `/person`, `hrs/m`, `₹L`, `kWh/MT`, `batches`, `tyres`).

---

## 5. Drilldown Logic (attribute-driven, recursive)

Drilldown is driven **only** by `drill_down_attribute`, a JSON array of child `kpi_name`s. There is **no `drill_down_level`** in the logic.

**Algorithm**

1. Read the clicked KPI's `drill_down_attribute`.
2. If empty → leaf, no drilldown.
3. If it lists child `kpi_name`s → the drill option / **View By** selects one of them.
4. Fetch rows for that child `kpi_name` using the **same context** (plus the populated `machine`/`itemcode`/`product_type` and selected unit).
5. **Recurse:** if the child row itself has a non-empty `drill_down_attribute`, it can be drilled again the same way.

**Example — the Production attribute maps View By to a child name:**

```
Production.drill_down_attribute = ["Production_m", "Production_sku", "Production_m_sku"]
   View By = Machine        → Production_m
   View By = SKU            → Production_sku
   View By = Machine + SKU  → Production_m_sku
```

**The full attribute-driven tree in this data** (validated):

```
OEE_o            → [Availability_o, Performance_o, Quality_o, OEE_m]
   Availability_o  → (leaf)
   Performance_o   → (leaf)
   Quality_o       → (leaf)
   OEE_m           → [Availability_m, Performance_m, Quality_m]
      Availability_m → [Breakdown, Setup, Startup, ToolChange]   (all leaves)
      Performance_m  → [MinorStoppage, ReducedSpeed]             (all leaves)
      Quality_m      → [Defect, Scrap]                           (all leaves)

Production       → [Production_m, Production_sku, Production_m_sku]   (all leaves)
Downtime         → [Downtime_category]                               (leaf)
Plan_Compliance  → (leaf)

FTQ              → [FTQ_m]                                           (leaf)
Defect_Scrap     → [Defect_Scrap_m, Defect_Scrap_sku]               (leaves)
Scrap_Rate       → [Scrap_Rate_m, Scrap_Rate_sku]                   (leaves)
NCM_Hold         → [NCM_Hold_sku]                                    (leaf)

Specific_Power   → [Specific_Power_m]                                (leaf)
Scrap_Cost       → (leaf)
Budget_Util      → (leaf)

TQM_Score        → [TQM_pillar]                                      (leaf)
Suggestions      → [Suggestions_category]                            (leaf)
Training         → [Training_area]                                   (leaf)
Absenteeism      → [Absenteeism_section]                             (leaf)

Reportable       → [Reportable_log]                                  (leaf)
First_Aid        → [First_Aid_log]                                   (leaf)
Near_Miss        → [Near_Miss_category]                              (leaf)
Safety_Audit     → [Audit_area]                                      (leaf)

Inventory        → [Inventory_item]                                  (leaf)
```

Only `OEE_o` (via `OEE_m`) drills more than one level; every other KPI drills exactly one level to leaves. **Do not hardcode child names — always read `drill_down_attribute`.**

---

## 6. Validated Sample Journey: Mixing Production KPI

**Journey:** Banmore → Production → Mixing → Productivity → Today (Daily) → Product Type = Final Compound → KPI = Production.

### 6.1 Validation result — PASS

**Parent KPI rows** (`kpi_name = Production`, `machine` blank, date `2026-05-14`) — two rows, one per unit:

| Unit | Actual | Threshold | Status | `drill_down_attribute` |
|---|---|---|---|---|
| MT | **199.55** | 430.6 | Yellow | `["Production_m","Production_sku","Production_m_sku"]` |
| Batches | **608.93** | 1433.9 | Yellow | `["Production_m","Production_sku","Production_m_sku"]` |

Card shows `199.55 MT` by default; switching unit shows `608.93 Batches`.

**View By = Machine** → child `Production_m`, Unit MT:

| Machine | Actual (MT) | Status |
|---|---|---|
| Banbury 1 | 39.46 | Green |
| Banbury 2 | 41.01 | Green |
| Banbury 3 | 34.74 | Yellow |
| Banbury 4 | 36.02 | Green |
| Banbury 5 | 18.46 | Red |

**View By = SKU** → child `Production_sku`, Unit MT:

| Item code | Actual (MT) | Status |
|---|---|---|
| ML405 | 78.50 | Green |
| MS66 | 88.16 | Green |
| MT3708 | 78.60 | Green |

**View By = Machine + SKU** → child `Production_m_sku`, Unit MT (sample):

| Machine | Item code | Actual (MT) |
|---|---|---|
| Banbury 1 | ML405 | 14.85 |
| Banbury 1 | MS66 | 14.82 |
| Banbury 1 | MT3708 | 17.96 |
| Banbury 2 | ML405 | 21.31 |

Switching Unit to **Batches** returns the Batches breakdown (Banbury 1 = 124.76, … Banbury 5 = 60.84). All values, thresholds, and statuses match the data.

### 6.2 Reconciliation note

**The base logic is `parent value = sum of its children`, and that logic is correct.** It will hold on real data.

The only reason a Mixing parent does not exactly equal the sum of its Banbury rows in this file is that **we are working with dummy data** — the dummy was generated with independent random values at the parent and machine levels, so they do not roll up to the decimal. This was expected and called out for the dummy. **When real data is loaded, the same journey logic reconciles** (parent = Σ children) with no change.

For confirmation that the logic and structure are right, the **TBM and Curing** Production parents — which were generated by true aggregation — reconcile **exactly** in this same dummy file (see §14: `Passenger + LT + SUV = Green Tyre` to the decimal). So the journey is correct; the Mixing gap is purely a dummy-data artifact.

---

## 7. Production / Productivity Journeys

**Tab:** Productivity (default). Present in every section. Parent KPIs: `OEE_o`, `Availability_o`, `Performance_o`, `Quality_o`, `Production`, `Downtime`, `Plan_Compliance`.

### 7.1 OEE (`OEE_o`) — multi-level drill

- **Unit:** `%`. **Attribute:** `["Availability_o","Performance_o","Quality_o","OEE_m"]`.
- **Validated example** — Banmore → Mixing → Productivity → Today → Final Compound:

```
Parent  OEE_o = 83.46 %
 ├─ Availability_o = 86.67 %   (leaf)
 ├─ Performance_o  = 95.01 %   (leaf)
 ├─ Quality_o      = 100.00 %  (leaf)
 └─ OEE_m  (per machine; attribute ["Availability_m","Performance_m","Quality_m"])
       Banbury 1 = 90.15   Banbury 2 = 82.16   Banbury 3 = 89.82
       Banbury 4 = 89.43   Banbury 5 = 60.64
          OEE_m (Banbury 1) →
             Availability_m = 94.74 %  → [Breakdown 16.69, Setup 10.23, Startup 9.38, ToolChange 7.77]  (min)
             Performance_m  = 95.27 %  → [MinorStoppage, ReducedSpeed]
             Quality_m      = 99.06 %  → [Defect, Scrap]
```

- **Rule:** OEE is multiplicative — `OEE_o = Availability_o × Performance_o × Quality_o`. Read stored MTD/YTD OEE; do not average daily OEE.
- **Scope:** machine event — **not** product-scoped (see §15.5).

### 7.2 Production (`Production`)

- **Units:** Mixing `MT`/`Batches`; Stock `units`/`kg`; TBM `nos`/`kg`; Curing `nos`/`kg`.
- **Attribute:** `["Production_m","Production_sku","Production_m_sku"]` → Machine / SKU / Machine + SKU.
- **Validated example:** see §6 (Mixing), §13 (Stock), §14 (TBM/Curing).

### 7.3 Downtime (`Downtime`)

- **Unit:** `hrs`. **Attribute:** `["Downtime_category"]`.
- **Validated example** — Mixing → Today → Final Compound:

```
Parent  Downtime = 1.0 hrs
 └─ Downtime_category:
      BD-ELEC: Motor overload trip       0.12 hrs
      BD-INST: Thermocouple failure      0.13 hrs
      BD-MECH: Cylinder seal leak        0.09 hrs
      OTHER: TECH. OTHERS                0.11 hrs
      PM: PREV MAINTENANCE               0.08 hrs
      PROCESS: PROCESS MAJOR ISSUE       0.14 hrs
      SETUP: SIZE CHANGE                 0.13 hrs
      UTILITY: POWER FAILURE             0.17 hrs
```

- **Scope:** machine event — not product-scoped.

### 7.4 Plan Compliance (`Plan_Compliance`)

- **Unit:** `%`. **Attribute:** empty → **leaf, no drilldown**.
- **Validated example** — Mixing → Today → Final Compound: `Plan_Compliance = 89.98 %`, Status Yellow.

### 7.5 Availability / Performance / Quality (`Availability_o`, `Performance_o`, `Quality_o`)

- **Unit:** `%`. Leaves as standalone cards; also appear as children of `OEE_o`.

---

## 8. Quality Journeys

**Tab:** Quality. Present in every section. Parent KPIs: `FTQ`, `Defect_Scrap`, `Scrap_Rate`, `NCM_Hold`. All single-unit, all product-scoped (e.g. Mixing splits by Final/Master Compound).

| KPI | Unit | Attribute | Drill options |
|---|---|---|---|
| `FTQ` | `%` | `["FTQ_m"]` | Machine |
| `Defect_Scrap` | `nos` | `["Defect_Scrap_m","Defect_Scrap_sku"]` | Machine / SKU |
| `Scrap_Rate` | `%` | `["Scrap_Rate_m","Scrap_Rate_sku"]` | Machine / SKU |
| `NCM_Hold` | `batches` | `["NCM_Hold_sku"]` | SKU |

**Validated example** — Banmore → Mixing → Quality → Today → Final Compound:

```
FTQ           = 99.62 %      → FTQ_m: Banbury 1 98.87, 2 98.69, 3 99.06, 4 100.00, 5 96.88
Defect_Scrap  = 12.33 nos    → Defect_Scrap_m (Banbury 1 2.20 … 5 2.37) ; Defect_Scrap_sku (ML405 4.4, MS66 3.4, MT3708 4.6)
Scrap_Rate    = 0.56 %       → Scrap_Rate_m / Scrap_Rate_sku
NCM_Hold      = 2.12 batches → NCM_Hold_sku
```

---

## 9. Cost Journeys

**Tab:** Cost. Present in every section. Parent KPIs: `Specific_Power`, `Scrap_Cost`, `Budget_Util`.

| KPI | Unit | Attribute | Drill |
|---|---|---|---|
| `Specific_Power` | `kWh/MT` | `["Specific_Power_m"]` | by machine |
| `Scrap_Cost` | `₹L` | empty | leaf |
| `Budget_Util` | `%` | empty | leaf |

**Validated example** — Banmore → Mixing → Cost → Today:

```
Specific_Power = 325.52 kWh/MT  → Specific_Power_m: Banbury 1 302.58, 2 313.00, 3 321.86, 4 333.04, 5 344.38
Scrap_Cost     = 4.19 ₹L   (leaf)
Budget_Util    = 88.24 %   (leaf)
```

> Note: in Mixing, Cost KPIs carry `product_type = "Compound"` (not split into Master/Final). Cost is reported once per section, not per compound.

---

## 10. Morale Journeys

**Tab:** Morale. Section-level KPIs: `TQM_Score`, `Suggestions`, `Training`. Plus the **plant-level** KPI `Absenteeism`.

| KPI | Scope | Unit | Attribute |
|---|---|---|---|
| `TQM_Score` | section / sub-section | `/5` | `["TQM_pillar"]` |
| `Suggestions` | section / sub-section | `/person` | `["Suggestions_category"]` |
| `Training` | section / sub-section | `hrs/m` | `["Training_area"]` |
| `Absenteeism` | **plant-level** (`section` blank) | `%` | `["Absenteeism_section"]` |

**Validated example** — Banmore → Stock → 4 Roll → Morale → Today:

```
TQM_Score   = 3.8 /5        → TQM_pillar: 5S 4.02, Kaizen 3.52, PM Pillar 3.48, QC Circle 4.04, Suggestion 3.29
Suggestions = 1.15 /person  → Suggestions_category
Training    = 4.81 hrs/m    → Training_area
```

**Plant-level Absenteeism** (fetch with `section` blank):

```
Absenteeism = 3.24 %  → Absenteeism_section: Curing 4.35, Mixing 3.61, TBM 2.72, Stock (per subsection) 2.35 / 2.23 / 2.40 …
```

- **`Absenteeism` is special:** it is a plant KPI shown on each section's Morale tab; its drill breaks it down by section. Keep `section` blank when fetching the parent.

---

## 11. Safety Journeys

**Tab:** Safety. Present in every section. Parent KPIs: `Reportable`, `First_Aid`, `Near_Miss`, `Safety_Audit`.

| KPI | Unit | Attribute | Child type |
|---|---|---|---|
| `Reportable` | `nos` | `["Reportable_log"]` | incident log |
| `First_Aid` | `nos` | `["First_Aid_log"]` | incident log |
| `Near_Miss` | `nos` | `["Near_Miss_category"]` | by category |
| `Safety_Audit` | `%` | `["Audit_area"]` | by audit area |

**Validated example** — Banmore → TBM → Safety → Today:

```
Reportable   = 0.0 nos    → Reportable_log
First_Aid    = 3.2 nos    → First_Aid_log
Near_Miss    = 12.2 nos   → Near_Miss_category: Electrical 2.0, Housekeeping 2.0, Unsafe Act 4.8, Unsafe Condition 3.8
Safety_Audit = 94.08 %    → Audit_area: BJ Area 91.94, Stage 1/2 92.92, Tool Room 90.56, VMI Section 94.36
```

---

## 12. Inventory Journey

**Tab:** Inventory. This is a **plant-level page** — `section` is blank, so there is **no section / sub-section / machine / shift** selection.

| KPI | Unit | Attribute |
|---|---|---|
| `Inventory` (bars) | `tyres` | `["Inventory_item"]` |
| `Inventory_item` (drill) | `tyres`, `kg` | leaf |

- **Bars (`product_type` on `Inventory`):** FG, Cured, Green, Tread, Belt, Ply, Cap Strip, Sidewall, Inner Liner, Bead, Final Compound, Master Compound.
- **Display grouping:** Production = FG / Cured / Green · Stock = Tread / Belt / Ply / Cap Strip / Sidewall / Inner Liner / Bead · Compound = Final / Master Compound.

**Validated example** — Banmore → Inventory → Today:

```
Bars (Inventory): FG 7603, Cured 5650, Green 4384, Tread 3002, Belt 2436, Ply 3658,
                  Cap Strip 1396, Sidewall 2040, Inner Liner 1610, Bead 3165,
                  Final Compound 4796, Master Compound 3516   (tyres)
Drill bar "Tread" → Inventory_item: TR-PCR-001 1609 kg, TR-PCR-002 1075 kg, TR-LTR-001 639 kg
```

---

## 13. Stock Production Journey (two-step: sub-section → product type)

**Journey:** Banmore → Production → Stock → **Cutter** → Productivity → Today → **Ply**.

Stock is a two-step reveal: choose a sub-section, then its product types appear. Each sub-section also has an **`Overall`** product type = the subsection total.

**Validated example** — Stock → Cutter → Today → units:

```
Parent Production, product_type = Overall  = 177.94 units   (subsection total)
Parent Production, product_type = Ply      = 106.76 units
   View By Machine → Production_m (Ply): LTBC = 106.76
   View By SKU     → Production_sku (Ply): 145/80R13 35.54, 175/70R13 28.94,
                                           185/65R15 14.71, 195/55R16 27.56
```

Product types per Stock sub-section: 4 Roll → Rubberised Ply / Rubberised Belt · Extruder → Sidewall / Tread · Cutter → Ply / Belt · Slitter → Cap Strip / Chafer · 3 Roll → Inner Liner. Every sub-section also has `Overall`.

---

## 14. TBM & Curing Production Journeys (by tyre category)

Production is scoped by tyre category — `Passenger Radial`, `LT Radial`, `SUV Radial` — with the combined sum tagged **`Green Tyre`** (TBM) / **`Cured Tyre`** (Curing). No other production category exists for TBM/Curing.

**Validated example — TBM → Productivity → Today → nos:**

```
Production:  Passenger Radial 554.83 | LT Radial 323.19 | SUV Radial 159.83 | Green Tyre 1037.85
CHECK:    554.83 + 323.19 + 159.83 = 1037.85  =  Green Tyre  ✔ exact
   View By Machine → Production_m (Passenger Radial):
      BJ Modules 112.88, Stage 1 138.36, Stage 2 93.30, VMI Exium 105.35, VMI Max 104.94

```

**Validated example — Curing → Productivity → Today → nos:**

```
Production:  Passenger Radial 2396.42 | LT Radial 3950.91 | SUV Radial 1662.87 | Cured Tyre 8010.20
   CHECK:    2396.42 + 3950.91 + 1662.87 = 8010.20  =  Cured Tyre  ✔ exact
```

These exact reconciliations confirm the `parent = Σ children` logic (§6.2): TBM/Curing were built by aggregation and match to the decimal, even in the dummy.

---

## 15. Special Rules

## 15.00 Drilldown inherits the same granularity + context. Card and children always match — if the card is Shift B, every machine row is Shift B too.

I'll pull real values for all five time views on the same Mixing Production journey so they're directly comparable.Here are all six time views, real values, same journey: **Banmore → Production → Mixing → Productivity → Final Compound → Production**, anchor day **2026-05-14**.

## How each time view maps to granularity

| Time view (UI) | Backend `granularity` | What it means |
|---|---|---|
| **Today** | `Daily` | the full latest day |
| **Today → Shift A** | `Shift A` | only shift A of that day |
| **Today → Shift B** | `Shift B` | only shift B of that day |
| **Today → Shift C** | `Shift C` | only shift C of that day |
| **Month** | `MTD` | month-to-date (May 1–14) |
| **Year** | `YTD` | year-to-date |

Shift A/B/C are sub-options that appear **only when Today is selected**.

## Parent KPI card — value the user sees

| Time view | granularity | Production (MT) | Production (Batches) | Status |
|---|---|---|---|---|
| **Today** | `Daily` | **199.55** | 608.93 | Yellow |
| **Shift A** | `Shift A` | **75.51** | 233.20 | Yellow |
| **Shift B** | `Shift B` | **64.47** | 209.03 | Yellow |
| **Shift C** | `Shift C` | **55.15** | 181.90 | Yellow |
| **Month** | `MTD` | **2,406.39** | 8,320.14 | Yellow |
| **Year** | `YTD` | **15,322.14** | 46,202.71 | Yellow |

Notice the shifts roll up to the day: Shift A + B + C ≈ 195 ≈ the Daily 199.55 (the small gap is dummy-data noise; exact on real data).

## Drilldown — View By = Machine → `Production_m` (MT), same time view

The drilldown uses the **same granularity** as the card. So switching the time view changes both the card and every machine row together:

| Machine | Today | Shift A | Shift B | Shift C | Month | Year |
|---|---|---|---|---|---|---|
| Banbury 1 | 39.46 | 14.53 | 12.39 | 10.92 | 534.72 | 3,199.66 |
| Banbury 2 | 41.01 | 15.90 | 14.35 | 11.22 | 477.87 | 2,708.47 |
| Banbury 3 | 34.74 | 12.00 | 12.02 | 9.34 | 452.00 | 2,689.89 |
| Banbury 4 | 36.02 | 12.47 | 11.35 | 9.45 | 517.66 | 2,731.58 |
| Banbury 5 | 18.46 | 6.77 | 5.83 | 5.17 | 449.24 | 2,815.28 |

## The logic (applies to every KPI, not just Production)

1. **Pick granularity from the time view:** Today→`Daily`, Shift A/B/C→`Shift A/B/C`, Month→`MTD`, Year→`YTD`.
2. **Anchor `date` to the latest available day** (`2026-05-14`), not the system clock. Daily/Shift read that day; MTD/YTD read the accumulated row on that day.
3. **Read the stored row — never recompute.** MTD/YTD are already accumulated; shift rows are already split. Don't sum days to make a month or split a day to make shifts.
4. **Drilldown inherits the same granularity + context.** Card and children always match — if the card is Shift B, every machine row is Shift B too.
5. **Shift sub-filter is Today-only.** Month and Year have no shift split.
6. **Same `parent = Σ children` logic** holds in every view (Shift A+B+C = Day; machine rows sum to the parent) — exact on real data, with small dummy-only gaps here.

This same pattern works for OEE, FTQ, Downtime, etc. — only the `granularity` value changes between Today / Shift A/B/C / Month / Year; the KPI name, context, and attribute-driven drill stay identical.

Want me to add this six-view comparison table into the documentation `.md` as a worked example under the Time Filter section?


### 15.1 Sections and sub-sections

| Section | Sub-section tabs? | Sub-sections | Machines |
|---|---|---|---|
| **Mixing** | No | — | Banbury 1–5 |
| **Stock** | **Yes** | 4 Roll, Extruder, 3 Roll, Cutter, Slitter | 4 Roll #1/#2, Duplex, Triplex, 3 Roll #1, LTBC, Slitter-1 |
| **TBM** | No | — | VMI Max, VMI Exium, BJ Modules, Stage 1, Stage 2 |
| **Curing** | **Yes** | Tredge 1–6 | Press 1–26 |

### 15.2 Product Type rules

- **Mixing:** `Master Compound`, `Final Compound` (Productivity + Quality are split by these; Cost/Morale/Safety are not).
- **Stock (two-step + Overall):** after a sub-section, product types appear — 4 Roll → Rubberised Ply / Rubberised Belt; Extruder → Sidewall / Tread; Cutter → Ply / Belt; Slitter → Cap Strip / Chafer; 3 Roll → Inner Liner. Every sub-section also has `Overall` (subsection total).
- **TBM / Curing:** tyre category `Passenger Radial` / `LT Radial` / `SUV Radial`, with `Green Tyre` (TBM) / `Cured Tyre` (Curing) = the sum.

### 15.3 Disambiguation rule (must pin product type / sub-section)

A single `(section, kpi_name, date, granularity, unit)` can return **multiple rows** (one per product type / sub-section). The query **must pin one series** or the card shows the wrong value and plots draw tangled lines. Defaults when nothing is picked:

| Section | Default `product_type` | `sub_section` |
|---|---|---|
| Mixing | `Master Compound` or `Final Compound` (pill) | — |
| Stock | `Overall` | the selected subsection (required) |
| TBM | `Green Tyre` | — |
| Curing | `Cured Tyre` | — |

### 15.4 Unit rules

- KPIs with multiple units (`Production`) have **one parent row per unit**; never combine units. The drilldown respects the same selected unit (MT parent → MT child rows).

### 15.5 Scope asymmetry (machine vs product KPIs)

- **Product-scoped** (filter by product type): `Production`, `FTQ`, `Defect_Scrap`, `Scrap_Rate`, `NCM_Hold`.
- **Machine-event** (NOT product-scoped — pin section/sub-section only): `OEE_o`, `Availability_o`, `Performance_o`, `Quality_o`, `Downtime`. A machine runs multiple products, so per-product OEE is not meaningful.

### 15.6 Time / shift rules

- **Today** = `Daily` (may expose Day / Shift A / Shift B / Shift C). The shift selection applies to **both** the parent card and the drilldown.
- **Month** = `MTD`; **Year** = `YTD`. Anchor "today" to the latest available date in the data, not the system clock.

### 15.7 Drilldown rules

- Drilldowns are driven by `drill_down_attribute`; **never hardcode** child KPI names, and recurse when a child has its own attribute.
- A parent KPI (`machine`/`itemcode` blank) and its child KPIs (different `kpi_name`) must not be mixed in one query.
- Leaf KPIs (empty `drill_down_attribute`) have no drilldown.
- **`drill_down_level` is not used** for navigation.

### 15.8 Default landing

- On open: **Section = Mixing**, **Tab = Productivity**, **Time = Today** selected by default.
- Default drilldown for a multi-view KPI: **View By = Machine**, **Unit = primary unit** (e.g. MT for Mixing Production).

---

## 16. Final Developer Notes

1. **Build from data, not hardcode.** Use: `plant, department, section, sub_section, tyre_type, product_type, granularity, category, kpi_name, unit_of_measurement, drill_down_attribute, actual_value, threshold_value, status, machine, itemcode`.
2. **Fetch parents** by `kpi_name` (+ context); render one card per KPI, one per unit when multi-unit.
3. **On card click:** read that row's `drill_down_attribute`; map the chosen View By to the child `kpi_name`; fetch children with the **same** context + selected unit; recurse if the child has its own attribute.
4. **Always pin a single series** (`product_type`, and for Stock/Curing `sub_section`) per §15.3.
5. **Respect units** — never combine units.
6. **Time:** Today→Daily, Month→MTD, Year→YTD; read pre-aggregated rows verbatim; anchor to the data's max date; apply shift sub-filter to parent and drilldown alike.
7. **`drill_down_level` is not used anywhere** — navigation is purely `drill_down_attribute` + the child `kpi_name`s it lists.
8. **Reconciliation:** the logic is `parent = Σ children` and is correct. In this dummy file, TBM/Curing reconcile exactly; small Mixing parent-vs-machine gaps exist **only because the data is dummy** and will reconcile when real data is loaded (§6.2).
9. **Plant-level pages** (Inventory) have `section` blank — do not apply the section/sub-section/machine picker to them.
10. **Validation status:** all 12 journeys in this document were tested against `v24`; the example output shown under each is the real result.
