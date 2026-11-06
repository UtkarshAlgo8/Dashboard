/**
 * Uniformity & Balancing trend — which gold rows each time filter reads
 * (Uniformity_KPI_Fetch_Spec §1.3) and the card → KPI map (§2–§6).
 * Pure functions, no network calls.
 */

export const SHIFTS = ["A", "B", "C"];
const SHIFT_GRAN = (s) => `SHIFT ${s}`;
const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

export const MACHINE_TYPE_GROUPS = [
  { id: "MTMS", name: "MTMS", kpi: "Mtms_Uniformity_Production" },
  { id: "TUO", name: "TUO", kpi: "Tuo_Uniformity_Production" },
  { id: "ZF", name: "ZF", kpi: "Zf_Uniformity_Production" },
];

const perMachineYield = (prefix) => ({
  machineYield: `${prefix}_Uniformity_Yield_m`,
  machineTested: `${prefix}_Uniformity_Production`,
});

/**
 * Card (its gold card KPI) → trend views. `kind`:
 *   line     Overall yield line, plant row, x-axis per §1.3
 *   columns  Overall count columns, plant row, x-axis per §1.3
 *   byType   horizontal bars of the type yields, single period
 *   machineBars  vertical bars per machine, single period
 *   machineLines one line per machine over the Overall x-axis
 */
export const UNIFORMITY_TREND_CARDS = {
  Overall_Production_Yield: {
    unit: "%",
    views: [
      { id: "overall", label: "Overall", kind: "line" },
      {
        id: "byType",
        label: "By machine type",
        kind: "byType",
        kpis: [
          ["Mtms_Uniformity_Yield", "MTMS Uniformity"],
          ["Tuo_Uniformity_Yield", "TUO Uniformity"],
          ["Zf_Uniformity_Yield", "ZF Uniformity"],
          ["Zf_Balancing_Yield_o", "ZF Balancing"],
          ["Dbm_Balancing_Yield", "DBM Balancing"],
        ],
      },
    ],
  },
  Overall_Uniformity_Production: {
    unit: "NOS",
    views: [
      { id: "overall", label: "Overall", kind: "columns" },
      { id: "perMachine", label: "Per machine", kind: "machineBars" },
    ],
  },
  Mtms_Uniformity_Yield: {
    unit: "%",
    views: [
      { id: "overall", label: "Overall", kind: "line" },
      {
        id: "perMachine",
        label: "Per machine",
        kind: "machineLines",
        ...perMachineYield("Mtms"),
      },
    ],
  },
  Tuo_Uniformity_Yield: {
    unit: "%",
    views: [
      { id: "overall", label: "Overall", kind: "line" },
      {
        id: "perMachine",
        label: "Per machine",
        kind: "machineLines",
        ...perMachineYield("Tuo"),
      },
    ],
  },
  Zf_Uniformity_Yield: {
    unit: "%",
    views: [
      { id: "overall", label: "Overall", kind: "line" },
      {
        id: "perMachine",
        label: "Per machine",
        kind: "machineLines",
        ...perMachineYield("Zf"),
      },
    ],
  },
  Zf_Balancing_Yield_o: {
    unit: "%",
    views: [{ id: "overall", label: "Overall", kind: "line" }],
  },
  Dbm_Balancing_Yield: {
    unit: "%",
    views: [{ id: "overall", label: "Overall", kind: "line" }],
  },
};

export function isUniformityTrendCard(kpiName) {
  return Object.hasOwn(UNIFORMITY_TREND_CARDS, kpiName);
}

function shiftDays(iso, days) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

function monthStart(iso) {
  return `${iso.slice(0, 7)}-01`;
}

function monthEnd(iso) {
  const [y, m] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

function daysBetween(from, to) {
  return Math.round((Date.parse(to) - Date.parse(from)) / 86400000) + 1;
}

export function monthLabel(iso) {
  return `${MONTH_NAMES[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;
}

/** dd-mm-yyyy for an ISO date. */
export function dayLabel(iso) {
  return `${iso.slice(8, 10)}-${iso.slice(5, 7)}-${iso.slice(0, 4)}`;
}

/**
 * The rows a time filter reads (spec §1.3).
 *
 * @param {{preset: "today"|"month"|"custom", month?: string|null,
 *   from?: string, to?: string, shift?: string, today: string}} f
 * @returns {{
 *   overall: {granularities: string[], from: string, to: string,
 *             lastShifts: number|null, step: "shift"|"day"|"month"},
 *   single: {granularities: string[], date: string, label: string},
 *   isToday: boolean,
 * }}
 */
export function resolveTrendWindow({ preset, month, from, to, shift, today }) {
  const shiftKey = String(shift ?? "all").toUpperCase();
  const pickedShift = SHIFTS.includes(shiftKey) ? shiftKey : null;

  if (preset === "today") {
    if (pickedShift) {
      const g = SHIFT_GRAN(pickedShift);
      return {
        overall: {
          granularities: [g],
          from: shiftDays(today, -29),
          to: today,
          lastShifts: null,
          step: "day",
        },
        single: {
          granularities: [g],
          date: today,
          label: `${dayLabel(today)} · Shift ${pickedShift}`,
        },
        isToday: true,
      };
    }
    return {
      // Last 30 shifts: ten days of A/B/C, plus one spare day for a shift
      // that has not reported yet.
      overall: {
        granularities: SHIFTS.map(SHIFT_GRAN),
        from: shiftDays(today, -10),
        to: today,
        lastShifts: 30,
        step: "shift",
      },
      single: { granularities: ["DAY"], date: today, label: dayLabel(today) },
      isToday: true,
    };
  }

  if (preset === "custom" && from && to) {
    const end = monthStart(to);
    const single = {
      granularities: ["MONTH"],
      date: end,
      label: monthLabel(end),
    };
    if (daysBetween(from, to) <= 31) {
      return {
        overall: {
          granularities: ["DAY"],
          from,
          to,
          lastShifts: null,
          step: "day",
        },
        single,
        isToday: false,
      };
    }
    return {
      overall: {
        granularities: ["MONTH"],
        from: monthStart(from),
        to: end,
        lastShifts: null,
        step: "month",
      },
      single,
      isToday: false,
    };
  }

  // This Month, or a month picked from the dropdown: its days up to today.
  const start = month ? `${month}-01` : monthStart(today);
  const last = monthEnd(start);
  return {
    overall: {
      granularities: ["DAY"],
      from: start,
      to: last < today ? last : today,
      lastShifts: null,
      step: "day",
    },
    single: { granularities: ["MONTH"], date: start, label: monthLabel(start) },
    isToday: false,
  };
}

/** Ordering key for a row's period: date, then shift A < B < C. */
export function periodKey(row) {
  const shift = /^SHIFT ([ABC])$/.exec(row.granularity ?? "");
  return shift ? `${row.date}|${shift[1]}` : row.date;
}

/** Axis label for a period key at the given step. */
export function periodLabel(key, step) {
  const [date, shift] = key.split("|");
  if (step === "month") return monthLabel(date);
  if (step === "shift")
    return `${date.slice(8, 10)}-${date.slice(5, 7)} ${shift}`;
  return dayLabel(date);
}

/**
 * The x-axis periods for the Overall views: every period with a row, in
 * order, trimmed to the last `lastShifts` when set.
 */
export function periodKeys(rows, lastShifts = null) {
  const keys = [...new Set(rows.map(periodKey))].sort();
  return lastShifts ? keys.slice(-lastShifts) : keys;
}

/**
 * Seed the trend modal from Technical's own selection. `today` is the page's
 * data as-of day (not a silent substitute period). A single non-today day or
 * a multi-day range opens as a custom range; a month opens that month
 * (null = the current month, as on Quality); a shift applies to Today only.
 *
 * @param {{ timeRange: {preset?: string, from?: string, to?: string,
 *   month?: string|null}, dateWindow: {from?: string|null, to?: string|null,
 *   granularity?: string|null}, shift: string, today: string }} p
 * @returns {{preset: "today"|"month"|"custom", month?: string|null,
 *   from?: string, to?: string, shift?: string} | null}
 */
export function technicalTrendFilter({ timeRange, dateWindow, shift, today }) {
  const shiftKey = String(shift ?? "all").toLowerCase();
  const todayFilter = { preset: "today", shift: shiftKey };
  if (!timeRange || !today) return null;
  if (timeRange.from && timeRange.to) {
    const { from, to } = dateWindow;
    if (!from || !to) return null;
    return from === to && to === today
      ? todayFilter
      : { preset: "custom", from, to };
  }
  if (timeRange.preset === "today") return todayFilter;
  if (timeRange.preset === "month") {
    const key = timeRange.month ?? today.slice(0, 7);
    return {
      preset: "month",
      month: key === today.slice(0, 7) ? null : key,
    };
  }
  if (dateWindow?.from && dateWindow?.to)
    return { preset: "custom", from: dateWindow.from, to: dateWindow.to };
  return null;
}
