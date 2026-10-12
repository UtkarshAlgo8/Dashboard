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
