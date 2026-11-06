export const COMPLIANCE_DEFINITIONS = {
  pm: {
    name: "PM Compliance",
    description:
      "Completed PM check sheets ÷ PM check sheets planned up to today, excluding cancelled schedules.",
  },
  daily: {
    name: "Daily Check Sheet Compliance",
    description:
      "Completed check sheets ÷ planned check sheets, excluding cancelled schedules.",
  },
  critical: {
    name: "Critical Parameter Compliance",
    description:
      "Published severe / Severe and Poka Yoke violations ÷ critical-parameter questions checked in submitted process audits. This is a violation rate: lower is better. The Gold percentage is not inverted.",
  },
};

export const COMPLIANCE_COUNT_COLUMNS = [
  ["planned", "Planned"],
  ["complied", "Complied"],
  ["nonComplied", "Non Complied"],
  ["missed", "Missed"],
  ["inProgress", "In Progress"],
];

export const COMPLIANCE_PERIOD_HELP =
  "Select a stored day, month, year or shift. Custom-range percentages are not defined and cannot be averaged or summed.";

/** Collapse only exact stored periods. Never approximate a custom range. */
export function storedCompliancePeriod({ date, granularity, shift, from, to }) {
  if (from || to) {
    if (!from || !to || from > to) return null;
    if (from === to) {
      date = from;
      granularity = "DAY";
    } else {
      const [year, month] = from.split("-").map(Number);
      const lastDay = new Date(Date.UTC(year, month, 0))
        .toISOString()
        .slice(0, 10);
      if (from.endsWith("-01") && to === lastDay) {
        date = from;
        granularity = "MONTH";
      } else if (
        from.endsWith("-01-01") &&
        to === `${from.slice(0, 4)}-12-31`
      ) {
        date = from;
        granularity = "YEAR";
      } else return null;
    }
  }
  if (!date) return null;
  const letter = String(shift ?? "All").toUpperCase();
  const grain = granularity ?? "DAY";
  return {
    date,
    granularity:
      grain === "DAY" && ["A", "B", "C"].includes(letter)
        ? `SHIFT ${letter}`
        : grain,
  };
}

/** Display the selected stored period, never a source-freshness claim. */
export function formatCompliancePeriod(period) {
  const date = period?.date;
  const grain = period?.granularity;
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date))
    return null;
  const parsed = new Date(`${date}T00:00:00Z`);
  if (
    !Number.isFinite(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== date
  )
    return null;
  if (grain === "YEAR")
    return date.endsWith("-01-01") ? date.slice(0, 4) : null;
  if (grain === "MONTH" && !date.endsWith("-01")) return null;
  if (!["DAY", "MONTH", "SHIFT A", "SHIFT B", "SHIFT C"].includes(grain))
    return null;
  const month = parsed.toLocaleString("en-GB", {
    month: "short",
    timeZone: "UTC",
  });
  if (grain === "MONTH") return `${month} ${date.slice(0, 4)}`;
  const label = `${date.slice(8, 10)} ${month} ${date.slice(0, 4)}`;
  return grain.startsWith("SHIFT ")
    ? `${label} · Shift ${grain.slice(-1)}`
    : label;
}

/** Quality/Engineering share the existing KPI tile; values remain Gold's %. */
export function complianceCard(id, result, { period, error, isLoading } = {}) {
  const definition = COMPLIANCE_DEFINITIONS[id];
  const value = result?.value;
  return {
    id,
    n: definition.name,
    v: value == null ? "—" : String(value),
    u: "%",
    target: null,
    status: null,
    presentationTone: "brand",
    sp: null,
    na: false,
    live: true,
    drill: period ? id : null,
    trendApi: false,
    lowerIsBetter: id === "critical",
    metricLabel:
      id === "critical"
        ? "Severe violation rate · lower is better"
        : "Published Gold compliance",
    periodLabel: formatCompliancePeriod(period),
    ragInfo: [
      definition.description,
      "Blue is presentation only, not a pass/fail status. No RAG thresholds or target are defined.",
      "Published Gold value; no parent recomputation or invented target.",
    ],
    emptyReason: !period
      ? COMPLIANCE_PERIOD_HELP
      : error
        ? "Compliance source unavailable"
        : isLoading
          ? "Loading…"
          : "No published data for this period",
  };
}
