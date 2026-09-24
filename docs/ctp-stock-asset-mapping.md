# CTP Stock Asset Mapping — gap analysis

Status: **mostly available**. Raised 2026-08-11, corrected 2026-08-11 after
re-running the reconciliation against the right columns.

Source: client-supplied "ASSET Mapping for STOCK section at CTP" (22 rows:
Stock Asset → Finished Product → PCR/TBR → Categories → KPI List).

## Correction to the earlier verdict

The first pass matched the client's **Stock Asset** column against gold
`machine` and concluded 15 of 22 were missing. That was the wrong join key.

`ctp_gold.ctp_gold` does not store the asset names, and it does not store the
KPI-List names either. It decomposes them:

| Client column | Gold column | Example |
| --- | --- | --- |
| Categories | `sub_section` | `Cutter` |
| Finished Product | `product_type` | `Ply` |
| PCR/TBR | `tyre_type` | `PCR` |
| KPI List entry | `kpi_name` | `Production_m` |

So `ply_production_m` is not a value in `kpi_name` — it is the client's name
for the row `(sub_section=Cutter, product_type=Ply, tyre_type=PCR,
kpi_name=Production_m)`. The KPI-List column is a naming convention, not a
lookup key. `*_production_overall` corresponds to gold `Production` (with
`Production_sku` as its SKU split).

`machine` is populated on only the `Production_m` / `Production_m_sku` rows
(12 distinct values); every `Inventory` / `Production` row has it blank. Any
reconciliation keyed on `machine` therefore under-reports by construction.

Re-keyed on `sub_section` + `product_type` + `tyre_type`: **11 of 22 assets
are fully covered, 6 are partial, 5 are genuinely absent.**

## What `section = 'Stock'` actually contains at CTP

83,178 rows. Complete grid of `sub_section | product_type | tyre_type` and the
`kpi_name` values present on each:

| sub_section | product_type | tyre | kpi_name values |
| --- | --- | --- | --- |
| 3 Roll | Inner Liner | PCR | Inventory, Inventory_item |
| 3 Roll | Inner Liner | TBR | Inventory, Inventory_item, Production, Production_m, Production_m_sku, Production_sku |
| Bead | Bead Apex | TBR | Production, Production_m, Production_m_sku, Production_sku |
| Bead | Bead Bundle | PCR | Production, Production_m, Production_m_sku, Production_sku |
| Belt Edge Filler | Belt Edge Filler | TBR | Production |
| Cutter | Bias Cutter | PCR | Production |
| Cutter | Chaffer | PCR | Production |
| Cutter | Chaffer | TBR | Production |
| Cutter | Fisher Cutter | PCR | Production |
| Cutter | Ply | PCR | Inventory, Inventory_item, Production, Production_m, Production_m_sku, Production_sku |
| Cutter | Ply | TBR | Inventory, Inventory_item, Production, Production_m, Production_m_sku, Production_sku |
| EBR | Radiation | TBR | Production |
| Extruder | EdgeGum | Both | Production |
| Extruder | Sidewall | PCR | Inventory, Inventory_item, Production, Production_m, Production_m_sku, Production_sku |
| Extruder | Sidewall | TBR | Production, Production_m, Production_m_sku, Production_sku |
| Extruder | Tread | TBR | Inventory, Inventory_item, Production, Production_m, Production_m_sku, Production_sku |
| Super Assembly | Super Assembly | TBR | Production |
| TDA | Bead Apex | TBR | Production |

Only two `category` values exist across all of Stock: `Inventory` and
`Productivity`. The client's "Categories" column is **not** gold `category` —
it is gold `sub_section`.

## Reconciliation — 22 client rows

### Fully covered — 11

| Client asset | sub_section \| product_type \| tyre | Note |
| --- | --- | --- |
| BeadPCR | Bead \| Bead Bundle \| PCR | |
| BeltEdgeFiller | Belt Edge Filler \| Belt Edge Filler \| TBR | |
| BIASPCR | Cutter \| Bias Cutter \| PCR | |
| BODYPLYPCR | Cutter \| Ply \| PCR | |
| Duplex | Extruder \| Tread \| TBR | |
| EdgeGum | Extruder \| EdgeGum \| Both | client files it under Calender, gold under Extruder |
| Fisher | Cutter \| Fisher Cutter \| PCR | |
| SuperAssembly | Super Assembly \| Super Assembly \| TBR | client category "Pre-Assembly" |
| TBRBODYPLY | Cutter \| Ply \| TBR | |
| TBRIL | 3 Roll \| Inner Liner \| TBR | client files it under Calender, gold under 3 Roll |
| TDA | TDA \| Bead Apex \| TBR | client category "Apexing" |

### Partially covered — 6

| Client asset | What exists | What's missing |
| --- | --- | --- |
| ChafferPCR | Cutter \| Chaffer \| PCR — `Production` only, **5 rows total** | `chaffer_inventory`, `chaffer_inventory_item` |
| ChafferTBR | Cutter \| Chaffer \| TBR — `Production` only (821 rows) | `tbr_chaffer_inventory`, `..._inventory_item` |
| Quadraplex | Extruder \| Sidewall \| TBR — production family | inventory rows; "TBR Shoulder Pad" is not a `product_type` |
| QuintoplexPCR | Extruder \| Sidewall \| PCR — full family | no `Extruder \| Tread \| PCR` — the PCR Tread half is absent |
| TRIPLEX | Extruder \| Sidewall \| PCR — full family | same PCR Tread gap; TRIPLEX and QuintoplexPCR both resolve to the same gold rows |
| PCRIL | 3 Roll \| Inner Liner \| PCR — `Inventory`, `Inventory_item` | `inner_liner_production_m` — PCR inner liner has no production rows at all |

### Absent — 5

| Client asset | Finished product | Evidence |
| --- | --- | --- |
| BeltPCR | PCR Belt | `product_type = 'Belt'` exists only under `section = 'TBM'` (192 rows, blank tyre_type) — nothing in Stock |
| BeltTBR | TBR Belt | as above |
| BESTRYAPEX | PCR Apex | `Bead Apex` is TBR-only; no PCR apex row |
| Doubling | Doubled Flipper | no `Flipper` or `Doubling` product_type anywhere in ctp_gold |
| FOURROLL | Steel & Fabric Calender | no `4 Roll` sub_section (CTP records `3 Roll`) and no belt-mother-roll product |

`ctp_bronze` still has no `asset_map` table (Banmore has `bronze.asset_map`),
so the asset→product relationship has no home in the data layer. That matters
for labelling, not for availability — the KPIs themselves resolve without it.

## Category vocabulary mismatch

The client's 8 categories do not line up with the 8 `sub_section` values CTP
records:

| Client category | Gold sub_section | |
| --- | --- | --- |
| BEAD | `Bead` | matches |
| Cutter | `Cutter` | matches |
| Extruder | `Extruder` | matches |
| Pre-Assembly | `Super Assembly` | same thing, different name |
| Apexing | `TDA` (and part of `Bead`) | same thing, different name |
| Calender | `3 Roll` + `Belt Edge Filler` + EdgeGum | gold splits it three ways |
| Slitter | — | no such sub_section; Chaffer sits under `Cutter` |
| 4 Roll | — | CTP records `3 Roll` |
| — | `EBR` (Radiation, TBR) | no client category covers it |

The Stock pill row on the dashboard is built from the plant's own vocabulary
([BanmoreProduction.jsx:296-299](frontend/src/pages/BanmoreProduction.jsx#L296-L299)),
so it currently shows gold's 8 values. Showing the client's 8 instead needs a
decision — see below.

## Open decision

Two ways to present this, and they are not equivalent:

1. **Keep gold's vocabulary** (status quo). The pill row shows
   `3 Roll / Bead / Belt Edge Filler / Cutter / EBR / Extruder /
   Super Assembly / TDA`. Honest to the data, unfamiliar to the client.
2. **Present the client's vocabulary** via a display-name map. Needs
   `Calender` to fan out to three sub_sections, `Slitter` to resolve to a
   product_type filter inside `Cutter`, and `4 Roll` to render empty.

Needs client confirmation before implementing.

## Inventory master endpoint (added 2026-09-24)

The CTP Production dashboard Inventory tab is now wired to live data
via `GET /api/v1/plants/chennai/inventory/master` (see
[backend/src/controllers/inventory.controller.js](../backend/src/controllers/inventory.controller.js)
+ [`toCtpInventoryMaster()`](../backend/src/utils/transformers.js)).

**Coverage today** — Stock section only. Mixing and Tyre Building gain
sections automatically once ETL writes Inventory_item rows for them; the
transformer reads whatever the gold table carries.

**Lot-level facets are synthesised** because the gold schema has no
`lot_id`, `mhe_code`, `age_days`, `expiry_date` or per-row lot-status
columns. Each Inventory_item row emits one synthetic READY lot carrying
the item's full qty — so the page renders meaningful totals on the
Stock section (real `actual_value`), while:

- the MHE tile shows 0
- the "Oldest Blocked Lot" card shows "—" (no age data)
- status filter chips for HOLD / EXP / ATE / PART show 0 qty (only READY
  is synthesised)
- days-cover insight card stays blank (no daily-consumption data)

The response carries `data_origin` and `data_limits` so callers can
detect the synthetic-facet state without a hard-coded version check.

`VITE_USE_MOCK_DATA=true` keeps the bundled fixture
(`frontend/src/lib/ctpInventoryMaster.json`, 271 lots, 134 items)
serving the same UX offline.
