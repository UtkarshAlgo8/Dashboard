import { canonicalizeSubSection, denanDimension } from "./dashboardRowScopes.js";
import { DOWNTIME_REASONS } from "./downtime.js";

export const CTP_TOTAL_DOWNTIME_KPI = "Total_Downtime";

export function usesCtpProductionDowntime(plantId, category) {
  return (
    ["chennai", "ctp"].includes(
      String(plantId ?? "")
        .trim()
        .toLowerCase(),
    ) && String(category ?? "").toUpperCase() === "P"
  );
}

/**
 * Apply the same strict equipment dimensions as the CTP stored-total query.
 * Unlike landing KPI reads, reason totals must not borrow rows with missing
 * section/sub-section/tyre attribution when one of those filters is selected.
 */
export function scopeCtpDowntimeReasonRows(
  rows,
  { section, subSection = null, tyreType = null } = {},
) {
  if (!Array.isArray(rows)) return [];
  const selectedSection = String(section ?? "").trim();
  const selectedSubSection = canonicalDimension(subSection);
  const selectedTyreType = String(tyreType ?? "")
    .trim()
    .toUpperCase();

  return rows.filter((row) => {
    if (
      selectedSection &&
      String(denanDimension(row?.section) ?? "").trim() !== selectedSection
    ) {
      return false;
    }
    if (
      selectedSubSection &&
      canonicalDimension(row?.sub_section) !== selectedSubSection
    ) {
      return false;
    }
    if (selectedTyreType && selectedTyreType !== "ALL") {
      const rowTyreType = String(denanDimension(row?.tyre_type) ?? "")
        .trim()
        .toUpperCase();
      const matchesSelectedLine = rowTyreType === selectedTyreType;
      const isSharedLine =
        (selectedTyreType === "PCR" || selectedTyreType === "TBR") &&
        rowTyreType === "BOTH";
      if (!matchesSelectedLine && !isSharedLine) return false;
    }
    return true;
  });
}

function canonicalDimension(value) {
  const dimension = denanDimension(value);
  if (dimension == null) return null;
  return String(canonicalizeSubSection(dimension)).trim().toLowerCase();
}

/** Sum CTP's reason leaves without converting machine-minutes to averages. */
export function sumCtpDowntimeReasons(
  rows,
  { section, granularity, selectedMachine = null } = {},
) {
  if (!Array.isArray(rows)) return [];
  const totals = new Map();
  for (const row of rows) {
    if (section && row.section !== section) continue;
    if (granularity && row.granularity !== granularity) continue;
    if (selectedMachine && row.machine !== selectedMachine) continue;
    if (!DOWNTIME_REASONS.includes(row.kpi_name)) continue;
    const value = numberOrNull(row.actual_value);
    if (value == null) continue;
    totals.set(row.kpi_name, (totals.get(row.kpi_name) ?? 0) + value);
  }
  return DOWNTIME_REASONS.map((reason) => ({
    reason,
    sum: totals.get(reason) ?? 0,
  })).sort((a, b) => b.sum - a.sum);
}

function numberOrNull(value) {
  if (value == null) return null;
  const number = typeof value === "number" ? value : Number.parseFloat(value);
  return Number.isFinite(number) ? number : null;
}

/** A separate stored-total feed; reason rows remain available for the drill. */
export function ctpDowntimePayload({
  plantId,
  category,
  context,
  dates,
  withBaseline,
}) {
  if (!usesCtpProductionDowntime(plantId, category)) return null;
  const { section, sub_section, tyre_type, granularity } = context;
  return {
    plantId,
    context: {
      section,
      ...(sub_section ? { sub_section } : {}),
      ...(tyre_type ? { tyre_type } : {}),
      granularity: String(granularity ?? "")
        .toUpperCase()
        .startsWith("SHIFT")
        ? granularity
        : "DAY",
    },
    ...dates,
    drillKpis: [CTP_TOTAL_DOWNTIME_KPI],
    drillOnly: true,
    withBaseline,
    limit: 10000,
  };
}
