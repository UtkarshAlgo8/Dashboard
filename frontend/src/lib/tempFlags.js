/**
 * TEMPORARY switches. Remove a flag (and its call sites) once the change it
 * guards is no longer wanted.
 */

// SKU Plan Fulfillment is shown as a heading-only card, with no data, trend or
// drill, until the plan feed is ready. Set to false to restore the real card.
export const TEMP_DISABLE_SKU_PLAN = true;

/** The id of the SKU Plan Fulfillment (Plan_Compliance) KPI card. */
export const SKU_PLAN_KPI_ID = "comp";
