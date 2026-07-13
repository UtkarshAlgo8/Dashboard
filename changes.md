# Dashboard Change Spec — New Requirements (real data)

> **Logic only — no SQL/query code.** Plant = `BANMORE`, department = `production`. Assumes the **Scrap `sub_section` data change is already done** (see §1). Navigation is attribute-driven (parse the single-quoted `drill_down_attribute`).
> **Prerequisite fix that underlies several items:** the missing-value sentinel in the data is the literal string **`"null"`**. Treat `"null"` as empty everywhere (parser, `denan`, and the product_type/sub_section "is empty" checks). Several bugs below are caused by `"null"` not being recognised.

---

## 1. Scrap / Rework drill — now nests by subsection (data change applied)

The data now carries `sub_section` on the child scrap levels, so the drill nests properly.

**Attribute chain:**
```
Scrap    → ['Scrap_s']
Scrap_s  → ['Scrap_reason', 'Scrap_m', 'Scrap_sku', 'Scrap_m_sku']
  Scrap_reason / Scrap_m / Scrap_sku / Scrap_m_sku → []  (leaves)
```
(Same for `Rework_*`.)

**Backend drill logic:**
1. `Scrap` card → click → **Subsection-wise** (`Scrap_s`, one row per subsection: Building / Curing / Engineering / …).
2. Click a subsection → open `Scrap_s`'s children; **pass `sub_section = <clicked subsection>`** to `Scrap_reason` / `Scrap_m` / `Scrap_sku` / `Scrap_m_sku` (these rows now carry `sub_section`, so filtering works and reconciles).
3. Default View = **Reason-wise** (`Scrap_reason`, reason text from `remarks`); a **View By** control switches Reason / Machine / SKU / Machine+SKU — all filtered to the clicked subsection.

**Two must-fix rules (these were the reported bugs):**
* **`Scrap_s.drill_down_attribute` must be the real child list, not the string `"null"`.** With the `"null"` sentinel handled, the leaf attributes are `[]`. (Previously `Scrap_s` had attribute `"null"`, so clicking a subsection drilled into a fake KPI named "null" → empty. That was Issue 1.)
* **Pin the drill to the SAME `granularity` as the card.** When the card is Monthly, the subsection drill must filter `granularity = MONTH` — do **not** sum DAY + SHIFT + MONTH rows together. (That summing was Issue 2 — monthly subsection totals exceeding the card.)

**Reconciliation to verify:** within a subsection, `sum(Scrap_reason) = sum(Scrap_m) = sum(Scrap_sku) = Scrap_s[subsection]`; and `sum over subsections of Scrap_s = Scrap` parent — all at the **same granularity**.

---

## 2. Show OEE_o in the left section column (dynamic by time filter)

The left-side section list (Mixing / Stock / TBM / Curing) must show each section's **OEE_o** value, and it must **update when the time filter changes** (Today→`DAY`, Month→`MONTH`, Shift→`SHIFT A/B/C`).

**Card filter (per section):** `kpi_name = OEE_o`, `sub_section` empty, `machine` empty, `product_type` empty (OEE is product-agnostic), `granularity` = the selected time filter, `date` = that section's latest day for OEE.

**Real-data availability (important — not every section has OEE_o):**

| Section | OEE_o present? | Left-column shows |
|---|---|---|
| **Curing** | ✅ (DAY, MONTH, SHIFT A/B/C) | OEE_o for the selected granularity |
| **Mixing** | ✅ (DAY, SHIFT A/B/C — **no MONTH**) | OEE_o; **null for Month** (no MONTH row) |
| **Stock** | ❌ no OEE_o (has `OEE_s` per subsection) | **null** (or optionally the selected subsection's `OEE_s`) |
| **TBM** | ❌ no OEE_o and no OEE_s | **null** |

**Behavior:**
* Read `OEE_o` for the selected granularity per section; show the value, update on time-filter change.
* Where `OEE_o` is absent for that section/granularity (Stock, TBM, and Mixing-Month), show a **null/empty** value in the section row — do not hide the row, do not fabricate a number.
* Never pin `product_type` for OEE; anchor to that section's latest OEE date (OEE dates can lag Production dates).

---

## 3. Fix Shift Comparison — Production not showing

**Shift Comparison** shows KPIs shift-wise (Shift A / B / C). Required KPIs: **Production, Scrap, Rework**. Scrap/Rework already show (Curing); **Production is not showing for any section** — even though the data exists.

**Root cause (verified): Production DOES have Shift A/B/C rows for all four sections** — this is a **pinning bug**, not missing data. Production is not showing because the Shift Comparison isn't pinning Production the way the Production card does (§18 of the base spec), and because of the `"null"` sentinel:

* **Curing / TBM** — the overall Production shift rows have `product_type = "null"` (the literal string). If the query pins `product_type IS NULL` / `= 'nan'`, it **misses** the `"null"` rows → Production blank. **Fix:** treat `"null"` as empty (then the overall row is selected).
* **Mixing** — no overall row exists; Production shift rows are per **compound** (`Master`/`Final`). **Fix:** pin the selected compound (same as the Mixing Production card).
* **Stock** — no overall row; Production shift rows are per **product** under a subsection. **Fix:** pin the selected subsection + product (same as the Stock Production card).

**Shift C:** Shift C Production rows exist for every section (verified). If Shift C isn't appearing, ensure the view **fetches all three shifts** (`SHIFT A`, `SHIFT B`, `SHIFT C`) and pins as above — don't stop at A/B.

**Expected result:**
* **Curing:** Production + Scrap + Rework, shift-wise (product_type empty/overall for Production; Scrap/Rework from Quality).
* **Mixing / Stock / TBM:** Production shift-wise (pinned per §18); Scrap/Rework shown **only where data exists** (currently Curing only — elsewhere show blank, not zero).
* All three shifts (A, B, C) visible for Production.

**Table shape (per section, for the selected day):**
| Shift | Production | Scrap | Rework |
|---|---|---|---|
| Shift A | pinned per §18 | Quality (if present) | Quality (if present) |
| Shift B | … | … | … |
| Shift C | … | … | … |

(Production is a SUM KPI, so Shift A + B + C should equal the Daily Production for the same pin.)

---

## 4. Remove “Overall” from Stock sub-section drill-downs

Inside a Stock subsection drill-down (e.g. **4 Roll → Rubberised Ply / Rubberised Belt**), an extra **“… Overall”** row (e.g. “Four Roll Overall”) is appearing and must be removed. This applies to **all** Stock subsections: 4 Roll, Extruder, Three Roll, Cutter, Slitter.

**Root cause (verified): the real data has NO “Overall” product for Stock.** Stock Production product types are only `Bead Apex, Bead Bundle, Belt, Cap Strip, Inner Liner, Ply, SideWall` — there is **no `Overall`**. So the “Overall” row is being **injected by the app** (leftover from the dummy, where Stock used a synthetic `product_type = "Overall"`).

**Fix:**
* **Do not inject/synthesize an “Overall” entry** in Stock subsection drill-downs. Show only the real product/category rows present in the data for that subsection.
* Remove any code path that adds an `"Overall"` (or `<subsection> Overall`) row for Stock. Since the data contains no such row, simply stop generating it — the drill will then show only the relevant products (e.g. 4 Roll → Ply, Belt).
* Applies to every Stock subsection drill-down.

---

## 5. Acceptance checklist

- [ ] `"null"` sentinel treated as empty everywhere (parser, denan, product_type/sub_section checks).
- [ ] Scrap/Rework: `Scrap → Scrap_s → [reason, machine, sku, machine+sku]`; drill passes `sub_section` to children; drill pins the card's `granularity`; within-subsection breakdowns reconcile to `Scrap_s`.
- [ ] Left section column shows `OEE_o` per section, updates with the time filter; Stock/TBM (and Mixing-Month) show null (no fabricated value); OEE never pins product_type.
- [ ] Shift Comparison shows Production for all sections (Curing/TBM overall via `"null"`-as-empty; Mixing pins compound; Stock pins subsection+product); Scrap/Rework where available; Shift A, B, and C all visible; A+B+C = Daily.
- [ ] No “Overall” row inside any Stock subsection drill-down (stop injecting it; data has none).

---

## 6. Case handling & value normalization (product_type SideWall, etc.)

The data is **inconsistent in casing and spelling** on some dimensions (e.g. `product_type` is stored as both `SideWall` and `Sidewall` — 1,108 Stock rows split across the two). A case-sensitive filter for one spelling silently drops the other, so cards/drills under-count or come back empty. Fix by normalizing **once on read** — not by wrapping `LOWER()` around every predicate.

### 6.1 Make these FILTER dimensions case-insensitive (and canonicalize)

For these low-cardinality filter columns, compare case-insensitively **and** map to one canonical value on read (so duplicate spellings merge into a single row/bar with a combined total, and the incoming filter value matches regardless of casing):

| Column | Reason |
|---|---|
| `plant` | `BANMORE` (already uppercased) |
| `department` | `Production` / `production` (already lowercased) |
| **`product_type`** | **`SideWall` vs `Sidewall`** — the reported bug; case-insensitive match + canonical casing |
| `section` | guard against future casing drift |
| `sub_section` | casing may vary; also has spelling dups (see 6.3) |

* **Canonicalize, don't just case-fold:** pick one canonical spelling (e.g. `Sidewall → SideWall`) when reading rows AND when reading the incoming filter value. Then grouping merges the two spellings into one SideWall bar with the summed total — pure case-insensitive matching alone would still show two separate "SideWall" rows in a drill.
* Impact of the SideWall split: Stock `Production_sku` / `Production_m` / `Production_m_sku` / `NCM_Hold(_sku)` / `Inventory(_item)` — all can under-count until this is fixed.

### 6.2 Keep these EXACT — do NOT case-fold

| Column | Handling |
|---|---|
| `kpi_name` | **exact match** — it's an API contract (`OEE_o`, `Scrap_s`, `Production_m`), already consistent; folding risks collisions |
| `granularity` | **normalize via the synonym map** (`DAY`, `MONTH`, `SHIFT A/B/C`) — not blind case-folding |
| `remarks` | **as-is** — free text (scrap reason shown to user); folding mangles display and merges distinct reasons |
| `itemcode` | **as-is** — identifier; casing may be meaningful |
| `actual_value` / `date` | numeric/date — not text |

Do not reflexively wrap every predicate in `LOWER()`; only the 6.1 dimensions need it.

### 6.3 CRITICAL — case-insensitivity only merges CASING duplicates, not look-alikes

Case-folding must merge **same word, different case** only. It must NOT merge genuinely different values:

* **Keep separate (different products):** `Green` vs `Green Tyre`; `Belt` vs `Mother Roll - Belt`; `Ply` vs `Mother Roll - Ply`; `Compound` vs `Master Compound` vs `Final Compound`.
* **Different-word duplicates need an explicit alias, not case-folding:** `3 Roll` vs `Three Roll` (same subsection, different spelling) — map via an alias list (like `Production_sku_m → Production_m_sku`), because case-folding won't catch it.

### 6.4 Where to implement

Put all of this in the shared normalize layer (one place), so:
* incoming filter values are canonicalized before matching,
* row values are canonicalized before grouping/display,
* every query builder benefits without repeating `LOWER()` logic.

---

## 7. Acceptance checklist (case handling)

- [ ] `product_type` matched case-insensitively; `SideWall`/`Sidewall` return combined totals as one bar (Stock SideWall card, NCM Hold, Inventory all correct).
- [ ] `plant`, `department`, `section`, `sub_section` compared case-insensitively / canonicalized.
- [ ] `kpi_name` matched exactly (not folded); `granularity` normalized via synonym map; `remarks`/`itemcode` left as-is.
- [ ] Look-alikes kept separate (`Green` vs `Green Tyre`, `Belt` vs `Mother Roll - Belt`, `Compound` vs `Master/Final Compound`).
- [ ] `3 Roll` / `Three Roll` merged via an explicit alias (not case-folding).
- [ ] Normalization done once in the shared layer (incoming filter + row values), not per-query `LOWER()`.

---

## 8. Date-range filter (calendar from/to) — aggregation logic

This is the **calendar date-range** picker (e.g. 1–16 June), separate from the Today/Month/Year granularity buttons. It was returning no values because the code was reading MONTH/YEAR snapshot rows (which sit on the 1st) or ranges outside the data. Fix with explicit range logic below.

### 8.1 Core rules
* **Always use `granularity = DAY` for a custom range.** DAY rows exist for every date; **never** read MONTH/YEAR snapshot rows for an arbitrary range (they're single point-dated rows on the 1st and will be missed), and **never** mix in SHIFT rows (Shift A/B/C already roll up into DAY — including them double/triple counts).
* **Pin ONE series first** (same pinning as the card, §18 of the base spec): `product_type` / `sub_section` / `unit` — then aggregate only that series. Do not aggregate multiple product_types/units together.
* **Single date (from == to):** return that one day's **DAY** value directly — no aggregation. (e.g. Final Compound production for 3 June → 3 June = the DAY row for Final Compound on 2026-06-03.)
* **Clamp / validate** the range to the data's available span; if the range has no DAY rows, show "no data in range" (don't error/blank silently).

### 8.2 SUM vs AVERAGE per KPI

**SUM these (additive / flow KPIs)** — add up the pinned daily rows across the range:
* Production (and its drill levels: Production_product / Production_s / Production_m / Production_sku / Production_m_sku)
* Scrap (and Scrap_s / Scrap_reason / Scrap_m / Scrap_sku / Scrap_m_sku)
* Rework (and its drill levels)
* NCM Hold quantity

**AVERAGE these (rate / ratio KPIs)** — take the simple mean of the pinned daily values across the range (mean of the days that have data in the range):
* `OEE_o`, `OEE_s`, `OEE_m`
* `Availability_o` / `Availability_s` / `Availability_m`
* `Performance_o` / `Performance_s` / `Performance_m`
* `Quality_o` / `Quality_s` / `Quality_m`
* `FTQ`
* `Plan_Compliance`

> Note: this is a **simple average** of daily rates (per the agreed approach). It is an approximation — it is not production-weighted — but it is the chosen behaviour. Average only over the days that actually have a value in the range (ignore missing days; do not treat missing as 0).

### 8.3 Worked examples (real data intent)
* **Production, 1–16 June, Curing overall (NOS):** sum the DAY Production rows (product_type empty, unit NOS) for 2026-06-01…2026-06-16 → one total.
* **Scrap, 1–16 June, Curing:** sum the DAY Scrap rows in range.
* **OEE_o, 1–16 June, Curing:** average the daily `OEE_o` values in range (mean of the days present) → one percentage.
* **Final Compound Production, 3 June → 3 June:** single date → return the DAY Production row for `Final Compound` on 2026-06-03 (no aggregation).

### 8.4 Aggregation guardrails (so numbers don't double-count)
* Filter to **`granularity = DAY` only** before summing/averaging.
* Sum/average **one pinned series** (one product_type, one sub_section, one unit).
* **Curing / TBM Production:** aggregate the **overall** rows (`product_type` empty) — do NOT also add the per-product rows (Passenger/LCV/Unknown), which already sum to the overall.
* **Mixing Production:** aggregate the selected compound only (Master OR Final) — never both.
* **Stock Production:** aggregate one subsection+product series.
* Remember the **`"null"` sentinel** — "overall" rows have `product_type = "null"`; treat `"null"` as empty so those rows are selected.

### 8.5 Inventory over a range (special case — not sum, not average)
Inventory is a **stock level**, not a flow — summing daily inventory is meaningless. For a date range, show the **latest in-range day's** inventory value (the balance as of the range end). Do not sum; do not average.

---

## 9. Acceptance checklist (date-range)

- [ ] Custom date range uses `granularity = DAY` only (no MONTH/YEAR snapshots, no SHIFT rows).
- [ ] One series pinned before aggregating (product_type / sub_section / unit).
- [ ] `from == to` returns that single day's daily value (no aggregation).
- [ ] Additive KPIs (Production, Scrap, Rework, NCM qty) are **summed** over the range.
- [ ] Rate KPIs (OEE_o/s/m, Availability, Performance, Quality, FTQ, Plan_Compliance) are **averaged** (simple mean of days with data).
- [ ] No double-counting: overall Production not added to per-product; Mixing one compound; one unit only.
- [ ] Inventory shows latest in-range value (not summed/averaged).
- [ ] Range outside data span → graceful "no data", not blank/error.

---

## 10. Month & Year granularity buttons (snapshot reads — NOT the date range)

This is the **Month / Year time-filter buttons** (distinct from the calendar date range in §8). These read a **single pre-aggregated snapshot row** per KPI — no summing/averaging needed, because the row already holds the period total.

### 10.1 Month (verified correct in the data)
* `granularity = MONTH`. Each KPI has **one MONTH row per month, dated the 1st** (e.g. `2026-06-01`), **updated in place** (stable `record_id`), whose value is the **full-month total**.
* Verified: Curing Production June MONTH row = 333,034 = the sum of all June DAY rows; exactly one row per month. So the month snapshot is correct — **read it directly, do not re-aggregate.**
* **Month button logic:** pin `granularity = MONTH`, anchor to the **latest MONTH row** (max month date, e.g. `2026-06-01`), read that single value per KPI. Apply the same card pinning as §18 (OEE product_type empty; Production overall/compound/subsection per section; one unit).
* **Availability caveat:** Mixing has **no** MONTH OEE_o → its Month OEE shows null (§2). Read whatever MONTH rows exist; show null where absent.

### 10.2 Year (assumed pattern — mirrors Month; enable when data lands)
* **No YEAR/YTD rows exist in the data yet** (0 rows dated `2026-01-01`). Build the logic on the assumption that Year arrives following the **same pattern as Month, one level up**:
  * `granularity = YEAR` (or `YTD` — confirm the exact string when data arrives and add it to the granularity synonym map).
  * **One row per KPI per year, dated `2026-01-01`, updated in place**, value = the **full-year (annual) total**.
* **Year button logic:** pin `granularity = YEAR`, anchor to the **latest YEAR row** (`2026-01-01`), read that single value per KPI (same card pinning as §18). No aggregation — the row holds the annual total.
* **Keep behind the `ENABLE_YEAR` flag.** Year is currently disabled; flip the flag on (and add `YEAR`/`YTD` to the allowed-granularity set + synonym map) when the data is provided. Do not delete the Year code path.

### 10.3 Month/Year snapshots vs the date-range filter (do not confuse)
* **Month / Year buttons →** read the **single snapshot row** (dated the 1st), value = period total. No aggregation.
* **Custom calendar date range (§8) →** use **DAY** rows + **sum/average** (because a snapshot dated on the 1st would be missed by a mid-period range). Never read the MONTH/YEAR snapshot for an arbitrary range.
* This separation is the fix for the earlier "date range returns nothing" bug: the range path must NOT depend on the 1st-of-period snapshot rows.

### 10.4 Trend/plot (if used)
* Monthly trend = one point per month = the `MONTH` snapshot per month (latest row if more than one ever exists).
* Yearly trend = one point per year = the `YEAR` snapshot per year.
* (Daily trend uses DAY rows, current month day-by-day — unchanged.)

---

## 11. Acceptance checklist (Month / Year buttons)

- [ ] Month button reads the `MONTH` snapshot (dated the 1st), one value per KPI = full-month total; no re-aggregation.
- [ ] Month anchored to the latest MONTH row; card pinning per §18; Mixing Month OEE shows null (no data).
- [ ] Year built to mirror Month: `YEAR`/`YTD` snapshot dated `2026-01-01`, updated in place, value = annual total; read directly.
- [ ] Year kept behind `ENABLE_YEAR`; enable + add granularity to synonym/allow-list when data lands.
- [ ] Month/Year buttons use snapshot rows; custom date ranges use DAY + sum/average (§8) — never the snapshot for a range.
