# BTP SPC — PAINTING measurements

## Verified source contract

- Weights: `silver.fct_paintingdata.weight`; reading identity/time: `record_id`, `event_time`.
- Machine: `wc_id = silver.dim_wcmaster.record_id` → `name`.
- SAP recipe: `recipe_id = silver.dim_recipemaster.record_id` → `description` (not the human-readable recipe `name`).
- Joins also match `plant_code`, `source_machine` and `database_name`; restrict to BTP.
- Dimension versions are ranked by ingestion time per full identity before joining, preventing multiplication of measurements.
- Machine names are compared case-insensitively; no guessed numeric-ID mapping is stored.

Supported gold machine names:
- `GISLOTICA-PAINTINGMACHINE`
- `NEWCHINAPAINTING`
- `OLDCHINAPAINTING`
- `MR_PAINTING01` (both observed work-centre IDs resolve through the master)
- `MANUAL PAINTING`

Parameter: `Painted Tyre Weight`.

## Charts and limits

The normal live SPC path is used: latest 1,500 readings, subgroups of five, latest 60 subgroup means on the overview, X/R charts, histogram, and Nelson alerts in detail. Existing shift-hour filtering applies. Timestamp ties use record ID consistently in overview and detail.

Published capability values/statuses remain gold-backed. PAINTING gold UCL/LCL baselines are **recipe-specific**, unlike legacy source baselines; their index key includes machine + SAP recipe + parameter. Limits are never taken from another recipe. Other sources retain their existing machine + parameter lookup.

## Setpoint target

The setpoint table is now available. Detail readings left-join the trimmed SAP code from `dim_recipemaster.description` to `silver.dim_tyre_spec_weight.sap_code`, scoped to `plant_code='BTP'` and `database_name='sap'`, and expose `spec_weight` as the setpoint. Do not join the SAP table's database/source identity to the MES fact's identity: those legitimately differ.

Select the most recent ingestion per SAP code. Identical duplicate latest specs collapse to one row; conflicting, null or nonpositive latest weights yield no target rather than guessing or falling back to an older spec. The left join retains all measured readings when a SAP code has no usable setpoint. Overview/count queries omit the setpoint join because they only need measured weights.

The histogram draws the verified target line using the existing positive-setpoint calculation. Per user confirmation, this is **target only**: the table supplies no verified tolerance/unit, so LSL/USL remain absent. Gold Cp/Cpk/Pp/Ppk, X/R calculations, recipe-specific control limits and Nelson alerts are unchanged.

## Validation and deployment

```sh
node --test backend/src/quality/spc.test.js backend/src/quality/spc/*.test.js
```

SQL execution tests cover dimension versions, foreign plants/source identities, recipe isolation, null weights, deterministic ties, shift C, recipe-specific limits and overview/detail consistency. Setpoint tests cover SAP-vs-MES identity, missing/invalid specs, duplicate latest records, conflicting latest values and SAP-code whitespace.

Read-only live verification returned all five machines on the unfiltered PAINTING board. A GISLOTICA recipe detail returned 1,500 readings, 300 X/R points, histogram data, gold capability and the matching valid gold UCL/LCL pair. With the setpoint join enabled, SAP code `1325216814085SUTR0` returns target `8.56` without changing the reading count or control limits; LSL/USL remain null.

Normal backend deployment is sufficient for this change. SPC source/reading/response cache keys include a new source version, so no global Redis flush is required. Browser SPC request caching is short-lived; reload after deployment to discard any old response held in the current page.
