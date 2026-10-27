/**
 * CTP Quality — Process tab KPI registry (Process Audit Logbook gold, v1).
 *
 * Source of truth: CTP_Process_Audit_Gold_KPI_v1 "KPI List". Every KPI is
 * stored three times in gold.ctp_gold, once per tyre_type: 'PCR', 'TBR' and
 * 'Both'. 'Both' holds ALL audits (including audits with no tyre type), so
 * the dashboard's "All" maps to 'Both' and never sums PCR + TBR.
 */

export const CTP_QUALITY_TABLE = "gold.ctp_gold";
export const CTP_QUALITY_PLANT = "CHENNAI";
export const CTP_PROCESS_PRODUCT_TYPE = "Process Audit";

/** Dashboard tyre filter → gold tyre_type. */
export const TYRE_TYPE_TO_GOLD = Object.freeze({
  All: "Both",
  PCR: "PCR",
  TBR: "TBR",
});

/** Landing-card KPIs (drill level 1), keyed by the card id the UI uses. */
export const CARD_KPIS = Object.freeze({
  pqr: "PQR",
  audit: "Audit_Compliance",
  mqv: "MQV",
  ndev: "Audit_Deviation",
  cpc: "CPC",
});

/**
 * Drill KPIs (levels 2 and 3). All of them ride along with the landing
 * query: for one period they are at most a few hundred rows, and loading
 * them up front makes every drill click instant.
 */
export const DRILL_KPIS = Object.freeze([
  "PQR_Process",
  "Audit_Violations_Process",
  "PQR_Failed_Checkpoint",
  "Audit_Compliance_Process",
  "Audit_Scheduled_Process",
  "Audit_Completed_Process",
  "Audit_Pending_Process",
  "MQV_Process",
  "MQV_CAPA_Open_Process",
  "MQV_CAPA_Closed_Process",
  "MQV_Violation",
  "Audit_Deviation_Parameter",
  "CPC_Parameter",
]);

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
