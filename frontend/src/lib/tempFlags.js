/**
 * TEMPORARY switches. Remove a flag (and its call sites) once the change it
 * guards is no longer wanted.
 */

// SKU Plan Fulfillment is shown as a heading-only card, with no data, trend or
// drill, until the plan feed is ready. Set to false to restore the real card.
export const TEMP_DISABLE_SKU_PLAN = true;

/** The id of the SKU Plan Fulfillment (Plan_Compliance) KPI card. */
export const SKU_PLAN_KPI_ID = "comp";

// Curing SKU Fulfillment reads a static extract of the gold rows
// (public/temp/curing-sku-fulfilment.json) until gold carries the
// *_SKU_Fulfilment_* KPIs. Set to false to read live gold through
// /dashboard/kpi-data instead, then delete the JSON and
// api/skuFulfilmentSnapshot.js.
export const TEMP_SKU_FULFILMENT_FROM_JSON = true;
