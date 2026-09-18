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
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
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

const GRADE_COLOR = {
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
              textDecoration: onNav && i < path.length - 1 ? "underline" : "none",
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
}) {
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
      <div style={{ padding: 16, textAlign: "center", color: C.mu, fontSize: 13 }}>
        {emptyMessage || "No data for this scope."}
      </div>
    );
  }

  return (
    <div
      style={{
        overflowX: "auto",
        border: "1px solid " + C.bd,
        borderRadius: 10,
        maxHeight: 360,
      }}
    >
      <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0, fontSize: 13 }}>
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
                    borderRight: i === columns.length - 1 ? "none" : "1px solid " + C.bd,
                    fontSize: 11,
                    cursor: "pointer",
                    userSelect: "none",
                    whiteSpace: "nowrap",
                    position: "sticky",
                    top: 0,
                  }}
                >
                  {col.label}
                  <span style={{ marginLeft: 4, fontSize: 9, opacity: active ? 1 : 0.3 }}>
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
            const selected = selectedRowKey != null && rowKey === selectedRowKey;
            return (
            <tr
              key={rowKey}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              style={{
                background: selected ? C.aL : ri % 2 === 0 ? C.cd : C.rowAlt,
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
                    borderRight: ci === columns.length - 1 ? "none" : "1px solid " + C.bd,
                    textAlign: col.align || "center",
                    color: C.tx,
                    fontWeight: ci === 0 ? 600 : 400,
                    whiteSpace: "nowrap",
                  }}
                >
                  {col.render ? col.render(row) : (row[col.key] ?? "—")}
                </td>
              ))}
            </tr>
            );
          })}
        </tbody>
      </table>
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

function breakdownLevel(groupBy, groupLabel, pctKpi, minKpi) {
  return {
    groupBy,
    groupLabel,
    kpiNames: [pctKpi, minKpi],
    columns: [
      { key: pctKpi, label: "Breakdown %", align: "right", render: (r) => fmtNum(r[pctKpi], 2) + "%" },
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
    ],
  };
}

export const BREAKDOWN_LEVELS = [
  breakdownLevel("status", "Machine Category", "Breakdown_Pct_Grade", "BreakdownMin_Grade"),
  breakdownLevel("section", "Section", "Breakdown_Pct_Grade_Section", "BreakdownMin_Grade_Section"),
  breakdownLevel("machine", "Machine", "Breakdown_Pct_m", "BreakdownMin_m"),
  breakdownLevel("sub_section", "Discipline", "Breakdown_Pct_m_Discipline", "BreakdownMin_m_Discipline"),
  breakdownLevel("remarks", "Failure", "Breakdown_Pct_m_Failure", "BreakdownMin_m_Failure"),
];

function singleMetricLevel(groupBy, groupLabel, kpiName, label) {
  return {
    groupBy,
    groupLabel,
    kpiNames: [kpiName],
    columns: [{ key: kpiName, label, align: "right", render: (r) => fmtMinHrs(r[kpiName]) }],
  };
}

export const MTBF_LEVELS = [
  singleMetricLevel("status", "Machine Category", "MTBF_Grade", "MTBF"),
  singleMetricLevel("section", "Section", "MTBF_Grade_Section", "MTBF"),
  singleMetricLevel("machine", "Machine", "MTBF_m", "MTBF"),
  singleMetricLevel("sub_section", "Discipline", "MTBF_m_Discipline", "MTBF"),
];

export const MTTR_LEVELS = [
  singleMetricLevel("status", "Machine Category", "MTTR_Grade", "MTTR"),
  singleMetricLevel("section", "Section", "MTTR_Grade_Section", "MTTR"),
  singleMetricLevel("machine", "Machine", "MTTR_m", "MTTR"),
  singleMetricLevel("sub_section", "Discipline", "MTTR_m_Discipline", "MTTR"),
  singleMetricLevel("remarks", "Failure", "MTTR_m_Failure", "MTTR"),
];

function lossLevel(groupBy, groupLabel, timeKpi, occKpi) {
  const columns = [
    { key: timeKpi, label: "Lost Time", align: "right", render: (r) => fmtMinHrs(r[timeKpi]) },
  ];
  if (occKpi) {
    columns.push({ key: occKpi, label: "Occurrences", align: "right", render: (r) => fmtNum(r[occKpi]) });
  }
  return { groupBy, groupLabel, kpiNames: occKpi ? [timeKpi, occKpi] : [timeKpi], columns };
}

export const LOSS_TREE_LEVELS = [
  lossLevel("sub_section", "Discipline / Loss Type", "LostTime_LossType", "Occurrences_LossType"),
  lossLevel("machine", "Machine", "LostTime_Loss_m", null),
  lossLevel("remarks", "Failure", "LostTime_Loss_Failure", "Occurrences_Loss_Failure"),
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

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getReliabilityKpiChildren({
      kpiNames: level.kpiNames,
      date,
      granularity,
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
  }, [level, date, granularity, agg, filtersKey]);

  // A newly opened level is usually below the fold, and the tables above it
  // stay on screen now — so without this a click looks like it did nothing.
  // `block: "nearest"` only scrolls when the table really is out of view.
  useEffect(() => {
    if (!autoScroll || loading) return;
    ref.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [autoScroll, loading]);

  const groupColumn = {
    key: level.groupBy,
    label: level.groupBy === "status" ? "Machine Category" : level.groupLabel,
    render: (r) =>
      level.groupBy === "status" ? <GradeChip grade={r[level.groupBy]} /> : (r[level.groupBy] ?? "—"),
  };

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
          columns={[groupColumn, ...level.columns]}
          rows={rows}
          getRowKey={(r) => r[level.groupBy]}
          onRowClick={onRowClick}
          selectedRowKey={selectedRowKey}
          emptyMessage={`No data for ${caption}.`}
        />
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
 * each group is one row) and Loss Tree levels 2-4 (agg="sum", status/section
 * never pinned).
 *
 * `initialFilters`/`initialLabel` seed the root view — Loss Tree opens
 * already scoped to the clicked pie category (productType), so its root
 * crumb is that category name rather than empty.
 */
export function ReliabilityDrillPanel({
  levels,
  date,
  granularity,
  agg,
  rootLabel,
  initialFilters = {},
  initialLabel,
}) {
  // `picked` is the group value clicked in the PARENT table to open this
  // level — it is what keeps that parent row highlighted once the child
  // table is on screen. The root level has no parent, hence null.
  const seed = () => [
    { filters: initialFilters, crumbs: initialLabel ? [initialLabel] : [], picked: null },
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
  }, [levels, date, granularity, initialFiltersKey, initialLabel]);

  const deepest = history[history.length - 1];
  const path = [rootLabel, ...deepest.crumbs];

  return (
    <div>
      <Breadcrumb path={path} onNav={(i) => setHistory((h) => h.slice(0, i + 1))} />
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
              agg={agg}
              filters={entry.filters}
              caption={scope ? `${level.groupLabel} · ${scope}` : level.groupLabel}
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

/** Trend modal line chart (MONTH series Jan-Sep), reusing Highcharts. */
export function TrendChart({ labels, values, unit }) {
  const options = useMemo(() => {
    const cleaned = values.map((v) => (typeof v === "number" && Number.isFinite(v) ? v : null));
    return {
      chart: { type: "line", height: 260, spacing: [16, 12, 12, 8], backgroundColor: "transparent" },
      title: { text: null },
      credits: { enabled: false },
      accessibility: { enabled: false },
      legend: { enabled: false },
      xAxis: { categories: labels, gridLineWidth: 1, gridLineColor: C.bd, lineColor: C.bd },
      yAxis: {
        title: { text: null },
        gridLineWidth: 1,
        gridLineColor: C.bd,
        labels: { formatter: function () { return unit ? `${this.value}${unit}` : this.value; } },
      },
      tooltip: { valueSuffix: unit ? ` ${unit}` : "" },
      plotOptions: {
        line: { color: C.bl, lineWidth: 2.5, marker: { enabled: true, radius: 3.5 } },
      },
      series: [{ name: "Actual", data: cleaned }],
    };
  }, [labels, values, unit]);
  return <HighchartsReact highcharts={Highcharts} options={options} />;
}
