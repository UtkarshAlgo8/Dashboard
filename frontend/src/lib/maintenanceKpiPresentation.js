const BRAND_HELP =
  "Blue is presentation only, not a performance status. No RAG threshold or target is defined for this KPI.";

const hasValue = (value) =>
  (typeof value === "number" ||
    (typeof value === "string" && value.trim() !== "")) &&
  Number.isFinite(Number(String(value).replaceAll(",", "")));

/** Maintenance-only display policy; inputs must already belong to the current KPI scope. */
export function maintenanceKpiPresentation(
  kpi,
  { isLoading = false, error = null } = {},
) {
  const supported = Boolean(kpi.drill);
  const available = hasValue(kpi.v);
  const failed = supported && Boolean(error);
  const loading = supported && !failed && Boolean(isLoading) && !available;
  const refreshing = supported && !failed && Boolean(isLoading) && available;
  const showValue = supported && !failed && !loading && available;
  const help = (kpi.ragInfo ?? []).filter(
    (line) => !line.startsWith("Blue is presentation only"),
  );
  return {
    ...kpi,
    presentationTone: "brand",
    loadingPresentation: "skeleton",
    showProgress: false,
    showPeriodWhenEmpty: true,
    cardMinHeight: 160,
    alignMetrics: true,
    isLoading: loading,
    isRefreshing: refreshing,
    v: showValue ? kpi.v : "—",
    subLine: showValue ? (kpi.subLine ?? null) : null,
    trendPct: showValue ? kpi.trendPct : null,
    sp: showValue ? kpi.sp : null,
    ragInfo: [
      ...help,
      BRAND_HELP,
      ...(!supported && kpi.emptyReason ? [kpi.emptyReason] : []),
      ...(failed
        ? [`Data unavailable: ${error.message ?? "Request failed"}`]
        : []),
    ],
    emptyReason: !supported
      ? kpi.emptyReason
      : failed
        ? "Data unavailable · Open details"
        : loading
          ? "Loading…"
          : "No published data for this scope",
  };
}
