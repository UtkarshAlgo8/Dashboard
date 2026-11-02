/**
 * CTP Quality — KPI registry for the Process and Product tabs.
 *
 * Source of truth: CTP_Quality_Gold_KPI_Frontend_Handoff ("KPI Catalog" and
 * "Drill Down Map"). Every KPI is stored three times in gold.ctp_gold, once
 * per tyre_type: 'PCR', 'TBR' and 'Both'. 'Both' holds ALL rows (including
 * rows with no tyre type), so the dashboard's "All" maps to 'Both' and never
 * sums PCR + TBR.
 */

export const CTP_QUALITY_TABLE = "gold.ctp_gold";
export const CTP_QUALITY_PLANT = "CHENNAI";
export const CTP_QUALITY_DEPARTMENT = "Quality";

/** Dashboard tyre filter → gold tyre_type. */
export const TYRE_TYPE_TO_GOLD = Object.freeze({
  All: "Both",
  PCR: "PCR",
  TBR: "TBR",
});

/**
 * Per tab: the gold `category`, the landing-card KPIs (drill level 1, keyed
 * by the card id the UI uses), the card companions (extra values a card
 * shows for the selected period only), the drill KPIs (levels 2 and 3) and
 * the dated drill KPIs: logbook violation rows whose date is the violation
 * date. Those are read at DAY grain (or the selected shift) over the whole
 * period, so the drill can show when each violation happened.
 *
 * Drill KPIs ride along with the landing query: for one period they are a
 * few hundred to a few thousand rows, and loading them up front makes every
 * drill click instant. KPIs still "waiting for silver" are listed too, so
 * their cards light up on their own once gold has rows.
 */
export const CTP_QUALITY_TABS = Object.freeze({
  process: {
    category: "Process",
    cards: {
      pqr: "PQR",
      audit: "Audit_Compliance",
      mqv: "MQV",
      ndev: "Audit_Deviation",
      cpc: "CPC",
      ftq: "FTQ",
      spr: "SPR",
      capa: "Open_CAPA_NC",
    },
    companions: {
      capa: { overdue: "Open_CAPA_NC_Overdue" },
    },
    drills: [
      "PQR_Process",
      "Audit_Violations_Process",
      "PQR_Failed_Checkpoint",
      "Audit_Compliance_Process",
      "Audit_Scheduled_Process",
      "Audit_Completed_Process",
      "Audit_Pending_Process",
      "Audit_Scheduled_MTD_Process",
      "Audit_Completed_MTD_Process",
      "Audit_Pending_MTD_Process",
      "MQV_Process",
      "MQV_CAPA_Open_Process",
      "MQV_CAPA_Closed_Process",
      "CPC_Parameter",
      "FTQ_Inspected",
      "FTQ_Rejected",
      "FTQ_SKU",
      "SPR_Production",
      "SPR_Scrap",
      "SPR_Rework",
      "SPR_SKU",
      "CAPA_NC_Open",
      "CAPA_NC_Overdue",
      "CAPA_NC_Age_Days",
    ],
    dated: ["MQV_Violation", "Audit_Deviation_Parameter"],
  },
  product: {
    category: "Product",
    cards: {
      uy: "Uniformity_Yield",
      fvi: "First_Line_VI_Yield",
      sl: "Second_Line_Yield",
      eg: "E_Grade_Count",
      sc: "Product_Scrap_Pct",
      gtw: "GT_Weight_Within_1pct",
      dbm: "DBM_Yield",
      dy: "Dispatch_Yield",
      oe: "OE_Yield",
      bay: "Bay_Area_Inspection_Yield",
    },
    companions: {
      gtw: {
        within2: "GT_Weight_Within_2pct",
        within3: "GT_Weight_Within_3pct",
      },
    },
    drills: [
      "Uniformity_Yield_Machine",
      "Uniformity_Tested_Machine",
      "Uniformity_Passed_Machine",
      "Uniformity_Yield_SKU",
      "First_Line_VI_Yield_SKU",
      "Second_Line_Yield_SKU",
      "Second_Line_Inspected_SKU",
      "Second_Line_Defect",
      "E_Grade_Machine_SKU",
      "Product_Scrap_Pct_SKU",
      "Product_Scrap_Defect",
      "GT_Weight_Machine",
      "GT_Weight_Within_2pct_Machine",
      "GT_Weight_Within_3pct_Machine",
      "GT_Weight_SKU",
      "GT_Weight_Within_2pct_SKU",
      "GT_Weight_Within_3pct_SKU",
      "GT_Weighed_SKU",
      "GT_Within_1pct_SKU",
      "GT_Within_2pct_SKU",
      "GT_Within_3pct_SKU",
      "DBM_Yield_Machine_SKU",
      "Dispatch_Yield_SKU",
      "OE_Yield_SKU",
      "OE_Graded_SKU",
      "OE_Passed_SKU",
      "OE_Yield_OEM",
      "Bay_Area_Checked",
      "Bay_Area_Rejections",
      "Bay_Area_Dispatched",
      "Bay_Area_Rejection_Reason",
    ],
  },
});

/** Landing KPIs of both tabs: the only names the trend endpoint accepts. */
export const TREND_KPIS = Object.freeze(
  new Set(
    Object.values(CTP_QUALITY_TABS).flatMap((tab) => Object.values(tab.cards)),
  ),
);

/** Display order of the process groups the gold contracts emit. */
export const PROCESS_ORDER = Object.freeze([
  "RMS",
  "Autochemical / Weighing",
  "Mixing",
  "Stock Preparation",
  "Building",
  "Curing",
  "Final Inspection / PDI",
  "Unassigned",
]);
