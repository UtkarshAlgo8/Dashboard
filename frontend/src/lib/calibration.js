export const CALIBRATION_STATUSES = {
  overdue: { label: "Overdue", color: "error" },
  dueThisWeek: { label: "Due this week", color: "warning" },
  ok: { label: "OK", color: "success" },
};

export const CALIBRATION_SCOPE_HELP =
  "Uses today in IST, independent of the dashboard date and shift filters.";

/** Date-only formatting avoids shifting a due date in the browser's local time zone. */
export function calibrationDate(date) {
  const month = new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    timeZone: "UTC",
  });
  return `${date.slice(8, 10)}-${month}-${date.slice(0, 4)}`;
}

/** A published zero is valid; an unavailable/empty source must not become zero. */
export function calibrationCard(data, { error, isLoading } = {}) {
  const available = !error && data?.machines.length > 0;
  return {
    id: "calibration",
    n: "Calibration Due",
    v: available ? data.summary.dueThisWeek : "—",
    u: "machines",
    presentationTone: "neutral",
    loadingPresentation: "skeleton",
    showProgress: false,
    status: null,
    target: null,
    isLoading: isLoading && !data,
    drill: "calibration",
    trendApi: false,
    periodLabel: data
      ? `As of ${calibrationDate(data.context.asOfDate)} · IST`
      : "Today · IST",
    metricLabel: "Due in 0–7 days",
    showPeriodWhenEmpty: true,
    subLine: available
      ? { text: `${data.summary.overdue} overdue`, alert: true }
      : null,
    ragInfo: [
      "Main count: machines due today through 7 days from today, inclusive.",
      "Overdue: due date before today. Due this week: 0–7 days left. OK: more than 7 days left.",
      CALIBRATION_SCOPE_HELP,
    ],
    emptyReason: error
      ? "Calibration source unavailable"
      : isLoading
        ? "Loading…"
        : "No calibration machines published for BTP",
  };
}

/** Retain the source due-date order after applying the local status filter. */
export function calibrationRows(data, status = "all") {
  return (data?.machines ?? [])
    .filter((machine) => status === "all" || machine.status === status)
    .map((machine) => [
      machine.machineNo,
      machine.machineName || "—",
      machine.instruments ?? "—",
      calibrationDate(machine.dueDate),
      machine.daysLeft,
      CALIBRATION_STATUSES[machine.status].label,
    ]);
}
