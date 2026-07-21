# Change Spec — Time Filter, Drill-Down, Shift Comparison & % Spike

**Scope:** plant `BANMORE`, department `production`, sections `Mixing / TBM / Curing / Stock`.
**Validated against:** current gold data, `2026-07-01` → `2026-07-20`.
**Convention:** logic only — no code references. All names below are gold-layer **column values**.

---

## Change index

| # | Change | Owner | Severity |
|---|---|---|---|
| **Time filter & drill** ||||
| C1 | A single date must not override a date range | Backend + Frontend | 🔴 Blocker |
| C2 | A missing granularity must never mean "all" | Backend | 🔴 Blocker |
| C3 | Drill must inherit the card's exact scope | Backend + Frontend | 🔴 Blocker |
| C4 | Drill must pin `product_type` (2nd doubling cause) | Backend + Frontend | 🔴 Blocker |
| C5 | Range aggregation: SUM / AVERAGE / LATEST | Frontend (or Backend) | 🟠 High |
| C6 | Anchor the `date` per `kpi_name` | Backend | 🟠 High |
| C7 | TBM/Curing product-wise reads `Production_product` | Frontend + Backend | 🟠 High |
| C8 | Stock product list driven by data | Frontend | 🟠 High |
| C9 | Unit alias map (`Meters→M`, `NUM→NOS`) | Backend | 🟡 Medium |
| C10 | Row-cap truncation on wide ranges | Backend | 🟡 Medium |
| **Shift-wise comparison** ||||
| C11 | Shift box must respond to every time filter | Frontend + Backend | 🟠 High |
| C12 | Shift box must respect all dashboard filters | Frontend + Backend | 🟠 High |
| C13 | Shift C midnight attribution — verify & protect | ETL + Backend | 🟡 Medium |
| C14 | Missing shift shows blank, never zero (partial day) | Frontend | 🟠 High |
| **% spike indicator** ||||
| C15 | Define the comparison baseline per time filter | Backend + Frontend | 🟠 High |
| C16 | Baseline must use the identical pinned series | Backend | 🔴 Blocker |
| C17 | Baseline aggregation must match the KPI class | Backend | 🟠 High |
| C18 | Direction from an explicit table, not substring matching | Backend | 🟡 Medium |

---

## Column reference (gold layer, 23 columns)

`record_id`, `date`, `plant`, `department`, `section`, `sub_section`, `tyre_type`, `machine`, `product_type`, `itemcode`, `granularity`, `category`, `kpi_name`, `unit_of_measurement`, `production_ids`, `drill_down_attribute`, `drill_down_level`, `actual_value`, `previous_values`, `threshold_value`, `status`, `remarks`, `plot_data`

| Column | Role in this spec | Notes |
|---|---|---|
| `date` | the time axis | ISO `yyyy-mm-dd`. MONTH rows dated the 1st; YEAR rows would be dated Jan 1 |
| `granularity` | the zoom level **and** the shift | `DAY`, `MONTH`, `SHIFT A`, `SHIFT B`, `SHIFT C` (also `Real-time`, which sits under `department = Quality` and is excluded) |
| `kpi_name` | which KPI | matched **exactly** — never case-folded |
| `actual_value` | the number aggregated | sum / average / latest per C5 |
| `product_type` | product pin | C4, C7. Missing values are the literal string `"null"` |
| `sub_section` | sub-section pin | C3, C8. Missing values are the literal string `"null"` |
| `unit_of_measurement` | unit pin | C9. `(unset)` and `"null"` mean "no unit" |
| `machine` | machine pin (OEE press path, machine filter) | C3, C12 |
| `itemcode` | SKU dimension | drill levels only |
| `section`, `category`, `department`, `plant` | scope filters | inherited card → drill (C3) |
| `drill_down_attribute` | the child KPI list | drives navigation; may be single- or double-quoted, or the literal `"null"` (= leaf) |
| `drill_down_level` | landing-card identification only | **never** used for navigation |
| `remarks` | scrap/rework reason text | shown in reason drills |
| `status` | NCM Hold final status | detail column |
| `previous_values` | intended for period-over-period | **empty in all 389,512 rows** — the spike baseline must be derived (C15) |

> **Literal `"null"` sentinel:** missing values are stored as the **string** `"null"` — not SQL NULL, not `"nan"`. Every "is empty" test in this spec (`product_type` empty, `sub_section` empty, `drill_down_attribute` empty) must treat `"null"` as empty.

---

## Part 0 — The time-filter model (target behaviour)

Two **separate** controls. They must not share a code path.

| Control | `granularity` used | `date` used | Aggregation |
|---|---|---|---|
| Today / Daily | `DAY` | single date | none |
| Shift A / B / C | `SHIFT A` / `SHIFT B` / `SHIFT C` | single date | none |
| **Month button** | `MONTH` | the month snapshot, dated the **1st** | none — the row already holds the month total |
| **Year button** (behind the flag) | `YEAR` | the year snapshot, dated **Jan 1** | none — the row holds the annual total |
| **Custom range (from/to)** | **`DAY` — always** | every day in the window | **aggregate** per C5 |

**Rule 0.1 — a custom range always reads `DAY` rows.** MONTH and YEAR rows are single point-dated snapshots. The only July MONTH row is dated `2026-07-01`, so a range of 10–17 July matches **zero** MONTH rows and the card blanks. Never read a snapshot row for an arbitrary range.

**Rule 0.2 — exactly one `granularity` per query** (C2).

**Rule 0.3 — a card and its drill always share the same time scope** (C3).

**Rule 0.4 — `SHIFT A` + `SHIFT B` + `SHIFT C` = `DAY`.** Shift rows are the same production re-sliced, never additional output. `DAY` and `SHIFT *` must never be summed together.

---

# PART 1 — TIME FILTER & DRILL-DOWN

## C1 — a single date must not override a date range 🔴

### Current behaviour (defect)
The date predicate is an either/or in which the single date takes absolute priority:

```
if (a single date is present)   -> filter `date` = that date            // the range is NEVER applied
else                            -> filter `date` >= from AND `date` <= to
```

The frontend sends a leftover single date (= "today" = `2026-07-20`) **together with** the range. The range is silently discarded and every request is pinned to `2026-07-20`.

### Why it breaks the dashboard
`2026-07-20` is the last **Production** date. OEE ends 16–17 July, so OEE matches zero rows → **blank OEE card and dead OEE drill in every section** — and the date range appears to do nothing at all, because the result never changes no matter what is selected.

### Required behaviour
```
if (from is present OR to is present)   -> apply the range; IGNORE any single date
else if (a single date is present)      -> apply single-date equality
else                                    -> resolve that KPI's own latest date (C6)
```
* If both are supplied, the **range wins**. Alternatively reject with a validation error — but it must never fail silently.
* A partial range is valid: `from` only = open-ended forward; `to` only = open-ended backward.

### Pseudo-logic
```
FUNCTION resolveDatePredicate(request, kpiName, section):
    from = request.from
    to   = request.to
    date = request.date

    IF from IS PRESENT OR to IS PRESENT:
        IF from IS PRESENT AND to IS PRESENT AND from > to:
            REJECT "from must be <= to"
        IF from == to:
            RETURN { mode: SINGLE_DAY, date: from }        // no aggregation later
        RETURN { mode: RANGE, from: from, to: to }         // date is IGNORED entirely

    IF date IS PRESENT:
        RETURN { mode: SINGLE_DAY, date: date }

    // nothing supplied -> per-KPI anchor (C6)
    RETURN { mode: SINGLE_DAY, date: latestDateFor(kpiName, section) }


FUNCTION normalizeIncomingDate(value):
    IF value CONTAINS "T":  value = part before "T"      // strip ISO time component
    IF value MATCHES yyyy-mm-dd:  RETURN value
    IF value MATCHES dd-mm-yyyy:  RETURN reordered as yyyy-mm-dd
    REJECT "bad date format"
```

### Frontend obligation
When a range is active, **remove the single date from the payload**. Send a single date **or** a range, never both.

```jsonc
// WRONG (current) — the single date wins, the range is discarded
{ "date": "2026-07-20", "from": "2026-07-01", "to": "2026-07-16" }

// CORRECT — range only
{ "from": "2026-07-01", "to": "2026-07-16" }
```

### Edge cases
* `from == to` → single-day result, no aggregation.
* `from > to` → reject with a validation error.
* Range entirely outside the data span → return an empty "no data in range" state, not an error and not a silent blank.
* **Date format:** the `date` column is ISO `yyyy-mm-dd`; only `yyyy-mm-dd` and `dd-mm-yyyy` inputs are currently accepted. If the picker emits a full ISO timestamp (`2026-07-01T00:00:00.000Z`) or `mm/dd/yyyy`, the request fails with a bad-date-format error. Strip the time component before sending, or widen the accepted formats.

### How to verify
1. Apply a range and inspect the outgoing request — there must be **no single-date field** alongside `from`/`to`.
2. Curing Production 1–16 July must return **301,530**, and changing the range must change the number.
3. Curing OEE must render (see C6 for the date it should land on).

---

## C2 — a missing granularity must NEVER mean "all granularities" 🔴

### Current behaviour (defect)
When the incoming granularity value cannot be normalized, the `granularity` predicate is **skipped entirely** rather than defaulted. The value fails to normalize in three cases:

1. it is **empty / missing**
2. it is **`"all"`**
3. it is **Year / YTD while the Year feature flag is off**

In all three the query runs with **no `granularity` predicate** and returns rows where `granularity` is `DAY` **and** `SHIFT A/B/C` **and** `MONTH`, all together.

### Why it doubles
`SHIFT A` + `SHIFT B` + `SHIFT C` **exactly equals** `DAY` — the same production re-sliced, not additional output. `MONTH` is a third copy.

**Example — Curing Production, 2026-07-16, overall, `NOS`:**
```
DAY      22,300      <- the whole day
SHIFT A   7,702  ┐
SHIFT B   6,760  ├─ the SAME production re-sliced (7,702 + 6,760 + 7,838 = 22,300)
SHIFT C   7,838  ┘
MONTH   (dated 2026-07-01, holds the whole-month total)

Pin DAY              -> 22,300    CORRECT
No granularity pin   -> 44,600    exactly 2x
```

**Over the range 1–16 July, Curing Production, overall, `NOS`:**

| Scenario | Value | × correct |
|---|---:|---:|
| DAY only (correct) | **301,530** | 1.00× |
| DAY + SHIFT | 603,060 | 2.00× |
| DAY + SHIFT + MONTH | 967,407 | 3.21× |

### Required behaviour
* An empty / missing / unrecognized granularity → **default to `DAY`** (recommended) **or** reject with a clear error.
* `"all"` must **not** be accepted as a value meaning "no filter". If an "all periods" concept is ever needed it must be an explicit aggregation, never an absent predicate.
* Year/YTD while the flag is off → return **no data** (or fall back to `DAY`). A disabled feature must never return *wrong* data.
* Log a warning whenever the granularity had to be defaulted, so the situation is visible rather than silent.

### Pseudo-logic
```
CONSTANT DEFAULT_GRANULARITY = "DAY"

FUNCTION resolveGranularity(rawValue, isRangeMode):
    // a custom date range ALWAYS reads DAY rows (Rule 0.1)
    IF isRangeMode:
        RETURN "DAY"

    g = trim(rawValue)

    IF g IS EMPTY OR lower(g) == "all":
        LOG WARNING "granularity missing -> defaulting to DAY"
        RETURN DEFAULT_GRANULARITY                  // NEVER return "no filter"

    IF lower(g) IN ("year", "ytd", "yearly"):
        IF ENABLE_YEAR is ON:  RETURN "YEAR"
        LOG WARNING "Year disabled"
        RETURN NO_DATA                              // return empty, NOT all granularities

    mapped = GRANULARITY_SYNONYMS[lower(g)]         // today/daily->DAY, month->MONTH, shift a->SHIFT A ...
    IF mapped IS NULL:
        LOG WARNING "unrecognized granularity -> defaulting to DAY"
        RETURN DEFAULT_GRANULARITY

    RETURN mapped


// the predicate is ALWAYS added - there is no path that omits it
FUNCTION applyGranularityPredicate(query, resolved):
    IF resolved == NO_DATA:  RETURN empty result set
    query.where( granularity == resolved )
```

### Rule to enforce everywhere
> **Every query that reads `actual_value` must pin exactly ONE `granularity`.** Never `DAY` + `SHIFT *`, never `DAY` + `MONTH`. One zoom level, always.

### How to verify
Issue the same request three ways — granularity omitted, granularity `"all"`, granularity `"Year"` with the flag off. All three must return DAY-scoped values (or a clean error), never a doubled figure.

---

## C3 — the drill must inherit the card's EXACT scope, and aggregate identically 🔴

### Current behaviour (defect)
The drill query does not carry forward all of the card's pins, so it matches overlapping rows and the total inflates relative to the card above it.

### Required behaviour
The drill inherits **every** one of these from the card, unchanged:

| Inherited column | Note |
|---|---|
| `section` | same as the card |
| `category` | same (e.g. `Quality` for Scrap/Rework) |
| **`granularity`** | **`DAY`** when a custom range is active |
| `date`, or `from` + `to` | the identical window |
| `product_type` | see C4 |
| `sub_section` | only where the child level actually carries it |
| `unit_of_measurement` | never mix units |
| `plant`, `department` | forced scope, unchanged |

**The only column that changes is `kpi_name`** — swapped to a child taken from the parent's `drill_down_attribute`.

**The drill must also aggregate over the range exactly as the card does** (C5): sum additive KPIs day-wise, average rate KPIs day-wise. A range card showing a 16-day total must never sit above a drill showing a single day's value, and a rate must never be summed at either level.

**Example — Curing Production, range 1–16 July, overall, `NOS`:**
```
CARD  (Production,   granularity=DAY, product=overall, unit=NOS)  = 301,530   CORRECT
DRILL (Production_s, SAME pins, summed day-wise)                  = 301,530   MUST MATCH
        -> Trench1, Trench2, Trench4 .. Trench8 (no Trench3) sum to 301,530

If the drill drops the granularity pin:
        DAY + SHIFT            = 603,060   (2.00x)
        DAY + SHIFT + MONTH    = 967,407   (3.21x)
```

### Pseudo-logic
```
FUNCTION buildDrillRequest(cardScope, clickedChildKpi, clickedDimensionValue):
    drill = COPY OF cardScope          // inherit EVERYTHING first

    // the ONLY column that changes:
    drill.kpi_name = clickedChildKpi

    // these are inherited unchanged and must NOT be dropped:
    //   section, category, plant, department,
    //   granularity, date / from+to,
    //   product_type, sub_section, unit_of_measurement

    // pass a dimension down ONLY where the child actually carries it:
    IF clickedChildKpi IS an OEE machine-path KPI          // Availability_m / Performance_m /
                                                            // Quality_m / loss reasons
        AND clickedDimensionValue IS a machine:
        drill.machine = clickedDimensionValue

    IF section == "Stock" AND clickedChildKpi == "OEE_m":
        drill.sub_section = cardScope.sub_section          // Stock OEE_m carries sub_section

    IF clickedChildKpi carries sub_section IS FALSE:       // e.g. Curing OEE_m
        drill.sub_section = NOT SET

    RETURN drill


FUNCTION renderDrill(drill):
    rows = fetch(drill)
    // aggregate EXACTLY as the card does (C5)
    RETURN aggregateForRange(rows, drill.kpi_name, drill.mode)
```

### Edge cases
* Where a child level does **not** carry a dimension, do not pass it. Curing `OEE_m` rows have `sub_section = "null"`, so passing `sub_section` returns nothing.
* **Stock OEE is the exception** — Stock `OEE_m` rows carry **both** `sub_section` and `machine`, so the sub-section → machine nesting is valid there.
* The OEE press path (`OEE_m` → `Availability_m` / `Performance_m` / `Quality_m` → loss reasons) passes `machine` down; that is expected and correct.

### How to verify
For each section: open a card with a date range, note the value, drill one level, and confirm the child rows sum (or average) back to exactly the card value.

---

## C4 — the drill must pin `product_type` (second doubling cause) 🔴

Applies to `Production_m`, `Production_sku`, `Production_m_sku`, `Production_product` in **Curing** and **TBM**.

### Current behaviour (defect)
Even with `granularity` correctly pinned, the drill still doubles — because these child levels contain **both the aggregate row and its per-product children**.

**Example — Curing `Production_m`, 2026-07-16:**
```
Cured Tyre        22,300   <- the aggregate (equals the parent card)
Passenger Radial  14,785  ┐
LCV                3,869  ├─ the SAME production split by product (= 22,300)
Unknown            3,646  ┘
--------------------------------------------------
ALL rows summed = 44,600   = exactly 2x the parent
```

### Required behaviour
When reading any drill level, pin `product_type` to **either** the aggregate **or** one child — **never both, and never unpinned**.

```
kpi_name = 'Production_m', granularity = 'DAY', date = '2026-07-16':
  + product_type = 'Cured Tyre'         -> 22,300   CORRECT (overall view)
  + product_type = 'Passenger Radial'   -> 14,785   CORRECT (per-product view)
  + product_type NOT pinned             -> 44,600   WRONG (2x)
```

**Aggregate `product_type` values:** `Cured Tyre` (Curing), `Green Tyre` (TBM). Never add the aggregate row to its children — the aggregate already equals their sum.

### Pseudo-logic
```
CONSTANT AGGREGATE_PRODUCT = { "Curing": "Cured Tyre", "TBM": "Green Tyre" }

FUNCTION resolveProductPin(section, kpiName, selectedProduct):
    // only these child levels carry BOTH the aggregate and its children
    productSplitKpis = ["Production_m", "Production_sku", "Production_m_sku",
                        "Production_product"]

    IF kpiName NOT IN productSplitKpis:
        RETURN selectedProduct                     // unchanged

    IF selectedProduct IS EMPTY OR selectedProduct == "Overall":
        RETURN AGGREGATE_PRODUCT[section]          // e.g. 'Cured Tyre'

    RETURN selectedProduct                         // e.g. 'Passenger Radial'

    // NEVER return "no pin" for these KPIs - unpinned sums aggregate + children = 2x
```

### How to verify
Curing, 16 July, drill by machine: the overall view must read **22,300** (not 44,600); switching to Passenger Radial must read **14,785**.

---

## C5 — range aggregation rules: SUM / AVERAGE / LATEST 🟠

Applies to **cards, drills and the shift box alike**.

### Classification — every KPI must be tagged

**SUM (additive / flow):** add `actual_value` over the pinned daily rows in the range.
* `Production`, `Production_product`, `Production_s`, `Production_m`, `Production_sku`, `Production_m_sku`
* `Scrap`, `Scrap_s`, `Scrap_reason`, `Scrap_m`, `Scrap_sku`, `Scrap_m_sku`
* `Rework` and all `Rework_*` levels
* `NCM_Hold` quantity, `NCM_Hold_sku`
* OEE loss-reason **durations** (minutes): `Breakdown`, `No Schedule`, `Power Failure`, `Preventive Maintenance`, `Setup & Change`, `Operations/Material/Manpower`

**AVERAGE (rate / ratio):** simple mean of `actual_value` over the daily rows.
* `OEE_o`, `OEE_s`, `OEE_m`, `OEE_p`
* `Availability_o`, `Availability_s`, `Availability_m`
* `Performance_o`, `Performance_s`, `Performance_m`
* `Quality_o`, `Quality_s`, `Quality_m`
* `FTQ`, `Plan_Compliance`

Average **only over dates that actually have a row**. Missing dates are skipped — **never counted as 0**, which would drag the average down.

**LATEST-IN-RANGE (stock level — neither sum nor average):**
* `Inventory`, `Inventory_item` — a balance, not a flow. Show the most recent in-range day's value.

**Single date (`from == to`):** return that day's value directly, no aggregation, for every class.

### Worked examples — range 1–16 July, Curing
```
Production (SUM)      : 16 daily rows summed              = 301,530      CORRECT
OEE_o      (AVERAGE)  : mean of 16 daily values           = 82.45 %      CORRECT
             if summed instead                            = 1,319.21 %   WRONG
             if only the latest day is shown              = 83.77 %      WRONG (ignores the range)
Inventory  (LATEST)   : most recent in-range balance                     (never summed)
Single date 3 Jul -> 3 Jul : that day's DAY row, no aggregation
```

### Pseudo-logic
```
CONSTANT RATE_KPIS = [ "OEE_o","OEE_s","OEE_m","OEE_p",
                       "Availability_o","Availability_s","Availability_m",
                       "Performance_o","Performance_s","Performance_m",
                       "Quality_o","Quality_s","Quality_m",
                       "FTQ","Plan_Compliance" ]

CONSTANT LEVEL_KPIS = [ "Inventory", "Inventory_item" ]
// everything else (Production*, Scrap*, Rework*, NCM_Hold*, loss-reason minutes) is ADDITIVE


FUNCTION classify(kpiName):
    IF kpiName IN RATE_KPIS:   RETURN AVERAGE
    IF kpiName IN LEVEL_KPIS:  RETURN LATEST
    RETURN SUM


FUNCTION aggregateForRange(rows, kpiName, mode):
    IF mode == SINGLE_DAY:
        RETURN rows[0].actual_value                 // exactly one pinned row, no maths

    // rows MUST already be: granularity='DAY' + one pinned series (see guardrails below)
    values = [ r.actual_value FOR r IN rows WHERE r.actual_value IS NOT EMPTY ]
    IF values IS EMPTY: RETURN NULL                 // show "no data in range"

    SWITCH classify(kpiName):
        CASE SUM:      RETURN sum(values)
        CASE AVERAGE:  RETURN sum(values) / count(values)   // skip missing days, never treat as 0
        CASE LATEST:   RETURN value of the row with MAX(date)
```

### Anti-double-count guardrails (apply before aggregating)
1. Filter to **`granularity = 'DAY'` only**.
2. Aggregate **one pinned series**: one `product_type`, one `sub_section`, one `unit_of_measurement`.
3. **Curing / TBM:** aggregate the overall rows (`product_type` empty) **or** the per-product rows — never both.
4. **Mixing:** aggregate the selected compound only (`product_type` = `Master Compound` **or** `Final Compound`), never both.
5. **Stock:** aggregate one `sub_section` + `product_type` + `unit_of_measurement` series.
6. Treat the literal string `"null"` in `product_type` / `sub_section` as **empty** when selecting "overall" rows.

---

## C6 — anchor the `date` per `kpi_name`, not one global "latest" 🟠

### Current behaviour (defect)
The main dashboard fetch performs **no latest-date resolution** — it filters on whatever date the caller supplies. The frontend therefore computes **one** global latest date (`2026-07-20`, which comes from Production) and applies it to every card.

### Why it breaks OEE
KPIs land on different days:

| Section | Production | **OEE_o** | Scrap | NCM_Hold |
|---|---|---|---|---|
| Mixing | 2026-07-20 | **2026-07-17** | — | 2026-07-20 |
| Curing | 2026-07-20 | **2026-07-16** | 2026-07-20 | 2026-07-20 |
| Stock | 2026-07-20 | **2026-07-17** | — | 2026-07-20 |
| TBM | 2026-07-20 | **2026-07-17** | — | — |

```
Global latest = 2026-07-20 (comes from Production)
  Curing OEE_o on 2026-07-20 -> 0 rows -> BLANK card, dead drill     WRONG
  Curing OEE_o on 2026-07-16 -> 83.77 %  (its own latest)            CORRECT
  Mixing / Stock / TBM OEE_o -> 2026-07-17
```

### Required behaviour
* When no explicit date or range is supplied, resolve the latest `date` **per `kpi_name`** — each card uses the newest `date` **that KPI** has, within its `section`.
* The drill inherits the **card's resolved date**, so card and drill always land on the same day.
* Display an **"as of &lt;date&gt;"** label wherever a KPI lags.
* The lag differs by section: Curing OEE is one day further behind than the others.

### Pseudo-logic
```
FUNCTION latestDateFor(kpiName, section):
    // resolve the newest date THIS kpi has, within THIS section
    // (equivalent to: partition rows by kpi_name, order by date desc, take the first)
    RETURN MAX(date) OF rows WHERE
             plant = 'BANMORE'
         AND department = 'production'
         AND section = section
         AND kpi_name = kpiName
         AND granularity = 'DAY'


FUNCTION resolveCardDate(request, kpiName, section):
    IF request has an explicit date or range:
        RETURN that                                  // user intent wins (C1)
    anchor = latestDateFor(kpiName, section)
    RETURN { mode: SINGLE_DAY, date: anchor, asOfLabel: anchor }


// the drill reuses the CARD's already-resolved date - it never re-resolves its own
drillScope.date = cardScope.resolvedDate
```

### Interaction with C1
Per-KPI anchoring applies to the **default** view only. When the user supplies an explicit range, honour the range — and if a KPI has no rows within it, show an empty state (which is correct), not a silent blank.

---

## C7 — TBM & Curing product-wise Production must read `Production_product` 🟠

### Current behaviour (defect)
Rows with `kpi_name = 'Production'` in TBM and Curing contain **only the overall row** — `product_type` is the literal string `"null"`. Selecting a product matches **zero rows**, and the `product_type` predicate's empty/agnostic fallback then returns the **overall** row — so every product selection displays the same number and the filter appears to do nothing.

### Required behaviour
For **TBM and Curing**, the product-wise view reads **`Production_product`**:

| User selects | `kpi_name` to read | Pin `product_type` |
|---|---|---|
| Overall | `Production_product` | `Green Tyre` (TBM) / `Cured Tyre` (Curing) |
| Passenger Radial | `Production_product` | `Passenger Radial` |
| LCV | `Production_product` | `LCV` |
| Unknown | `Production_product` | `Unknown` |

**Example — 2026-07-16, DAY. These values must CHANGE as the product changes:**

| Product | TBM | Curing |
|---|---:|---:|
| Overall (`Green Tyre` / `Cured Tyre`) | 23,947 | 22,300 |
| Passenger Radial | 16,084 | 14,785 |
| LCV | 4,005 | 3,869 |
| Unknown | 3,858 | 3,646 |

*(Passenger + LCV + Unknown = the overall — never add the overall to its children.)*
Today the card shows the overall figure for **every** selection; that is the bug.

### Pseudo-logic
```
FUNCTION resolveProductionKpi(section, isProductWiseView, selectedProduct):
    IF section IN ("TBM", "Curing"):
        IF isProductWiseView OR selectedProduct IS NOT EMPTY:
            RETURN {
              kpi_name:     "Production_product",
              product_type: selectedProduct OR AGGREGATE_PRODUCT[section]
            }
        // plain overall card
        RETURN { kpi_name: "Production", product_type: EMPTY }   // "null" sentinel row

    IF section == "Mixing":
        RETURN { kpi_name: "Production",
                 product_type: selectedCompound,                 // Master / Final - REQUIRED
                 unit_of_measurement: selectedUnit }             // KG / Batch - REQUIRED

    IF section == "Stock":
        RETURN { kpi_name: "Production",
                 sub_section: selectedSubSection,                // REQUIRED
                 product_type: selectedProduct,                  // REQUIRED
                 unit_of_measurement: selectedUnit }             // REQUIRED
```

### Additional benefits
* The overall value is identical via either KPI, so `Production_product` can serve **all** product selections in these two sections.
* **TBM `Production` carries 4 identical duplicate rows** (8,339 × 4 = 33,356 if summed). `Production_product` has exactly one row per product, so this change also removes that over-count from the product-wise view.
* ⚠️ **Still required (ETL):** de-duplicate TBM `Production`, because the main Production card and the trend views still read it.

### Mixing / Stock
They have **no** `Production_product` rows — the product dimension already sits on the `kpi_name = 'Production'` rows (Mixing `product_type` = Master/Final Compound; Stock `product_type` = Belt/Ply/etc.), so pin `product_type` on `Production` there. Do **not** attempt a `Production_product` level for these sections; follow `drill_down_attribute`.

---

## C8 — Stock product list must be data-driven per sub-section 🟠

### Current behaviour (defect)
The product list appears to be hardcoded or shared across all Stock sub-sections. Each sub-section makes **different products with different names**, so a fixed list matches nothing for some sub-sections and the card blanks.

### Required behaviour
* When a Stock sub-section is selected, **read the distinct `product_type` values present in the data for that `sub_section`** and pin one of those values.
* Do **not** assume a shared product list across sub-sections.
* Do **not** alias `Belt Mother Roll` → `Belt`; these are genuinely different products (a mother roll is a distinct intermediate form). Keep them separate.
* Stock has **no overall/total Production row** — always pin `sub_section` + `product_type` + `unit_of_measurement`.

**Example — real Stock products per sub-section (2026-07-16, DAY). Every sub-section differs:**
```
4 Roll    -> Belt Mother Roll (M) 16,154 | Ply Mother Roll (M) 12,651
Cutter    -> Belt (M) 97,510             | Ply (M) 59,483
Extruder  -> Sidewall (M) 26,475 / (NOS) 5,750 | Tread (M) 1,120 / (NOS) 29,430
Slitter   -> Cap Strip (M) 402,942
3 Roll    -> Inner Liner (KG) 773 / (M) 28,957
Bead      -> Bead Bundle (KG) 3,273 / (NOS) 32,258 | Bead Apex (NOS) 23,928
```
Pinning `Belt` for **4 Roll** returns 0 rows → blank card, because 4 Roll makes `Belt Mother Roll`.
**Extruder, 3 Roll and Bead are multi-unit** — `unit_of_measurement` must be pinned as well as the product.

### Pseudo-logic
```
FUNCTION getStockProductOptions(subSection, date):
    rows = fetch WHERE section='Stock'
                   AND kpi_name='Production'
                   AND sub_section = canonicalize(subSection)    // '3 Roll' <-> 'Three Roll'
                   AND granularity='DAY'
                   AND date = date

    // build the option list FROM THE DATA - never a hardcoded list
    options = DISTINCT (rows.product_type, rows.unit_of_measurement)
    RETURN options            // e.g. 4 Roll -> [(Belt Mother Roll, M), (Ply Mother Roll, M)]


FUNCTION buildStockCard(subSection, selectedProduct, selectedUnit, date):
    IF selectedProduct NOT IN getStockProductOptions(subSection, date):
        selectedProduct = first option        // fall back to a REAL product, never 'Belt' blindly
    RETURN { section:'Stock', kpi_name:'Production',
             sub_section: canonicalize(subSection),
             product_type: selectedProduct,
             unit_of_measurement: selectedUnit }
```

### Related data issues to log
* 4 Roll has a `Ply Mother Roll` row whose `unit_of_measurement` is the literal `"null"` (8,974) — unit missing in the source.
* `kpi_name = 'OEE_s'` is still missing for `sub_section` **Cutter** and **Slitter** (present for `3 Roll`, `4 Roll`, `Bead`, `Extruder`), so their OEE cards stay blank until the ETL produces those rollups.
* `sub_section` naming: keep `3 Roll` / `Three Roll` canonicalized on **both** the filter value and the row value.

---

## C9 — unit alias map 🟡

### Current behaviour (defect)
`unit_of_measurement` normalization only trims and upper-cases, so duplicate spellings never merge:
```
'Meters' -> 'METERS'   (never matches 'M')
'NUM'    -> 'NUM'      (never matches 'NOS')
```

### Required behaviour
Apply an alias map to **both** the incoming filter value and the stored `unit_of_measurement` value:
```
Meters   -> M
NUM      -> NOS
(unset)  -> blank / no unit        (already handled — keep)
"null"   -> blank / no unit        (sentinel — keep treating as empty)
```

**Example — Stock `kpi_name = 'NCM_Hold'` today, by `unit_of_measurement`:**
```
M        76 rows   78,034.99   ┐ same unit, must merge -> M
Meters  114 rows   43,405.77   ┘
NOS       3 rows      300.00   ┐ same unit, must merge -> NOS
NUM      53 rows   29,251.51   ┘
(unset) 309 rows              -> render blank, never the literal "(unset)"
```

### Pseudo-logic
```
CONSTANT UNIT_ALIASES = { "METERS": "M", "NUM": "NOS" }
CONSTANT EMPTY_UNITS  = [ "(unset)", "null", "nan", "" ]

FUNCTION canonicalUnit(raw):
    IF raw IS NULL: RETURN NULL
    u = trim(raw)
    IF lower(u) IN EMPTY_UNITS: RETURN NULL          // render as blank, never "(unset)"
    u = upper(u)
    IF u IN UNIT_ALIASES: RETURN UNIT_ALIASES[u]     // Meters -> M, NUM -> NOS
    RETURN u

// apply to BOTH sides so the filter matches the rows
queryUnit = canonicalUnit(request.unit_of_measurement)
rowUnit   = canonicalUnit(row.unit_of_measurement)
match     = (queryUnit == rowUnit)

// display: group by canonicalUnit so 'M' and 'Meters' collapse into ONE total
```

### Do NOT merge genuinely different units
`KG` and `Batch` (Mixing) are **distinct measures of the same production** — they must remain a toggle and must never be summed or averaged together.

**Example — Mixing Final Compound, 2026-07-16:**
```
Final Compound  Batch      463.00
Final Compound  KG      97,098.36
```
Without a unit pin the card returns **both** rows → blank, an arbitrary value, or a nonsensical sum.

**Frontend obligation:** Mixing Production is now multi-unit, so the card **must** send `unit_of_measurement` (with a KG / Batch toggle) — for the card **and** its drill. It previously worked without one only because KG was the sole unit.

---

## C10 — row-cap truncation silently drops days from wide ranges 🟡

### Current behaviour (defect)
Results are capped at a fixed row limit, ordered by `date` newest-first. Ordering newest-first is correct in principle, but a wide range blows past the cap and the **oldest days are silently dropped**:

```
Curing, DAY, 1–17 July, all KPIs  = 55,385 rows
Cap keeps the newest 5,000        -> only 2026-07-16 and 07-17 survive
DROPPED                           -> 1 July through 15 July (15 of 17 days)
```

The response looks successful; the range total is simply far too low, with no error.
*(With the landing-level filter applied it is only ~171 rows, so this bites mainly on drills and unfiltered fetches.)*

### Required behaviour
* Aggregate server-side for ranges (return one row per day per pinned series) **or** paginate, so the cap is never silently reached.
* When the cap **is** reached, return a truncation flag (or an error) so the UI never presents a partial total as if it were complete.
* Keep the `date` newest-first ordering so paging stays deterministic.

### Pseudo-logic
```
FUNCTION fetchRange(scope):
    // preferred: collapse server-side so the cap is never reached
    rows = fetch(scope) GROUPED BY date          // one row per day per pinned series
    RETURN rows

// if raw rows must still be returned:
FUNCTION fetchWithCap(scope, cap):
    rows = fetch(scope) ORDER BY date DESC LIMIT cap + 1
    truncated = (count(rows) > cap)
    IF truncated:
        rows = first cap rows
        RETURN { rows: rows, truncated: TRUE }    // UI must NOT show a partial total as complete
    RETURN { rows: rows, truncated: FALSE }
```

---

# PART 2 — SHIFT-WISE COMPARISON

## Shift storage (essential context)

Shifts are **not** a separate column — they are values of the `granularity` column:

```
granularity = 'DAY'      -> the whole day
granularity = 'SHIFT A'  -> that day, 07:00–14:59
granularity = 'SHIFT B'  -> that day, 15:00–22:59
granularity = 'SHIFT C'  -> that day, 23:00–06:59  (crosses midnight)
granularity = 'MONTH'    -> whole month, dated the 1st
```

**Three facts that drive every rule below:**

1. **Shift rows exist at DAY level only.** There is **no** "MONTH + shift" row. Month-wise shift totals must be **summed from the daily shift rows**.
2. **`SHIFT A` + `SHIFT B` + `SHIFT C` = `DAY`** exactly, verified on every date.
3. **`DAY` and `SHIFT *` must never be summed together** — that is the 2× bug in C2.

**Verified reconciliation (Curing, overall, `NOS`):**
```
2026-07-16  DAY 22,300 = A 7,702 + B 6,760 + C 7,838   OK
2026-07-17  DAY 20,379 = A 6,577 + B 6,771 + C 7,031   OK
2026-07-18  DAY 16,338 = A 5,279 + B 5,257 + C 5,802   OK
2026-07-19  DAY 19,205 = A 6,368 + B 6,806 + C 6,031   OK
Whole July  MONTH 364,347 = A 121,142 + B 117,961 + C 125,244   OK
```

---

## C11 — the shift box must respond to every time filter 🟠

| Time filter | What each shift cell shows | How it is obtained |
|---|---|---|
| **Today** | today's production per shift | read the three `SHIFT A/B/C` rows for today's `date` |
| **Day-wise (selected day)** | that day's production per shift | read the three `SHIFT A/B/C` rows for the selected `date` |
| **Month-wise** | the whole month's production per shift | **sum** each shift's daily rows across every `date` in that month |
| **Custom date range** | the range total per shift | **sum** each shift's daily rows across every `date` in the range |

**Key rule:** for Month-wise and Custom-range, do **not** look for a MONTH-granularity shift row — it does not exist. Sum the daily `SHIFT A/B/C` rows.

### Pseudo-logic
```
FUNCTION shiftComparison(scope, timeFilter):
    // scope carries the dashboard filters: section, sub_section, machine,
    // product_type, unit_of_measurement, category
    result = {}

    FOR shift IN ["SHIFT A", "SHIFT B", "SHIFT C"]:
        q = scope COPY
        q.kpi_name    = productionKpiFor(scope.section, scope.product_type)   // see C12
        q.granularity = shift                       // shift IS the granularity value

        SWITCH timeFilter.mode:
            CASE TODAY:
            CASE SINGLE_DAY:
                q.date = timeFilter.date
                rows   = fetch(q)
                result[shift] = rows[0].actual_value       // exactly one pinned row

            CASE MONTH:
                q.from = first day of selected month
                q.to   = last day of selected month
                rows   = fetch(q)
                result[shift] = SUM(rows.actual_value)     // sum daily shift rows

            CASE RANGE:
                q.from = timeFilter.from
                q.to   = timeFilter.to
                rows   = fetch(q)
                result[shift] = SUM(rows.actual_value)

    // integrity check - must always hold
    ASSERT result[A] + result[B] + result[C] == dayOrRangeTotal(scope, timeFilter)
    RETURN result
```

---

## C12 — the shift box must respect ALL dashboard filters 🟠

Every shift query inherits the current dashboard scope, unchanged:

| Column | Rule |
|---|---|
| `section` | as selected |
| `sub_section` | as selected (required for Stock) |
| `machine` | as selected, when a machine filter is active |
| `product_type` | as selected — see the per-section rule below |
| `unit_of_measurement` | **must** be pinned (Mixing is now `KG` **and** `Batch`) |
| `category` | `Productivity` for Production |

**Per-section `kpi_name` + product pin (identical to the Production card, C7):**

| Section | `kpi_name` | Pins required |
|---|---|---|
| **Curing / TBM** — overall | `Production` | `product_type` empty (the literal `"null"`), `unit_of_measurement = NOS` |
| **Curing / TBM** — a product selected | **`Production_product`** | `product_type` = `Passenger Radial` / `LCV` / `Unknown` (or the aggregate `Cured Tyre` / `Green Tyre`) |
| **Mixing** | `Production` | `product_type` = `Master Compound` **or** `Final Compound`; `unit_of_measurement` = `KG` **or** `Batch` |
| **Stock** | `Production` | `sub_section` + `product_type` + `unit_of_measurement` (no overall row exists) |

> **Why `Production_product` for Curing/TBM:** the `Production` KPI has only the overall row, so selecting a product matches nothing and silently falls back to the overall — every product would show the same number.

---

## C13 — Shift C crosses midnight: verify and protect date attribution 🟡

`SHIFT C` covers **23:00 → 06:59**, so it spans two calendar dates. Whichever `date` the ETL assigns those early-morning hours to determines whether the totals reconcile.

**Current evidence: attribution is correct.** `A + B + C = DAY` holds on every verified date, which would fail if Shift C hours were split across two dates or double-counted.

**Rules to preserve:**
* A Shift C occurrence must be attributed to **exactly one** `date`, consistently (the production-day convention).
* At range boundaries the same convention must apply — a range of 1–16 July must include the Shift C that begins on the 16th and must not double-count the one beginning on the 30th of the prior month.
* **Regression test:** for every `date` in the range, assert `SHIFT A + SHIFT B + SHIFT C = DAY`. Any drift signals a shift-window or date-attribution change.

---

## C14 — missing shift shows blank, never zero (partial-day rule) 🟠

**`SHIFT B` is present in the data** on 1–19 July (788 rows). It is absent only on **2026-07-20**, which is a **partial, in-progress day**:

```
2026-07-18  DAY 16,338      full day
2026-07-19  DAY 19,205      full day
2026-07-20  DAY  6,895      PARTIAL - day still running
              SHIFT A 1,570 | SHIFT B (no row) | SHIFT C 5,325
```

**Required behaviour:**
* A shift with **no row** → display **blank / "—"**, never `0`. Zero means "ran and produced nothing"; blank means "no data yet".
* Mark the latest day as **partial / in-progress** where the shifts are incomplete, so users do not read it as a real drop.
* Never fabricate a `0` to make `A + B + C` reconcile.

---

# PART 3 — % SPIKE INDICATOR

## Current logic and its defects

**Current calculation:**
```
previous = the SECOND row returned in the group (rows ordered by date, newest first)
spike %  = (current − previous) / |previous| × 100
arrow    = green if the movement is favourable, red otherwise
```

| # | Defect | Consequence |
|---|---|---|
| S-1 | "Previous" = *the next row in the result set*, not a **defined previous period** | If rows are grouped only by `kpi_name`, "previous" can be a **different series** (e.g. Master Compound vs Final Compound) — a meaningless % |
| S-2 | No range-over-range definition | For a custom range it silently becomes **day-over-day** (the last two days inside the range) |
| S-3 | Partial current period not handled | Today (07-20, in progress) vs a full 07-19 gives **−75.3 %** for Shift A — alarming but meaningless |
| S-4 | `previous_values` column is **empty in all 389,512 rows** | It cannot be used; the baseline must be derived from the prior period's rows |
| S-5 | Higher/lower-is-better decided by **substring match** on `kpi_name` | Fragile: any future KPI whose name contains `scrap`, `hold`, `loss` or `ncm` flips its arrow |
| S-6 | Rate KPIs over a range | If the range value is a mean, the baseline must also be a mean of the previous window — not a sum |

---

## C15 — define the comparison baseline per time filter 🟠

| Current view | Baseline (previous period) |
|---|---|
| **Today** | the same **elapsed** window yesterday; completed shifts only |
| **Day-wise (date D)** | **D − 1 day**, same shift, same pins |
| **Shift A/B/C on date D** | the **same shift** on **D − 1** — never a different shift |
| **Month-wise (month M)** | the **previous complete calendar month**, same shift |
| **Custom range (F → T)** | the immediately preceding window of **equal length**: `(F − N) → (F − 1)`, where `N = T − F + 1` days |

### Answers to the five questions

**Q1 — Day-wise baseline?**
**Should be:** the immediately preceding day, same shift, same pinned series.
**Currently:** the second-newest row returned — which *happens* to be the previous day **only if** the query is correctly pinned to one series and one granularity.
**Verified example (Curing, overall, `NOS`):** 19 July vs 18 July → Shift A `6,368 vs 5,279 = +20.6 %`, Shift B `6,806 vs 5,257 = +29.5 %`, Shift C `6,031 vs 5,802 = +3.9 %`.

**Q2 — Month-wise: previous complete month?**
**Should be:** yes — the previous complete calendar month, same shift, same pins.
**Currently:** ❌ not implemented as such. The July data contains only **one** MONTH row per series, so no baseline exists and the spike is null. There is no June MONTH row in this dataset.
**Required:** explicitly select the previous month's rows. If absent, show **no spike** (not `0 %`, not `∞`).

**Q3 — Today: full yesterday, or the same elapsed window?**
**Should be:** the **same elapsed period yesterday** (like-for-like), because today is incomplete.
**Currently:** ❌ compares partial-today against full-yesterday. 07-20 Shift A reads `1,570` vs `6,368` → **−75.3 %**, an artefact of the day being in progress. Shift B has **no row at all**, so a naive calculation yields −100 % or a divide error.
**Required:** compare **completed shifts only**; a shift that has not yet run shows **no spike**, not −100 %. Where the current shift is mid-run, suppress the % or compare against the same elapsed window of the prior day and label it.

**Q4 — Custom range baseline?**
**Should be:** the immediately preceding window of equal length, ending the day before the range starts.
**Currently:** ❌ becomes day-over-day inside the range.
**Example:** 1–16 July (16 days) → baseline **15–30 June** (16 days). The current dataset starts 1 July, so that baseline has **no data** → the spike must render **blank**.

**Q5 — Are the percentages correct today?**
**No — not for any granularity beyond the simple day-wise case, and even that only when the query is properly pinned.**

| Scenario | Correct today? | Reason |
|---|---|---|
| Day-wise | ⚠️ only if pinned | Baseline is "next row returned", not "previous day" (S-1) |
| Month-wise | ❌ | No previous-month selection; only one MONTH row exists → null |
| Today | ❌ | Partial day vs full day → −75.3 % artefact (S-3) |
| Custom range | ❌ | Falls back to day-over-day, not window-over-window (S-2) |
| Shift-wise | ⚠️ | Correct only if each shift is compared with the **same shift** of the previous period |
| Rate KPIs (OEE etc.) | ❌ | Baseline must be the mean of the previous window, not a sum (S-6) |

### Pseudo-logic
```
FUNCTION previousWindow(timeFilter):
    SWITCH timeFilter.mode:
        CASE TODAY:
            RETURN { date: today - 1 day, elapsedOnly: TRUE }
        CASE SINGLE_DAY:
            RETURN { date: timeFilter.date - 1 day }
        CASE MONTH:
            RETURN { month: timeFilter.month - 1 month }        // previous COMPLETE month
        CASE RANGE:
            n = days between from and to inclusive
            RETURN { from: timeFilter.from - n days,
                     to:   timeFilter.from - 1 day }            // equal-length, immediately preceding


FUNCTION computeSpike(scope, timeFilter, kpiName):
    current  = aggregate(scope, timeFilter,                  kpiName)   // SUM or AVERAGE per KPI class
    baseline = aggregate(scope, previousWindow(timeFilter),  kpiName)   // SAME aggregation method

    IF current IS NULL OR baseline IS NULL OR baseline == 0:
        RETURN { spike: NULL }            // render blank - never 0 %, never infinity

    IF timeFilter.mode == TODAY AND currentPeriodIsIncomplete(scope):
        RETURN { spike: NULL, note: "in progress" }   // or compare like-for-like elapsed window

    spike = (current - baseline) / ABS(baseline) * 100
    RETURN { spike: ROUND(spike, 1),
             favourable: isFavourable(kpiName, spike) }
```

---

## C16 — the baseline must use the identical pinned series 🔴

The baseline query differs from the current query in **the date window only**. Everything else is identical:

`kpi_name`, `section`, `sub_section`, `machine`, `product_type`, `unit_of_measurement`, `category`, and the same shift / `granularity`.

**Why this is a blocker:** grouping by `kpi_name` alone lets the baseline come from a different series entirely — Mixing's "previous" could be the `Final Compound` row while the current value is `Master Compound`, producing a percentage that compares two different products rather than two time periods.

---

## C17 — baseline aggregation must match the KPI class 🟠

Use the same classification as C5, applied to **both** windows:

* **Additive** (`Production*`, `Scrap*`, `Rework*`, `NCM_Hold*`, loss-reason minutes) → **sum** both windows.
* **Rate** (`OEE_*`, `Availability_*`, `Performance_*`, `Quality_*`, `FTQ`, `Plan_Compliance`) → **average** both windows.
* **Level** (`Inventory`, `Inventory_item`) → **latest** value in each window.

Mixing methods (e.g. a summed current against an averaged baseline) produces a meaningless percentage.

---

## C18 — direction from an explicit table, not substring matching 🟡

| Direction | KPIs |
|---|---|
| **Higher is better** (up = green) | `Production` + all `Production_*`, `OEE_o/_s/_m/_p`, `Availability_*`, `Performance_*`, `Quality_*`, `FTQ`, `Plan_Compliance` |
| **Lower is better** (up = red) | `Scrap` + all `Scrap_*`, `Rework` + all `Rework_*`, `NCM_Hold`, `NCM_Hold_sku`, and the six loss reasons (`Breakdown`, `No Schedule`, `Power Failure`, `Preventive Maintenance`, `Setup & Change`, `Operations/Material/Manpower`) |

Unlisted KPIs default to higher-is-better, and adding a KPI must require an explicit entry.

### Pseudo-logic
```
FUNCTION isFavourable(kpiName, spike):
    // explicit direction per KPI - NOT substring matching
    IF DIRECTION[kpiName] == LOWER_IS_BETTER:  RETURN spike <= 0
    RETURN spike >= 0
```

### Display rules
* Baseline missing, zero, or the previous window has no data → **blank**, not `0 %`, not `∞`, not `−100 %`.
* Current period partial (Today) → suppress the % or label it "in progress".
* Round to **one decimal**.
* Show the baseline period on hover (e.g. "vs 18 Jul", "vs Jun", "vs 15–30 Jun") so the comparison is auditable.

---

# Implementation order

1. **C1** — unblocks the time filter entirely (backend priority flip + frontend drops the stale single date).
2. **C2** — stops the silent 2×–3.21× over-count.
3. **C3 + C4** — card and drill agree; removes both doubling causes.
4. **C6** — OEE cards and drills start rendering.
5. **C5** — correct range maths (rates averaged, inventory latest).
6. **C11 + C12 + C14** — shift box responds to the time filter, honours all filters, blank-not-zero.
7. **C15 + C16 + C17** — correct spike baselines.
8. **C7, C8** — product filters start working.
9. **C9, C10, C13, C18** — unit merging, truncation safety, shift-boundary regression test, direction table.

---

# Verification values (Curing, overall, `NOS`)

**Cards & drills**
```
Production 1–16 July : card 301,530  = drill Production_s 301,530
   drop granularity  -> 603,060 (2.00x) ; +MONTH -> 967,407 (3.21x)
Drill by machine 16 July : overall 22,300 | Passenger 14,785 | unpinned 44,600 (2x)
OEE_o 1–16 July : average 82.45 %  (summed -> 1,319.21 % WRONG)
OEE anchor dates : Curing 2026-07-16 ; Mixing / Stock / TBM 2026-07-17
```

**Product-wise (2026-07-16, DAY)**

| Product | TBM | Curing |
|---|---:|---:|
| Overall | 23,947 | 22,300 |
| Passenger Radial | 16,084 | 14,785 |
| LCV | 4,005 | 3,869 |
| Unknown | 3,858 | 3,646 |

**Shift-wise totals**

| View | Shift A | Shift B | Shift C | = total |
|---|---:|---:|---:|---:|
| Day 2026-07-19 | 6,368 | 6,806 | 6,031 | **19,205** ✅ |
| Day 2026-07-16 | 7,702 | 6,760 | 7,838 | **22,300** ✅ |
| Month July | 121,142 | 117,961 | 125,244 | **364,347** ✅ (= MONTH row) |
| Range 1–16 July | 101,348 | 99,127 | 101,055 | **301,530** ✅ |

**Spike, day-wise 19 July vs 18 July**

| Shift | Current | Baseline | Spike |
|---|---:|---:|---:|
| Shift A | 6,368 | 5,279 | **+20.6 %** |
| Shift B | 6,806 | 5,257 | **+29.5 %** |
| Shift C | 6,031 | 5,802 | **+3.9 %** |

**Partial-day trap (07-20)**

| Shift | Today | Yesterday | Naive spike | Required display |
|---|---:|---:|---:|---|
| Shift A | 1,570 | 6,368 | −75.3 % | blank / "in progress" |
| Shift B | *no row* | 6,806 | −100 % or error | **blank**, never 0 |
| Shift C | 5,325 | 6,031 | −11.7 % | blank / "in progress" |

---

# Acceptance checklist

**Time filter**
- [ ] Applying a date range changes the result; no single-date field sent alongside `from`/`to`.
- [ ] `from == to` returns that single day's value, no aggregation.
- [ ] `from > to` rejected; a range outside the data span shows "no data in range".
- [ ] Month/Year buttons read the snapshot row; a custom range never reads a MONTH/YEAR snapshot.

**Granularity**
- [ ] Every query pins exactly one `granularity`; empty / `"all"` / disabled-Year never returns mixed zoom levels.
- [ ] Curing Production 1–16 July = **301,530** (not 603,060 or 967,407).

**Drill**
- [ ] Drill inherits `granularity`, date/range, `product_type`, `sub_section`, `unit_of_measurement` from the card.
- [ ] Curing Production 1–16 July: card **301,530** = drill sub-section level **301,530**.
- [ ] Curing drill by machine, 16 July: overall = **22,300** (not 44,600); Passenger Radial = **14,785**.
- [ ] Drill values are aggregated day-wise the same way as the card.

**Aggregation**
- [ ] Additive KPIs summed; rate KPIs averaged (Curing `OEE_o` 1–16 July = **82.45 %**).
- [ ] Missing days skipped in averages, never counted as 0.
- [ ] `Inventory` shows the latest in-range value.

**Dates**
- [ ] OEE renders using each KPI's own latest `date` (Curing **2026-07-16**, others **2026-07-17**) with an "as of" label; the OEE drill opens.

**Products & units**
- [ ] TBM/Curing: selecting Passenger Radial / LCV / Unknown **changes** the value.
- [ ] Stock 4 Roll lists `Belt Mother Roll` / `Ply Mother Roll` and shows a value.
- [ ] `Meters` merges into `M`; `NUM` merges into `NOS`; `(unset)` renders blank.
- [ ] Mixing sends a `unit_of_measurement` pin; `KG` and `Batch` are never combined.

**Shift comparison**
- [ ] Today and Day-wise read the three `SHIFT A/B/C` rows for the selected `date`.
- [ ] Month-wise **sums** each shift's daily rows across the month (no MONTH-level shift row exists).
- [ ] Custom range **sums** each shift's daily rows across the range.
- [ ] `SHIFT A + SHIFT B + SHIFT C = DAY` (or the range/month total) in every view.
- [ ] `DAY` and `SHIFT *` rows are never summed together.
- [ ] The box honours `section`, `sub_section`, `machine`, `product_type`, `unit_of_measurement`.
- [ ] Curing/TBM with a product selected read `Production_product`; Mixing pins compound + unit; Stock pins sub-section + product + unit.
- [ ] A shift with no row shows **blank**, never `0`; the latest day is flagged as partial.
- [ ] Shift C (23:00–06:59) is attributed to exactly one `date`; the A+B+C=DAY assertion passes at range boundaries.

**Spike %**
- [ ] Day-wise compares with the **previous day**, same shift, same pins.
- [ ] Month-wise compares with the **previous complete month**; blank when absent.
- [ ] Today compares like-for-like elapsed, or suppresses the % while in progress.
- [ ] Custom range compares with the **immediately preceding equal-length window** (1–16 Jul → 15–30 Jun); blank when that window has no data.
- [ ] Baseline uses the identical pinned series — only the date window moves.
- [ ] Additive KPIs summed in both windows; rate KPIs averaged in both.
- [ ] Direction comes from the explicit table, not substring matching.
- [ ] Missing/zero baseline renders blank — never `0 %`, `∞`, or `−100 %`.
- [ ] The baseline period is visible on hover.

**Robustness**
- [ ] Wide ranges are not silently truncated (aggregated, paginated, or flagged).

-
