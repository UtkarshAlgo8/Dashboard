# Uniformity Drill-down — Dev Guide

Quality › Product › Uniformity & Balancing.
Drill path: **Card → Machine → SKU → Parameter (with trend) → Barcode list**

Tables for machine, SKU and parameter read **Gold**. The barcode list and the parameter raw-value plot run a **Silver query** when the user clicks.

---

## 1. Common rules

**Gold table and base filter (every Gold query)**

```sql
FROM `jk-infiniti-datalake`.gold.gold_bi
WHERE plant = 'BANMORE'
  AND department = 'Quality'
  AND category = 'Uniformity Testing'
```

**Gold columns used**

| Column | Holds |
|---|---|
| `machine` | tester (stored in CAPITALS, e.g. `MICROPOISE`) |
| `itemcode` | SKU (SAP code) |
| `remarks` | parameter name (level 3 only) |
| `granularity` | `YEAR` / `MONTH` / `DAY` / `SHIFT A` / `SHIFT B` / `SHIFT C` |
| `date` | period date |
| `actual_value` | the number |

**Time filter → Gold rows**

| Time filter | `granularity` | `date` |
|---|---|---|
| Today | `DAY` | today |
| Shift A / B / C | `SHIFT A` / `SHIFT B` / `SHIFT C` | today |
| This month | `MONTH` | 1st of this month |
| Date range | `DAY` | `BETWEEN :from AND :to` (then add up, see §6) |

**Display rules**

- No Gold row for a SKU / parameter = it had no tests → don't show it.
- Never average % rows. Use only the Gold value, or the sum rule in §6.
- Drill-down screens are **tables**. Plots open only from the plot icon (dialog).

---

## 2. KPI names per card

| Card | Machine level (existing) | Machine tyres tested | SKU yield | SKU tyres tested | Parameter failed tyres | Parameter failed % |
|---|---|---|---|---|---|---|
| MTMS | `Mtms_Uniformity_Yield_m` | `Mtms_Uniformity_Production` | `Mtms_Uniformity_Yield_m_sku` | `Mtms_Uniformity_Production_m_sku` | `Mtms_Uniformity_Param_OffSpec_Qty_m_sku` | `Mtms_Uniformity_Param_OffSpec_Pct_m_sku` |
| TUO | `Tuo_Uniformity_Yield_m` | `Tuo_Uniformity_Production` | `Tuo_Uniformity_Yield_m_sku` | `Tuo_Uniformity_Production_m_sku` | — | — |
| ZF Uniformity | `Zf_Uniformity_Yield_m` | `Zf_Uniformity_Production` | `Zf_Uniformity_Yield_m_sku` | `Zf_Uniformity_Production_m_sku` | `Zf_Uniformity_Param_OffSpec_Qty_m_sku` | `Zf_Uniformity_Param_OffSpec_Pct_m_sku` |
| ZF Balancing | `Zf_Balancing_Yield_m` | `Zf_Uniformity_Production` | `Zf_Balancing_Yield_m_sku` | `Zf_Uniformity_Production_m_sku` | `Zf_Balancing_Param_OffSpec_Qty_m_sku` | `Zf_Balancing_Param_OffSpec_Pct_m_sku` |
| DBM | `Dbm_Balancing_Yield_m` | `Dbm_Balancing_Production_m` | `Dbm_Balancing_Yield_m_sku` | `Dbm_Balancing_Production_m_sku` | `Dbm_Balancing_Param_OffSpec_Qty_m_sku` | `Dbm_Balancing_Param_OffSpec_Pct_m_sku` |

---

## 3. Level 1 — Machine table (click a card)

**Columns:** Machine · Yield % · Tyres tested

```sql
SELECT y.machine,
       y.actual_value AS yield_pct,
       n.actual_value AS tyres_tested
FROM `jk-infiniti-datalake`.gold.gold_bi y
LEFT JOIN `jk-infiniti-datalake`.gold.gold_bi n
  ON  n.kpi_name    = :machine_tested_kpi        -- e.g. 'Mtms_Uniformity_Production'
  AND n.machine     = y.machine
  AND n.granularity = y.granularity
  AND n.date        = y.date
WHERE y.plant = 'BANMORE' AND y.department = 'Quality' AND y.category = 'Uniformity Testing'
  AND y.kpi_name    = :machine_yield_kpi         -- e.g. 'Mtms_Uniformity_Yield_m'
  AND y.machine IS NOT NULL
  AND y.granularity = :granularity
  AND y.date        = :date
ORDER BY y.actual_value
```

---

## 4. Level 2 — SKU table (click a machine)

**Columns:** SKU · Yield % · Tyres tested

```sql
SELECT y.itemcode AS sku,
       y.actual_value AS yield_pct,
       n.actual_value AS tyres_tested
FROM `jk-infiniti-datalake`.gold.gold_bi y
LEFT JOIN `jk-infiniti-datalake`.gold.gold_bi n
  ON  n.kpi_name    = :sku_tested_kpi            -- e.g. 'Mtms_Uniformity_Production_m_sku'
  AND n.machine     = y.machine
  AND n.itemcode    = y.itemcode
  AND n.granularity = y.granularity
  AND n.date        = y.date
WHERE y.plant = 'BANMORE' AND y.department = 'Quality' AND y.category = 'Uniformity Testing'
  AND y.kpi_name    = :sku_yield_kpi             -- e.g. 'Mtms_Uniformity_Yield_m_sku'
  AND y.machine     = :machine
  AND y.granularity = :granularity
  AND y.date        = :date
ORDER BY y.actual_value
```

**TUO:** clicking a SKU goes straight to the barcode list (§7). TUO has no parameter level.

---

## 5. Level 3 — Parameter table (click a SKU)

**Columns:** Parameter · Failed tyres · Failed % · plot icon

```sql
SELECT q.remarks AS parameter,
       q.actual_value AS failed_tyres,
       p.actual_value AS failed_pct
FROM `jk-infiniti-datalake`.gold.gold_bi q
LEFT JOIN `jk-infiniti-datalake`.gold.gold_bi p
  ON  p.kpi_name    = :param_pct_kpi             -- e.g. 'Mtms_Uniformity_Param_OffSpec_Pct_m_sku'
  AND p.machine     = q.machine
  AND p.itemcode    = q.itemcode
  AND p.remarks     = q.remarks
  AND p.granularity = q.granularity
  AND p.date        = q.date
WHERE q.plant = 'BANMORE' AND q.department = 'Quality' AND q.category = 'Uniformity Testing'
  AND q.kpi_name    = :param_qty_kpi             -- e.g. 'Mtms_Uniformity_Param_OffSpec_Qty_m_sku'
  AND q.machine     = :machine
  AND q.itemcode    = :sku
  AND q.granularity = :granularity
  AND q.date        = :date
ORDER BY q.actual_value DESC
```

**Parameters you will get**

| Card | `remarks` values |
|---|---|
| MTMS | RFV CW, H1 RFV CW, LFV CW, RFV CCW, H1 RFV CCW, LFV CCW, Conicity |
| ZF Uniformity | the 7 above + RRO, Upper LRO, Lower LRO, Upper Bulge, Lower Bulge, Upper Depression, Lower Depression |
| ZF Balancing | Upper Unbalance, Lower Unbalance, Static Unbalance, Couple Unbalance |
| DBM | Upper Unbalance, Lower Unbalance, Static Unbalance, Couple Unbalance |

A tyre can fail more than one parameter, so failed tyres across parameters can add up to more than the SKU's failed tyres. That is correct.

### Plot icon on a parameter row → raw-value trend dialog

Line chart of the **measured value of every tested tyre** of that SKU on that machine, in test order. Read from **Silver** at click time (not Gold).

| Card | Query file | Plot available |
|---|---|---|
| MTMS | `trend_mtms_uniformity.sql` | Yes |
| DBM | `trend_dbm_balancing.sql` | Yes |
| ZF Uniformity / ZF Balancing | — | **No** — ZF Silver table has grades only. Hide the plot icon. |
| TUO | — | **No** — no parameters |

**Inputs:** same as the barcode query (§7): `:machine`, `:sku`, `:parameter`, `:from_date`, `:to_date`, `:shift`.

**Columns returned:** test_time, barcode, production_date, shift, machine, sku, parameter, actual_value, grade, is_off_spec

**Chart**

| Item | Setting |
|---|---|
| x-axis | `test_time` |
| y-axis | `actual_value` (unit as measured by the tester) |
| Line | joins the points in test order |
| Points | `is_off_spec = 1` in red, others in the default colour |
| Tooltip | barcode, test time, shift, value, grade |
| Spec lines | LSL / USL dashed lines — add when the spec table arrives (§9) |

- One point = one tyre (its latest test). Tyres with no reading are left out.
- Points = the SKU's tyres tested; red points = the parameter's failed tyres.
- Long ranges (a month or more) can return thousands of points; allow zoom on the x-axis.

---

## 6. Date range — how to add up

For a date range, read `DAY` rows between `:from` and `:to` and combine:

| Column | Rule |
|---|---|
| Tyres tested | SUM of daily tyres tested |
| Failed tyres | SUM of daily failed tyres |
| Failed % | total failed ÷ total tested × 100 |
| Yield % | SUM(daily yield × daily tested) ÷ SUM(daily tested) |

Never average the daily % values.

---

## 7. Level 4 — Barcode list (click a failed count)

Run a Silver query from `silver_queries/` with Databricks named parameters.

| Card | Query file |
|---|---|
| MTMS | `barcode_mtms_uniformity.sql` |
| ZF Uniformity | `barcode_zf_uniformity.sql` |
| ZF Balancing | `barcode_zf_balancing.sql` |
| DBM | `barcode_dbm_balancing.sql` |
| TUO (click a SKU) | `barcode_tuo_status.sql` |

**Inputs**

| Parameter | Value |
|---|---|
| `:machine` | `machine` of the clicked row (any case works) |
| `:sku` | `itemcode` of the clicked row |
| `:parameter` | `remarks` of the clicked row (not used by TUO) |
| `:from_date`, `:to_date`, `:shift` | from the time filter, table below |

| Time filter | `:from_date` | `:to_date` | `:shift` |
|---|---|---|---|
| Today | today | today | `ALL` |
| Shift A / B / C | today | today | `A` / `B` / `C` |
| This month | 1st of month | today | `ALL` |
| Date range | from | to | `ALL` |

**Columns returned**

| Query | Columns |
|---|---|
| MTMS, ZF, DBM | barcode, test_time, production_date, shift, machine, sku, parameter, actual_value, grade |
| TUO | barcode, test_time, production_date, shift, machine, sku, status, operator |

**Show:** Barcode · Test time · Shift · Value · Grade · LSL · USL

- **LSL / USL** → show `—` for now (spec limits not available yet).
- **ZF Value** → blank for now (ZF table stores grades only).

The row count always equals the failed-tyres number the user clicked.

---

## 8. Test before release

1. Pick a Gold row with `failed_tyres > 0` (level 3).
2. Run its barcode query with the same machine, SKU, parameter, date and shift.
3. Rows returned must equal `failed_tyres`.
4. For a machine, SUM of SKU "tyres tested" must equal the machine's "tyres tested" (MTMS, TUO, ZF).

---

## 9. Coming later (no dev work now)

| Item | Waiting for |
|---|---|
| LSL / USL in barcode list and spec lines on the trend | spec limit table from MES |
| ZF actual values and ZF raw-value trend | ZF measured columns added to Silver |
