/**
 * Period math for the CTP Quality Process tab.
 *
 * The page only offers views that map 1:1 to a stored gold grain (Day,
 * Shift-of-day, Month, Year). PQR and CPC are averages, so a free date range
 * could not be rebuilt from daily rows without being wrong.
 */

/** Cards show this many periods in their sparkline (current one included). */
export const SPARK_PERIODS = 5;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const VIEW_GRAINS = new Set(["DAY", "MONTH", "YEAR"]);

/** Today's date in Asia/Kolkata as yyyy-mm-dd. */
export function todayInIst(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function isIsoDate(value) {
  if (typeof value !== "string" || !ISO_DATE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

function shiftIso(iso, { days = 0, months = 0, years = 0 }) {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(y + years, m - 1 + months, d + days));
  return date.toISOString().slice(0, 10);
}

/** First day of the period that contains `iso`. */
export function periodStart(iso, grain) {
  if (grain === "MONTH") return `${iso.slice(0, 7)}-01`;
  if (grain === "YEAR") return `${iso.slice(0, 4)}-01-01`;
  return iso;
}

/** Start of the period `n` periods before the one starting at `anchor`. */
export function periodsBack(anchor, grain, n) {
  if (grain === "MONTH") return shiftIso(anchor, { months: -n });
  if (grain === "YEAR") return shiftIso(anchor, { years: -n });
  return shiftIso(anchor, { days: -n });
}

/**
 * Resolve the UI's selection into the gold filter.
 *
 * @param {{granularity?: string, date?: string, shift?: string}} input
 * @returns {{ grain: string, goldGranularity: string, anchor: string,
 *   sparkFrom: string } | { error: string }}
 */
export function resolvePeriod({ granularity, date, shift } = {}) {
  const grain = String(granularity || "DAY").toUpperCase();
  if (!VIEW_GRAINS.has(grain)) {
    return { error: `Unsupported granularity: ${granularity}` };
  }
  if (!isIsoDate(date)) return { error: "`date` must be yyyy-mm-dd." };

  // Shifts exist per day only; Month and Year views are always all shifts.
  let goldGranularity = grain;
  const s = String(shift || "All").toUpperCase();
  if (grain === "DAY" && s !== "ALL") {
    if (!["A", "B", "C"].includes(s)) {
      return { error: `Unsupported shift: ${shift}` };
    }
    goldGranularity = `SHIFT ${s}`;
  }

  const anchor = periodStart(date, grain);
  return {
    grain,
    goldGranularity,
    anchor,
    sparkFrom: periodsBack(anchor, grain, SPARK_PERIODS - 1),
  };
}

/**
 * True when the period starting at `anchor` is still open: it contains today
 * (IST) or lies in the future. Open periods can still gain rows.
 */
export function isCurrentPeriod(anchor, grain, today = todayInIst()) {
  return anchor >= periodStart(today, grain);
}
