import ShiftComparisonCard from "@/components/production/ShiftComparisonCard.jsx";

/**
 * Plan Compliance drill — per the artifact this opens a Shift
 * Comparison table (Shift × Plan / Actual / FTQ% / OEE%). Plan_Compliance
 * itself is a leaf KPI in the spec (no drill children), so the panel
 * just renders the per-shift breakdown derived from the same gold_dummy
 * rows already in hand via `rawRows`.
 */
function PlanComplianceDrillPanel({ section, rawRows }) {
  const sectionName =
    { mix: "Mixing", tbm: "TBM", cur: "Curing", stk: "Stock" }[section] ??
    section;
  return <ShiftComparisonCard section={sectionName} rows={rawRows ?? []} />;
}

export default PlanComplianceDrillPanel;
