/* eslint-disable */
/**
 * Shared primitives for the Engineering Head dashboard's Overview +
 * Reliability tabs (spec 16/17). Self-contained, inline-styled — same
 * convention as pages/quality/QualityDashboard.jsx: local Card/DTable/
 * Breadcrumb/TrendIcon, a local `C` theme-color object (values copied from
 * QualityDashboard.jsx so the visual language matches), fetch-in-useEffect
 * drill panels. Backend wiring is real (not mock) — see api/engineering.js.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import Highcharts from "highcharts";
import HighchartsReactImport from "highcharts-react-official";
import { getReliabilityKpiChildren } from "@/api/engineering.js";
import JKLoader from "@/components/JKLoader.jsx";
import CardDownloadButton from "@/components/CardDownloadButton.jsx";
import { toExportTable, toFileSlug } from "@/lib/tableExport.js";
import { MACHINE_NAME_COLUMN } from "./machineName.js";
import {
  meanRepairMinutes,
  pooledBreakdownPct,
  pooledDowntime,
  pooledMtbf,
} from "@/lib/reliabilityPooled.js";

// highcharts-react-official 3.x ships as a UMD bundle; normalize the
// CJS-interop shape (mirrors components/trend/LineChart.jsx).
const HighchartsReact = HighchartsReactImport?.default ?? HighchartsReactImport;

/* ─── LIGHT THEME (copied from QualityDashboard.jsx's `C`) ─── */
export const C = {
  bg: "#F3F4F8",
  cd: "#FFFFFF",
  c2: "#F7F8FA",
  bd: "#E0E3EA",
  tx: "#1A1D26",
  md: "#4A5168",
  mu: "#8891A5",
  ac: "#E8651A",
  aL: "rgba(232,101,26,.07)",
  aB: "rgba(232,101,26,.28)",
  rowAlt: "rgba(0,119,182,0.04)",
  thBg: "#EAEDF3",
  tl: "#1A9A3E",
  bl: "#2563EB",
  rd: "#DC2626",
  am: "#CA8A04",
  gn: "#1A9A3E",
  pp: "#7C3AED",
  cy: "#0D9488",
  sh: "0 1px 3px rgba(0,0,0,.06), 0 2px 8px rgba(0,0,0,.04)",
  r: 8,
};

/** Today in IST as `YYYY-MM-DD` (mirrors QualityDashboard's todayInIST). */
export function todayInIST() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const y = parts.find((p) => p.type === "year").value;
  const m = parts.find((p) => p.type === "month").value;
  const d = parts.find((p) => p.type === "day").value;
  return `${y}-${m}-${d}`;
}

// Same abbreviations lib/timeRange.js uses for the header's month dropdown.
// Spelled out rather than via Intl: en-GB renders September as "Sept", and
// the label should read the same everywhere regardless of the host's ICU data.
const MONTH_LABELS = [
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

/** "2026-09-14" -> "14 Sep 2026". Returns the input unchanged if unparseable. */
export function formatDayLabel(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso));
  if (!m) return String(iso);
  const month = MONTH_LABELS[Number(m[2]) - 1];
  return month ? `${Number(m[3])} ${month} ${m[1]}` : String(iso);
}

/**
 * "2026-09" (or "2026-09-14") -> "Sep 2026". The label for a MONTH-grain
 * period: the page reads one published MONTH row, so naming a day range
 * would misdescribe what is on screen.
 */
export function formatMonthLabel(monthKey) {
  const m = /^(\d{4})-(\d{2})/.exec(String(monthKey));
  if (!m) return String(monthKey);
  const month = MONTH_LABELS[Number(m[2]) - 1];
  return month ? `${month} ${m[1]}` : String(monthKey);
}

/** "2026-09" -> { from: "2026-09-01", to: "2026-09-30" }. */
export function monthRangeFromKey(monthKey) {
  const [yStr, mStr] = String(monthKey).split("-");
  const y = Number(yStr);
  const m = Number(mStr);
  // Day 0 of the NEXT month is the last day of this one.
  const lastDay = new Date(y, m, 0).getDate();
  const pad = (n) => String(n).padStart(2, "0");
  return { from: `${y}-${pad(m)}-01`, to: `${y}-${pad(m)}-${pad(lastDay)}` };
}

/**
 * Today in IST, truncated to the first of the month. Every MONTH row in gold
 * is dated the 1st, so this doubles as "the current month's MONTH-row date".
 */
export function currentMonthKeyInIST() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date());
  const y = parts.find((p) => p.type === "year").value;
  const m = parts.find((p) => p.type === "month").value;
  return `${y}-${m}-01`;
}

/**
 * The 1st of the month `offset` months from the current IST month, e.g.
 * -11 -> "2025-10-01". Used for the trend modal's rolling window.
 */
export function monthKeyShiftedInIST(offset) {
  const [y, m] = currentMonthKeyInIST().split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + offset, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

/** number|null -> "1,234.56" | "—" */
export function fmtNum(v, decimals = 0) {
  if (v == null || Number.isNaN(v)) return "—";
  return Number(v).toLocaleString("en-IN", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/** minutes|null -> "1,234 min (20.6 hrs)" | "—" */
export function fmtMinHrs(v, decimals = 0) {
  if (v == null || Number.isNaN(v)) return "—";
  return `${fmtNum(v, decimals)} min (${fmtNum(v / 60, 1)} hrs)`;
}

export const GRADE_COLOR = {
  A: C.gn,
  B: C.bl,
  C: C.am,
  D: C.rd,
  Unmapped: C.mu,
};

/** A/B/C/D/Unmapped machine-category pill. */
export function GradeChip({ grade }) {
  if (grade == null || grade === "") return <span>{"—"}</span>;
  const col = GRADE_COLOR[grade] || C.mu;
  return (
    <span
      style={{
        padding: "2px 8px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 700,
        background: col + "18",
        color: col,
        whiteSpace: "nowrap",
      }}
    >
      {grade}
    </span>
  );
}

export function TrendIcon({ size = 13 }) {
  return (
    <svg
      width={size}
      height={size * 0.85}
      viewBox="0 0 13 11"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="1,8.5 4,5.5 7,7 10,3 12,4" />
    </svg>
  );
}

export function ChevronIcon({ open }) {
  return (
    <svg
      width={14}
      height={14}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{
        transform: open ? "rotate(180deg)" : "none",
        transition: "transform .15s ease",
      }}
    >
      <polyline points="6,9 12,15 18,9" />
    </svg>
  );
}

/** Card shell — mirrors QualityDashboard.jsx's local `Card` (no export menu). */
export function Card({ title, children, accent, style: s }) {
  return (
    <div
      style={{
        background: C.cd,
        borderRadius: 10,
        border: "1px solid " + C.bd,
        padding: "14px 16px",
        boxShadow: C.sh,
        minWidth: 0,
        overflow: "hidden",
        borderTop: accent ? "3px solid " + accent : undefined,
        position: "relative",
        ...s,
      }}
    >
      {title && (
        <div
          style={{
            fontSize: 15,
            fontWeight: 700,
            color: accent || C.bl,
            textTransform: "uppercase",
            letterSpacing: ".6px",
            marginBottom: 8,
          }}
        >
          {title}
        </div>
      )}
      {children}
    </div>
  );
}

/** Breadcrumb trail — mirrors QualityDashboard.jsx's local `Breadcrumb`. */
export function Breadcrumb({ path, onNav }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        fontSize: 13,
        color: C.mu,
        marginBottom: 8,
        flexWrap: "wrap",
      }}
    >
      {path.map((p, i) => (
        <span key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span
            onClick={() => onNav && i < path.length - 1 && onNav(i)}
            style={{
              cursor: onNav && i < path.length - 1 ? "pointer" : "default",
              color: i === path.length - 1 ? C.tx : C.mu,
              fontWeight: i === path.length - 1 ? 700 : 400,
              textDecoration:
                onNav && i < path.length - 1 ? "underline" : "none",
            }}
          >
            {p}
          </span>
          {i < path.length - 1 && <span style={{ color: C.bd }}>{"›"}</span>}
        </span>
      ))}
    </div>
  );
}

/**
 * Sortable, clickable data table — mirrors QualityDashboard.jsx's local
 * `DTable`, generalized to take {label, render} column descriptors and an
 * optional row click handler (drill navigation).
 */
export function DTable({
  columns,
  rows,
  getRowKey,
  onRowClick,
  emptyMessage,
  // Optional: the getRowKey value of the row that is currently drilled into.
  // Matched against getRowKey, so callers do not need a second key scheme.
  selectedRowKey,
  // Base file name for the table's PDF / Excel download.
  downloadName = "engineering-table",
}) {
  const tableRef = useRef(null);
  const [sc, setSc] = useState(null);
  const [sd, setSd] = useState("desc");

  const disp = useMemo(() => {
    if (sc == null) return rows;
    const col = columns[sc];
    return [...rows].sort((a, b) => {
      const av = col.sortValue ? col.sortValue(a) : a[col.key];
      const bv = col.sortValue ? col.sortValue(b) : b[col.key];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      const c =
        typeof av === "number" && typeof bv === "number"
          ? av - bv
          : String(av).localeCompare(String(bv));
      return sd === "asc" ? c : -c;
    });
  }, [rows, sc, sd, columns]);

  const onH = (i) => {
    if (sc === i) setSd((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSc(i);
      setSd("desc");
    }
  };

  if (!rows || rows.length === 0) {
    return (
      <div
        style={{ padding: 16, textAlign: "center", color: C.mu, fontSize: 13 }}
      >
        {emptyMessage || "No data for this scope."}
      </div>
    );
  }

  // Exported in the order on screen, so a header-click sort carries over.
  const exported = toExportTable(columns, disp, rows);

  return (
    <div>
      <div
        style={{ display: "flex", justifyContent: "flex-end", marginBottom: 6 }}
      >
        <CardDownloadButton
          cardRef={tableRef}
          headers={exported.headers}
          rows={exported.rows}
          filename={toFileSlug(downloadName)}
          sx={{ width: 26, height: 26, borderRadius: 1 }}
        />
      </div>
      <div
        ref={tableRef}
        style={{
          overflowX: "auto",
          border: "1px solid " + C.bd,
          borderRadius: 10,
          maxHeight: 360,
        }}
      >
        <table
          style={{
            width: "100%",
            borderCollapse: "separate",
            borderSpacing: 0,
            fontSize: 13,
          }}
        >
          <thead>
            <tr>
              {columns.map((col, i) => {
                const active = sc === i;
                return (
                  <th
                    key={col.key || i}
                    onClick={() => onH(i)}
                    title="Click to sort"
                    style={{
                      textAlign: col.align || "center",
                      padding: "8px 10px",
                      background: C.thBg,
                      color: active ? C.bl : C.tx,
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: ".6px",
                      borderBottom: "2px solid " + C.bd,
                      borderRight:
                        i === columns.length - 1 ? "none" : "1px solid " + C.bd,
                      fontSize: 11,
                      cursor: "pointer",
                      userSelect: "none",
                      whiteSpace: "nowrap",
                      position: "sticky",
                      top: 0,
                    }}
                  >
                    {col.label}
                    <span
                      style={{
                        marginLeft: 4,
                        fontSize: 9,
                        opacity: active ? 1 : 0.3,
                      }}
                    >
                      {active ? (sd === "asc" ? "▲" : "▼") : "⇅"}
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {disp.map((row, ri) => {
              const rowKey = getRowKey ? getRowKey(row, ri) : ri;
              const selected =
                selectedRowKey != null && rowKey === selectedRowKey;
              return (
                <tr
                  key={rowKey}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  style={{
                    background: selected
                      ? C.aL
                      : ri % 2 === 0
                        ? C.cd
                        : C.rowAlt,
                    cursor: onRowClick ? "pointer" : "default",
                    boxShadow: selected ? `inset 3px 0 0 ${C.ac}` : undefined,
                  }}
                >
                  {columns.map((col, ci) => (
                    <td
                      key={col.key || ci}
                      style={{
                        padding: "8px 10px",
                        borderBottom: "1px solid " + C.bd,
                        borderRight:
                          ci === columns.length - 1
                            ? "none"
                            : "1px solid " + C.bd,
                        textAlign: col.align || "center",
                        color: C.tx,
                        fontWeight: ci === 0 ? 600 : 400,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {col.render
                        ? col.render(row, rows)
                        : (row[col.key] ?? "—")}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ─── DRILL LEVEL CONFIGS ─── */
// Ancestor dim (groupBy) -> the kpi-children query filter param the NEXT
// level uses to pin it. Product_type is Loss Tree's category pin (comes
// from the pie click, not a table row).
const GROUP_TO_PARAM = {
  status: "status",
  section: "section",
  machine: "machine",
  sub_section: "subSection",
  product_type: "productType",
};

/**
 * Rule 5: "5 disciplines, fixed list: Mechanical · Electronics · Electrical ·
 * Instrumentation · Utility. Show all five with an em-dash where empty."
 *
 * A discipline with no breakdown in the period has no published row, so the
 * API returns four rows and the fifth silently vanishes — which reads as "we
 * have four disciplines", not "this one was clean". Levels grouped by
 * `sub_section` pad up to the fixed five; the padded rows carry no measures,
 * so every column renders its own em-dash.
 */
export const DISCIPLINES = [
  "Mechanical",
  "Electronics",
  "Electrical",
  "Instrumentation",
  "Utility",
];

/**
 * "Share of parent" — the spec lists it as a drill column at four levels and
 * names it in rule 3 as one of the five the UI is allowed to calculate.
 *
 * It is always a share of an ADDITIVE measure (downtime minutes, lost time),
 * never of a ratio: the rows at one drill level are exactly the children of
 * the level above, so their values sum to the parent and a plain percentage
 * of that sum is the share. Sharing a Breakdown % or an MTBF would be rule 8
 * arithmetic on a rate, so no share column is ever built over one.
 *
 * `sortValue` is the raw measure — share is monotonic in it, so the column
 * sorts without the header having to recompute anything.
 */
function shareColumn(valueKey, label = "Share") {
  return {
    key: `share_of_${valueKey}`,
    label,
    align: "right",
    sortValue: (r) => r[valueKey],
    render: (r, rows) => {
      const total = rows.reduce((sum, row) => sum + (row[valueKey] ?? 0), 0);
      const value = r[valueKey];
      if (value == null || !total) return "—";
      return fmtNum((value / total) * 100, 1) + "%";
    },
  };
}

/**
 * @param {string} machinesKpi - `BreakdownMachines_*` for this level, where the
 *   spec publishes one (grade and grade×section only — deeper levels have no
 *   such file, and at machine level the count is 1 by definition).
 */
function breakdownLevel(groupBy, groupLabel, pctKpi, minKpi, machinesKpi) {
  const columns = [
    {
      key: pctKpi,
      label: "Breakdown %",
      align: "right",
      render: (r) => fmtNum(r[pctKpi], 2) + "%",
    },
    {
      key: minKpi,
      label: "Downtime",
      align: "right",
      // The ETL publishes a 0% breakdown row for a machine that ran clean
      // but no downtime row at all, which rendered as "0.00% … —". A
      // published 0% IS 0 minutes by definition, so show it rather than
      // leaving a gap — this reads the stored 0, it does not invent one.
      render: (r) => fmtMinHrs(r[minKpi] ?? (r[pctKpi] === 0 ? 0 : null)),
    },
  ];
  if (machinesKpi) {
    columns.push({
      key: machinesKpi,
      label: "Machines",
      align: "right",
      render: (r) => fmtNum(r[machinesKpi]),
    });
  }
  columns.push(shareColumn(minKpi));
  return {
    groupBy,
    groupLabel,
    kpiNames: machinesKpi ? [pctKpi, minKpi, machinesKpi] : [pctKpi, minKpi],
    columns,
  };
}

/**
 * Turn a level into its DATE-WISE form: keyed by (its dimension, date) and
 * read at DAY grain over the whole period the panel is showing, so the last
 * table answers WHEN each failure happened rather than only its total for
 * the month.
 *
 * The rows are still published values, one per (failure, day) — nothing is
 * summed or averaged here, so the Breakdown % column stays a stored rate at
 * its own grain (rule 8). The daily rows of one failure therefore do NOT
 * add up to the monthly Breakdown % on the level above; the Downtime column,
 * being additive, does.
 */
function dateWise(level) {
  return {
    ...level,
    groupBy: `${level.groupBy},date`,
    groupLabels: [level.groupLabel, "Date"],
    granularity: "DAY",
  };
}

export const BREAKDOWN_LEVELS = [
  breakdownLevel(
    "status",
    "Machine Category",
    "Breakdown_Pct_Grade",
    "BreakdownMin_Grade",
    "BreakdownMachines_Grade",
  ),
  breakdownLevel(
    "section",
    "Section",
    "Breakdown_Pct_Grade_Section",
    "BreakdownMin_Grade_Section",
    "BreakdownMachines_Grade_Section",
  ),
  breakdownLevel("machine", "Machine", "Breakdown_Pct_m", "BreakdownMin_m"),
  {
    ...breakdownLevel(
      "sub_section",
      "Discipline",
      "Breakdown_Pct_m_Discipline",
      "BreakdownMin_m_Discipline",
    ),
    padTo: DISCIPLINES,
  },
  dateWise(
    breakdownLevel(
      "remarks",
      "Failure",
      "Breakdown_Pct_m_Failure",
      "BreakdownMin_m_Failure",
    ),
  ),
];

/**
 * An MTBF or MTTR level: the rate itself, plus whichever of the spec's two
 * companion columns the engine actually publishes at that grain.
 *
 * The spec asks for "breakdown events" beside both rates, and "total repair
 * minutes" beside MTTR. Its own file list decides where each can appear:
 *
 *   events  — `BreakdownOcc_m` and `BreakdownOcc_m_Failure` only. There is no
 *             occurrence file at grade, grade×section or discipline grain, so
 *             those levels carry no events column rather than a column of
 *             em-dashes. Occurrence counts also do NOT sum between levels
 *             (19,186 → 19,302 → 19,369), so one could not be built by
 *             rolling the machine file up either.
 *   minutes — `BreakdownMin_*` exists at every grain, so MTTR carries repair
 *             minutes all the way down.
 *   operating — MTBF's "operating time (min)" is `OperatingMin_m`, published
 *             at machine grain only (confirmed against gold.gold: 2,690 MONTH
 *             rows). No grade, section or discipline equivalent exists.
 */
function rateLevel(
  groupBy,
  groupLabel,
  kpiName,
  label,
  { minutesKpi, occKpi, operatingKpi } = {},
) {
  const kpiNames = [kpiName];
  const columns = [
    {
      key: kpiName,
      label,
      align: "right",
      render: (r) => fmtMinHrs(r[kpiName]),
    },
  ];
  if (occKpi) {
    kpiNames.push(occKpi);
    columns.push({
      key: occKpi,
      label: "Events",
      align: "right",
      render: (r) => fmtNum(r[occKpi]),
    });
  }
  if (minutesKpi) {
    kpiNames.push(minutesKpi);
    columns.push({
      key: minutesKpi,
      label: "Repair time",
      align: "right",
      render: (r) => fmtMinHrs(r[minutesKpi]),
    });
  }
  if (operatingKpi) {
    kpiNames.push(operatingKpi);
    columns.push({
      key: operatingKpi,
      label: "Operating time",
      align: "right",
      render: (r) => fmtMinHrs(r[operatingKpi]),
    });
  }
  return { groupBy, groupLabel, kpiNames, columns };
}

/**
 * Why every discipline row reads HIGHER than the machine it sits under, which
 * looks at a glance like the machine filter was dropped on the way down.
 *
 * It was not — checked against gold.gold on 2026-09-18 for 0203 / Sep 2026:
 * `MTBF_m_Discipline` publishes exactly the six rows the table draws
 * (Electronics 3,896 · Mechanical 2,125 · Utility 23,376 · Instrumentation
 * 7,792 · Electrical and Other blank), and every one of them carries
 * machine='0203', section='Mixing', status='A', so all three ancestor pins
 * bite. The plant-wide figures are different numbers entirely.
 *
 * The rows are larger because a discipline's MTBF counts the SAME operating
 * minutes against only ITS OWN failures. Fewer failures in the denominator,
 * longer mean time between them — so a discipline is always above the machine
 * total, and it is the RATES that add, not the times:
 *
 *   1/3,896 + 1/2,125 + 1/23,376 + 1/7,792 = 1/1,113 = MTBF_m(0203)
 *
 * which closes to the minute. A discipline row is "how long 0203 runs before
 * THIS discipline fails it", never a slice of the 1,113.
 */
const MTBF_DISCIPLINE_NOTE =
  "Each discipline counts this machine's operating time against its own failures only, " +
  "so every row sits above the machine's overall MTBF — the rates add up to it, not the times.";

export const MTBF_LEVELS = [
  rateLevel("status", "Machine Category", "MTBF_Grade", "MTBF"),
  rateLevel("section", "Section", "MTBF_Grade_Section", "MTBF"),
  rateLevel("machine", "Machine", "MTBF_m", "MTBF", {
    occKpi: "BreakdownOcc_m",
    operatingKpi: "OperatingMin_m",
  }),
  {
    ...rateLevel("sub_section", "Discipline", "MTBF_m_Discipline", "MTBF"),
    padTo: DISCIPLINES,
    note: MTBF_DISCIPLINE_NOTE,
  },
];

export const MTTR_LEVELS = [
  rateLevel("status", "Machine Category", "MTTR_Grade", "MTTR", {
    minutesKpi: "BreakdownMin_Grade",
  }),
  rateLevel("section", "Section", "MTTR_Grade_Section", "MTTR", {
    minutesKpi: "BreakdownMin_Grade_Section",
  }),
  rateLevel("machine", "Machine", "MTTR_m", "MTTR", {
    occKpi: "BreakdownOcc_m",
    minutesKpi: "BreakdownMin_m",
  }),
  {
    ...rateLevel("sub_section", "Discipline", "MTTR_m_Discipline", "MTTR", {
      minutesKpi: "BreakdownMin_m_Discipline",
    }),
    padTo: DISCIPLINES,
  },
  rateLevel("remarks", "Failure", "MTTR_m_Failure", "MTTR", {
    occKpi: "BreakdownOcc_m_Failure",
    minutesKpi: "BreakdownMin_m_Failure",
  }),
];

/* ─── CUSTOM-RANGE DRILL LEVELS ───
 * A custom range has no published rate row, and summing daily rates is
 * rule-8 arithmetic. These levels read only additive components with
 * `agg=sum` over the window and rebuild each rate per row (see
 * lib/reliabilityPooled.js) — the same formulas behind the range headline.
 *
 * Every machine-level component row carries its status and section, so
 * grouping them by category or section pools that group's machines. Below
 * machine only additive columns are shown: there is no scheduled or
 * operating time per discipline or failure to divide by.
 */
const POOLED_KPIS = [
  "BreakdownMin_m",
  "BreakdownOcc_m",
  "OperatingMin_m",
  "ScheduledMin_m",
];

const POOLED_NOTE =
  "Recalculated for the selected range from summed machine downtime, " +
  "breakdown events and scheduled / operating time.";

const pooledEventsColumn = {
  key: "BreakdownOcc_m",
  label: "Events",
  align: "right",
  render: (r) => fmtNum(r.BreakdownOcc_m),
};

function pooledBreakdownLevel(groupBy, groupLabel) {
  return {
    groupBy,
    groupLabel,
    kpiNames: POOLED_KPIS,
    columns: [
      {
        key: "pooled_breakdown_pct",
        label: "Breakdown %",
        align: "right",
        sortValue: pooledBreakdownPct,
        render: (r) => {
          const pct = pooledBreakdownPct(r);
          return pct == null ? "—" : fmtNum(pct, 2) + "%";
        },
      },
      {
        key: "pooled_downtime",
        label: "Downtime",
        align: "right",
        sortValue: pooledDowntime,
        render: (r) => fmtMinHrs(pooledDowntime(r)),
      },
      shareColumn("BreakdownMin_m"),
    ],
  };
}

function pooledMtbfLevel(groupBy, groupLabel) {
  return {
    groupBy,
    groupLabel,
    kpiNames: POOLED_KPIS,
    columns: [
      {
        key: "pooled_mtbf",
        label: "MTBF",
        align: "right",
        sortValue: pooledMtbf,
        render: (r) => fmtMinHrs(pooledMtbf(r)),
      },
      pooledEventsColumn,
      {
        key: "OperatingMin_m",
        label: "Operating time",
        align: "right",
        render: (r) => fmtMinHrs(r.OperatingMin_m),
      },
    ],
  };
}

function pooledMttrLevel(groupBy, groupLabel, minutesKpi, occKpi) {
  const mttr = (r) => meanRepairMinutes(r[minutesKpi], r[occKpi]);
  return {
    groupBy,
    groupLabel,
    kpiNames: [minutesKpi, occKpi],
    columns: [
      {
        key: `pooled_mttr_${minutesKpi}`,
        label: "MTTR",
        align: "right",
        sortValue: mttr,
        render: (r) => fmtMinHrs(mttr(r)),
      },
      {
        key: occKpi,
        label: "Events",
        align: "right",
        render: (r) => fmtNum(r[occKpi]),
      },
      {
        key: minutesKpi,
        label: "Repair time",
        align: "right",
        render: (r) => fmtMinHrs(r[minutesKpi]),
      },
    ],
  };
}

/** Downtime (+ events, where a counter exists at that grain) and Share. */
function rangeDowntimeLevel(groupBy, groupLabel, minKpi, occKpi) {
  const columns = [
    {
      key: minKpi,
      label: "Downtime",
      align: "right",
      render: (r) => fmtMinHrs(r[minKpi]),
    },
  ];
  if (occKpi) {
    columns.push({
      key: occKpi,
      label: "Events",
      align: "right",
      render: (r) => fmtNum(r[occKpi]),
    });
  }
  columns.push(shareColumn(minKpi));
  return {
    groupBy,
    groupLabel,
    kpiNames: occKpi ? [minKpi, occKpi] : [minKpi],
    columns,
  };
}

export const BREAKDOWN_RANGE_LEVELS = [
  {
    ...pooledBreakdownLevel("status", "Machine Category"),
    note: POOLED_NOTE,
  },
  pooledBreakdownLevel("section", "Section"),
  pooledBreakdownLevel("machine", "Machine"),
  {
    ...rangeDowntimeLevel(
      "sub_section",
      "Discipline",
      "BreakdownMin_m_Discipline",
    ),
    padTo: DISCIPLINES,
  },
  rangeDowntimeLevel(
    "remarks",
    "Failure",
    "BreakdownMin_m_Failure",
    "BreakdownOcc_m_Failure",
  ),
];

export const MTBF_RANGE_LEVELS = [
  { ...pooledMtbfLevel("status", "Machine Category"), note: POOLED_NOTE },
  pooledMtbfLevel("section", "Section"),
  pooledMtbfLevel("machine", "Machine"),
];

export const MTTR_RANGE_LEVELS = [
  {
    ...pooledMttrLevel(
      "status",
      "Machine Category",
      "BreakdownMin_m",
      "BreakdownOcc_m",
    ),
    note: POOLED_NOTE,
  },
  pooledMttrLevel("section", "Section", "BreakdownMin_m", "BreakdownOcc_m"),
  pooledMttrLevel("machine", "Machine", "BreakdownMin_m", "BreakdownOcc_m"),
  pooledMttrLevel(
    "remarks",
    "Failure",
    "BreakdownMin_m_Failure",
    "BreakdownOcc_m_Failure",
  ),
];

/**
 * One level of a drill: its own fetch, its own loading/error state, its own
 * table. Owning the fetch per level is what lets the panel keep every level
 * on screen at once — a shared `rows` state could only ever describe the
 * deepest one.
 */
function DrillLevelTable({
  level,
  date,
  granularity,
  range,
  agg,
  filters,
  caption,
  selectedRowKey,
  onRowClick,
  autoScroll,
}) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const ref = useRef(null);

  // Compared by value: `filters` is rebuilt by the parent on every render.
  const filtersKey = JSON.stringify(filters);

  // A level may read at its OWN granularity: the date-wise Failure level is
  // DAY grain inside a MONTH panel. One published DAY row is one day, so
  // covering the panel's month means asking for its whole date window —
  // without it the level would show the 1st of the month and nothing else.
  //
  // A custom `range` (Loss Tree and the *_RANGE_LEVELS — they read only
  // additive measures, so `agg=sum` over every DAY row in it is the period
  // total) reads at DAY grain across that window instead.
  const levelGranularity = range ? "DAY" : (level.granularity ?? granularity);
  const dayWindow = range
    ? range
    : levelGranularity === "DAY" && granularity === "MONTH"
      ? monthRangeFromKey(date)
      : null;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getReliabilityKpiChildren({
      kpiNames: level.kpiNames,
      date,
      from: dayWindow?.from,
      to: dayWindow?.to,
      granularity: levelGranularity,
      groupBy: level.groupBy,
      agg,
      ...filters,
    })
      .then((res) => {
        if (!cancelled) setRows(Array.isArray(res?.rows) ? res.rows : []);
      })
      .catch((err) => {
        if (!cancelled) setError(err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [level, date, granularity, range?.from, range?.to, agg, filtersKey]);

  // A newly opened level is usually below the fold, and the tables above it
  // stay on screen now — so without this a click looks like it did nothing.
  // `block: "nearest"` only scrolls when the table really is out of view.
  useEffect(() => {
    if (!autoScroll || loading) return;
    ref.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [autoScroll, loading]);

  // One column per key dimension: a plain level has one, the date-wise
  // Failure level has two (the failure and the day it happened).
  const dims = level.groupBy.split(",");
  const groupColumns = dims.flatMap((dim, i) => [
    {
      key: dim,
      label:
        dim === "status"
          ? "Machine Category"
          : (level.groupLabels?.[i] ?? level.groupLabel),
      render: (r) => {
        if (dim === "status") return <GradeChip grade={r[dim]} />;
        if (dim === "date") return r.date ? formatDayLabel(r.date) : "—";
        return r[dim] ?? "—";
      },
      // Sorted on the raw ISO string, which is already chronological — the
      // rendered "4 Aug 2026" is not.
      sortValue: dim === "date" ? (r) => r.date ?? null : undefined,
    },
    ...(dim === "machine" ? [MACHINE_NAME_COLUMN] : []),
  ]);
  // Single-dim levels keep the RAW group value as their key — the parent
  // highlights a drilled-through row by comparing it against the value it
  // clicked, and a stringified numeric machine code would never match.
  const rowKey = (r) =>
    dims.length === 1 ? r[dims[0]] : dims.map((d) => r[d] ?? "—").join(" · ");

  // Rule 5 — a level with a fixed member list shows every member, whether or
  // not the period published a row for it. The padded row carries the group
  // name and nothing else, so each measure renders its own em-dash and a
  // clean discipline reads as clean rather than as missing.
  const shownRows = useMemo(() => {
    if (!level.padTo) return rows;
    const present = new Set(rows.map((r) => r[level.groupBy]));
    const missing = level.padTo
      .filter((name) => !present.has(name))
      .map((name) => ({ [level.groupBy]: name }));
    return missing.length ? [...rows, ...missing] : rows;
  }, [rows, level]);

  // A date-keyed level arrives in whatever order the rows were published;
  // chronological is the only order that reads as a timeline. Any header
  // click still re-sorts from here.
  const orderedRows = useMemo(() => {
    if (!dims.includes("date")) return shownRows;
    return [...shownRows].sort((a, b) =>
      String(a.date).localeCompare(String(b.date)),
    );
  }, [shownRows, level.groupBy]);

  return (
    <div ref={ref}>
      <div
        style={{
          fontSize: 12,
          fontWeight: 700,
          color: C.md,
          textTransform: "uppercase",
          letterSpacing: ".5px",
          marginBottom: 6,
        }}
      >
        {caption}
      </div>
      {error ? (
        <div style={{ padding: 14, color: C.rd, fontSize: 13 }}>
          Drill fetch failed: {error.message || "Request failed"}
        </div>
      ) : loading ? (
        <JKLoader message="Loading drill-down" />
      ) : (
        <DTable
          columns={[...groupColumns, ...level.columns]}
          rows={orderedRows}
          getRowKey={rowKey}
          onRowClick={onRowClick}
          selectedRowKey={selectedRowKey}
          emptyMessage={`No data for ${caption}.`}
          downloadName={`engineering-${caption}`}
        />
      )}
      {level.note && !error && !loading && (
        <div
          style={{ fontSize: 11.5, color: C.mu, lineHeight: 1.5, marginTop: 6 }}
        >
          {level.note}
        </div>
      )}
    </div>
  );
}

/**
 * Generic recursive drill panel — a breadcrumb trail over a STACK of tables,
 * one per level opened. Clicking a row appends the next level's table BELOW
 * the current one instead of replacing it, so the whole path stays readable
 * at once: the section you picked, the machines in it, the disciplines on
 * that machine. The row you drilled through stays highlighted in its table.
 *
 * Clicking a different row in any table replaces everything below it, and a
 * breadcrumb click collapses back to that level — both are the same
 * `slice(0, i + 1)` truncation of `history`.
 *
 * Reused for Breakdown/MTBF/MTTR (agg=undefined, ancestor dims pinned so
 * each group is one row; over a custom range their *_RANGE_LEVELS with
 * agg="sum") and Loss Tree levels 2-4 (agg="sum", status/section never
 * pinned).
 *
 * `initialFilters`/`initialLabel` seed the root view — Loss Tree opens
 * already scoped to the clicked pie category (productType), so its root
 * crumb is that category name rather than empty.
 */
export function ReliabilityDrillPanel({
  levels,
  date,
  granularity,
  // Optional { from, to } custom window — only valid with `agg="sum"`.
  range = null,
  agg,
  rootLabel,
  initialFilters = {},
  initialLabel,
}) {
  // `picked` is the group value clicked in the PARENT table to open this
  // level — it is what keeps that parent row highlighted once the child
  // table is on screen. The root level has no parent, hence null.
  const seed = () => [
    {
      filters: initialFilters,
      crumbs: initialLabel ? [initialLabel] : [],
      picked: null,
    },
  ];
  const [history, setHistory] = useState(seed);

  // `initialFilters` is a fresh object literal on every render of the caller,
  // so it can only be compared by value — as a dep by identity it would reset
  // the drill on every render and no row click would ever stick.
  const initialFiltersKey = JSON.stringify(initialFilters);

  // Reset the drill when the caller opens a different KPI/date — or reseeds
  // it with a different scope. That last case is the Loss Tree pie: clicking
  // a second slice changes only `initialFilters`/`initialLabel`, so without
  // them here the panel kept the FIRST slice's productType filter and
  // appeared not to respond to any slice after the first.
  useEffect(() => {
    // seed() not seed — a bare function reaching setState is read as an
    // updater, and this is a plain replacement.
    setHistory(seed());
  }, [
    levels,
    date,
    granularity,
    range?.from,
    range?.to,
    initialFiltersKey,
    initialLabel,
  ]);

  const deepest = history[history.length - 1];
  const path = [rootLabel, ...deepest.crumbs];

  return (
    <div>
      <Breadcrumb
        path={path}
        onNav={(i) => setHistory((h) => h.slice(0, i + 1))}
      />
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {history.map((entry, i) => {
          const level = levels[i];
          if (!level) return null;
          const isLastLevel = i >= levels.length - 1;
          const scope = entry.crumbs[entry.crumbs.length - 1];
          return (
            <DrillLevelTable
              key={i}
              level={level}
              date={date}
              granularity={granularity}
              range={range}
              agg={agg}
              filters={entry.filters}
              caption={
                scope ? `${level.groupLabel} · ${scope}` : level.groupLabel
              }
              // Highlight the row this table was drilled through, if any.
              selectedRowKey={history[i + 1]?.picked}
              autoScroll={i > 0 && i === history.length - 1}
              onRowClick={
                isLastLevel
                  ? undefined
                  : (row) => {
                      if (row.drill_down && row.drill_down.is_leaf) return;
                      const value = row[level.groupBy];
                      const param = GROUP_TO_PARAM[level.groupBy];
                      setHistory((h) => [
                        // Everything below this table is replaced, so picking
                        // a different row re-roots the stack from here down.
                        ...h.slice(0, i + 1),
                        {
                          filters: { ...entry.filters, [param]: value },
                          crumbs: [...entry.crumbs, String(value ?? "—")],
                          picked: value,
                        },
                      ]);
                    }
              }
            />
          );
        })}
      </div>
    </div>
  );
}

/**
 * Trend line chart, reusing Highcharts. `target`, when given, is drawn as
 * the spec's dashed reference line — it is a hardcoded business target (see
 * reliabilityTargets.js), never a value read from the row.
 */
export function TrendChart({ labels, values, unit, target }) {
  const options = useMemo(() => {
    const cleaned = values.map((v) =>
      typeof v === "number" && Number.isFinite(v) ? v : null,
    );
    return {
      chart: {
        type: "line",
        height: 260,
        spacing: [16, 12, 12, 8],
        backgroundColor: "transparent",
      },
      title: { text: null },
      credits: { enabled: false },
      accessibility: { enabled: false },
      legend: { enabled: false },
      xAxis: {
        categories: labels,
        gridLineWidth: 1,
        gridLineColor: C.bd,
        lineColor: C.bd,
      },
      yAxis: {
        title: { text: null },
        gridLineWidth: 1,
        gridLineColor: C.bd,
        labels: {
          formatter: function () {
            return unit ? `${this.value}${unit}` : this.value;
          },
        },
        // A target above every plotted value is outside the axis extremes,
        // and Highcharts then draws nothing at all — the line vanishes with
        // no warning. Breakdown % runs 1.07-2.17 against a 3.0 target, so
        // the axis has to be told to reach it.
        softMax: target == null ? undefined : target * 1.05,
        plotLines:
          target == null
            ? []
            : [
                {
                  value: target,
                  color: C.am,
                  dashStyle: "Dash",
                  width: 1.5,
                  zIndex: 3,
                  label: {
                    text: `Target ${target}${unit || ""}`,
                    align: "right",
                    x: -6,
                    y: -5,
                    style: { color: C.am, fontSize: "10px", fontWeight: "700" },
                  },
                },
              ],
      },
      tooltip: { valueSuffix: unit ? ` ${unit}` : "" },
      plotOptions: {
        line: {
          color: C.bl,
          lineWidth: 2.5,
          marker: { enabled: true, radius: 3.5 },
        },
      },
      series: [{ name: "Actual", data: cleaned }],
    };
  }, [labels, values, unit, target]);
  return <HighchartsReact highcharts={Highcharts} options={options} />;
}
