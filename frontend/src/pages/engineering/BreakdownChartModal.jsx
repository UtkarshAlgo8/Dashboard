/* eslint-disable */
/**
 * The Breakdown chart, opened from the Breakdown card's trend icon.
 *
 * Built to the KPI spec ("Breakdown chart — opens from the Breakdown card
 * trend icon", plus KPI 2's "Trend icon → two views, toggled"):
 *
 *   VIEW         Pareto · Monthly trend
 *   VIEW BY      Machine · Failure            (Pareto view)
 *   MEASURE      Downtime (min) · Occurrences
 *   Machine      enabled ONLY when VIEW BY = Failure — "filter first, then group"
 *
 * Files, one pair serving both lenses, read as published:
 *
 *   Machine lens   BreakdownMin_m + BreakdownOcc_m
 *   Failure lens   BreakdownMin_m_Failure + BreakdownOcc_m_Failure   (summed
 *                  over discipline, which the spec's "group by remarks" means)
 *
 * Three spec rules this implements literally:
 *
 * 1. "Occurrences in the Machine view: use `breakdown_occ_m`, not the summed
 *    failure rows." Summing failure-level occurrences overcounts on 7
 *    machines (0206 reads 78 instead of 70, plant 2,174 instead of 2,152),
 *    so the machine lens reads the machine-level counter.
 * 2. "Cap the bars … Default to the top 15-20 with the rest in an 'Other'
 *    bar." Minutes and occurrences are on the spec's "safe to sum in the UI"
 *    list, so an Other bar is a plain total and the cumulative line reaches
 *    100%.
 * 3. No Breakdown % column. Rule 2 — "never recompute a % or a rate in the
 *    UI" — and the spec's own Breakdown-chart tables carry Downtime and
 *    Occurrences only. Share % is the one ratio rule 3 permits the UI.
 */
import { useEffect, useMemo, useState } from "react";
import Highcharts from "highcharts";
import HighchartsReactImport from "highcharts-react-official";
import {
  getReliabilityKpiChildren,
  getReliabilityKpiHistory,
} from "@/api/engineering.js";
import JKLoader from "@/components/JKLoader.jsx";
import {
  C,
  DTable,
  GradeChip,
  TrendChart,
  fmtNum,
  formatMonthLabel,
  currentMonthKeyInIST,
  monthKeyShiftedInIST,
} from "./reliabilityShared.jsx";
import { TARGETS } from "./reliabilityTargets.js";

const HighchartsReact = HighchartsReactImport?.default ?? HighchartsReactImport;

const MACHINE_KPIS = ["BreakdownMin_m", "BreakdownOcc_m"];
const FAILURE_KPIS = ["BreakdownMin_m_Failure", "BreakdownOcc_m_Failure"];

const VIEWS_BY = [
  { id: "machine", label: "Machine" },
  { id: "failure", label: "Failure" },
];

const MEASURES = [
  { id: "downtime", label: "Downtime (min)", key: "minutes" },
  { id: "occurrences", label: "Occurrences", key: "occurrences" },
];

// Spec: "Default to the top 15-20 with the rest in an 'Other' bar."
const MAX_BARS = 15;
const OTHER_LABEL = "Other";

function Pill({ active, accent = C.bl, disabled, children, onClick }) {
  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      style={{
        padding: "7px 14px",
        borderRadius: 8,
        border: "1px solid " + (active ? accent : C.bd),
        background: active ? accent + "10" : C.cd,
        color: disabled ? C.mu : active ? accent : C.md,
        fontSize: 12.5,
        fontWeight: 700,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.6 : 1,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </button>
  );
}

function ControlRow({ label, children }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
      <span
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: C.mu,
          textTransform: "uppercase",
          letterSpacing: ".4px",
          minWidth: 62,
        }}
      >
        {label}
      </span>
      {children}
    </div>
  );
}

function truncate(text, max = 30) {
  const s = String(text ?? "—");
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

/** Sorted bars + a cumulative % line over the same order (spec: Pareto). */
function ParetoChart({ rows, measureLabel, total, barsTo80 }) {
  const options = useMemo(() => {
    let running = 0;
    const cumulative = rows.map((r) => {
      running += r.value;
      return total ? (running / total) * 100 : 0;
    });
    const longest = rows.reduce((n, r) => Math.max(n, truncate(r.label).length), 0);
    // Upright labels are as tall as their text is long, so the room they need
    // is a property of the data: machine codes ask for ~70px, a failure
    // phrase for ~220px.
    const upright = longest > 8;
    const labelRoom = upright ? Math.min(240, Math.max(90, longest * 6.2 + 30)) : 70;
    return {
      chart: {
        type: "column",
        height: 290 + labelRoom,
        marginBottom: labelRoom,
        backgroundColor: "transparent",
        spacing: [12, 8, 4, 8],
      },
      title: { text: null },
      credits: { enabled: false },
      accessibility: { enabled: false },
      legend: { enabled: false },
      xAxis: {
        categories: rows.map((r) => r.label),
        lineColor: C.bd,
        tickLength: 0,
        labels: {
          rotation: upright ? -90 : 0,
          align: upright ? "right" : "center",
          overflow: "allow",
          crop: false,
          style: {
            fontSize: "11px",
            color: C.md,
            whiteSpace: "nowrap",
            textOverflow: "none",
            width: "190px",
          },
          formatter: function () {
            return truncate(this.value);
          },
        },
      },
      yAxis: [
        {
          title: { text: null },
          gridLineColor: C.bd,
          labels: { style: { fontSize: "11px", color: C.mu } },
        },
        {
          // The cumulative %'s scale carries the 80% marker and nothing else:
          // no labels, no grid, no line. Highcharts draws no plot line on a
          // `visible: false` axis, hence this shape rather than hiding it.
          min: 0,
          max: 100,
          opposite: true,
          title: { text: null },
          labels: { enabled: false },
          gridLineWidth: 0,
          lineWidth: 0,
          tickWidth: 0,
          plotLines: [
            {
              value: 80,
              color: C.am,
              dashStyle: "Dash",
              width: 1,
              zIndex: 3,
              label: {
                text: "80% of scope",
                align: "right",
                x: -4,
                y: -5,
                style: { color: C.am, fontSize: "10px", fontWeight: "700" },
              },
            },
          ],
        },
      ],
      tooltip: {
        shared: true,
        useHTML: true,
        formatter: function () {
          const idx = this.points?.[0]?.point?.index ?? 0;
          const row = rows[idx];
          if (!row) return false;
          return (
            `<b>${row.label}</b><br/>` +
            `${measureLabel}: <b>${fmtNum(row.value)}</b><br/>` +
            `Share of scope: <b>${fmtNum(row.share, 1)}%</b><br/>` +
            `Cumulative: <b>${fmtNum(cumulative[idx], 1)}%</b>`
          );
        },
      },
      plotOptions: {
        column: {
          borderWidth: 0,
          borderRadius: 4,
          groupPadding: 0.12,
          pointPadding: 0.06,
          dataLabels: {
            enabled: true,
            style: { fontSize: "11px", fontWeight: "700", color: C.tx, textOutline: "none" },
            formatter: function () {
              return fmtNum(this.y);
            },
          },
        },
      },
      series: [
        {
          name: measureLabel,
          type: "column",
          yAxis: 0,
          data: rows.map((r, i) => ({
            y: r.value,
            // Solid up to the 80% cut, faded after it; the pooled tail is
            // greyed, since it is many rows rather than one thing to act on.
            color: r.isOther ? C.mu + "55" : i < barsTo80 ? C.bl : C.bl + "66",
          })),
        },
        {
          name: "Cumulative %",
          type: "line",
          yAxis: 1,
          color: C.am,
          lineWidth: 2,
          marker: { enabled: true, radius: 4, symbol: "circle" },
          data: cumulative,
        },
      ],
    };
  }, [rows, measureLabel, total, barsTo80]);

  return <HighchartsReact highcharts={Highcharts} options={options} />;
}

/** Spec KPI 2: "line chart of Breakdown % by month". */
function MonthlyBreakdownTrend() {
  const [points, setPoints] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getReliabilityKpiHistory({
      kpiName: "Breakdown_Pct_Overall",
      dateFrom: monthKeyShiftedInIST(-11),
      dateTo: currentMonthKeyInIST(),
      granularity: "MONTH",
    })
      .then((res) => !cancelled && setPoints(Array.isArray(res?.points) ? res.points : []))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  // Spec: "September is a partial month — mark partial periods or drop the
  // last point, or every trend will appear to fall at the right edge."
  const runningMonth = currentMonthKeyInIST().slice(0, 7);
  const labels = points.map((p) => {
    const month = String(p.date).slice(0, 7);
    return formatMonthLabel(month) + (month === runningMonth ? " (partial)" : "");
  });

  if (loading) return <JKLoader message="Loading monthly trend" />;
  if (points.length === 0) {
    return (
      <div style={{ padding: 16, color: C.mu, fontSize: 13 }}>
        No published MONTH rows for Breakdown %.
      </div>
    );
  }

  return (
    <div>
      <TrendChart
        labels={labels}
        values={points.map((p) => p.value)}
        unit="%"
        target={TARGETS.breakdownPct}
      />
      <div style={{ fontSize: 12, color: C.mu, textAlign: "center", lineHeight: 1.5, marginTop: 6 }}>
        Plant Breakdown % per month, read from the engine's MONTH rows — a ratio is never
        rebuilt from daily values. Target is a hardcoded {fmtNum(TARGETS.breakdownPct, 1)}%; no
        threshold is published. The running month is partial.
      </div>
    </div>
  );
}

/**
 * @param {{ date: string, granularity: string, initialViewBy?: string, maxBars?: number }} props
 */
function ParetoView({ date, granularity, initialViewBy, maxBars = MAX_BARS }) {
  const [viewBy, setViewBy] = useState(initialViewBy ?? "machine");
  const [measure, setMeasure] = useState("downtime");
  const [machine, setMachine] = useState("");

  const [machineRows, setMachineRows] = useState([]);
  const [machineState, setMachineState] = useState({ loading: true, error: null });
  const [failureRows, setFailureRows] = useState([]);
  const [failureState, setFailureState] = useState({ loading: false, error: null });

  // The machine lens AND the machine-filter options come from one fetch of
  // the machine-level pair; it is also the scope total the shares run on.
  useEffect(() => {
    let cancelled = false;
    setMachineState({ loading: true, error: null });
    getReliabilityKpiChildren({
      kpiNames: MACHINE_KPIS,
      date,
      granularity,
      groupBy: "machine",
    })
      .then((res) => {
        if (cancelled) return;
        setMachineRows(Array.isArray(res?.rows) ? res.rows : []);
        setMachineState({ loading: false, error: null });
      })
      .catch((err) => !cancelled && setMachineState({ loading: false, error: err }));
    return () => {
      cancelled = true;
    };
  }, [date, granularity]);

  // Spec: the machine filter applies to the Failure lens only — "filter
  // first, then group".
  useEffect(() => {
    if (viewBy !== "failure") return;
    let cancelled = false;
    setFailureState({ loading: true, error: null });
    getReliabilityKpiChildren({
      kpiNames: FAILURE_KPIS,
      date,
      granularity,
      groupBy: "remarks",
      agg: "sum",
      machine: machine || undefined,
    })
      .then((res) => {
        if (cancelled) return;
        setFailureRows(Array.isArray(res?.rows) ? res.rows : []);
        setFailureState({ loading: false, error: null });
      })
      .catch((err) => !cancelled && setFailureState({ loading: false, error: err }));
    return () => {
      cancelled = true;
    };
  }, [viewBy, date, granularity, machine]);

  const machineOptions = useMemo(
    () =>
      [...new Set(machineRows.map((r) => r.machine).filter((m) => m != null && m !== ""))].sort(),
    [machineRows],
  );

  const scope = useMemo(() => {
    let minutes = 0;
    let occurrences = 0;
    for (const r of machineRows) {
      minutes += r.BreakdownMin_m ?? 0;
      occurrences += r.BreakdownOcc_m ?? 0;
    }
    return { minutes, occurrences, machines: machineRows.filter((r) => r.BreakdownMin_m > 0).length };
  }, [machineRows]);

  const measureKey = MEASURES.find((m) => m.id === measure).key;

  const allRows = useMemo(() => {
    const built =
      viewBy === "machine"
        ? machineRows.map((r) => ({
            key: r.machine,
            label: r.machine ?? "—",
            section: r.section,
            status: r.status,
            minutes: r.BreakdownMin_m,
            // Spec rule: the machine-level counter, never the summed
            // failure rows.
            occurrences: r.BreakdownOcc_m,
          }))
        : failureRows.map((r) => ({
            key: r.remarks,
            label: r.remarks ?? "—",
            minutes: r.BreakdownMin_m_Failure,
            occurrences: r.BreakdownOcc_m_Failure,
          }));

    const ranked = built
      .map((r) => ({ ...r, value: r[measureKey] }))
      // A Pareto ranks what was lost; a machine that ran clean has no bar.
      .filter((r) => r.value != null && r.value > 0)
      .sort((a, b) => b.value - a.value);

    const total = ranked.reduce((s, r) => s + r.value, 0);
    return ranked.map((r) => ({ ...r, share: total ? (r.value / total) * 100 : 0 }));
  }, [viewBy, machineRows, failureRows, measureKey]);

  const measureTotal = useMemo(() => allRows.reduce((s, r) => s + r.value, 0), [allRows]);

  // Spec: top N, then everything else pooled into one "Other" bar, so the
  // bars still add to the scope and the cumulative line still reaches 100%.
  const barRows = useMemo(() => {
    if (allRows.length <= maxBars) return allRows;
    const head = allRows.slice(0, maxBars);
    const tail = allRows.slice(maxBars);
    const value = tail.reduce((s, r) => s + r.value, 0);
    return [
      ...head,
      {
        key: OTHER_LABEL,
        label: `${OTHER_LABEL} (${fmtNum(tail.length)})`,
        value,
        share: measureTotal ? (value / measureTotal) * 100 : 0,
        isOther: true,
      },
    ];
  }, [allRows, maxBars, measureTotal]);

  // Counted over the REAL rows, never over the pooled bar: "Other" is 345
  // failures in one rectangle, so including it answers "16 of 16 bars", which
  // says nothing. The honest figure is how many distinct machines or failures
  // carry 80% — 85 of 360 in August.
  const rowsTo80 = useMemo(() => {
    if (!measureTotal) return 0;
    let running = 0;
    for (let i = 0; i < allRows.length; i++) {
      running += allRows[i].value;
      if ((running / measureTotal) * 100 >= 80) return i + 1;
    }
    return allRows.length;
  }, [allRows, measureTotal]);

  const loading = machineState.loading || (viewBy === "failure" && failureState.loading);
  const error = machineState.error || failureState.error;
  const groupLabel = viewBy === "machine" ? "Machine" : "Failure";
  const activeMeasure = MEASURES.find((m) => m.id === measure);

  const columns = [
    { key: "label", label: groupLabel, align: "left", render: (r) => r.label },
    ...(viewBy === "machine"
      ? [
          { key: "section", label: "Section", render: (r) => r.section ?? "—" },
          { key: "status", label: "Category", render: (r) => <GradeChip grade={r.status} /> },
        ]
      : []),
    { key: "minutes", label: "Downtime (min)", align: "right", render: (r) => fmtNum(r.minutes) },
    { key: "occurrences", label: "Occurrences", align: "right", render: (r) => fmtNum(r.occurrences) },
    { key: "share", label: "Share of scope", align: "right", render: (r) => fmtNum(r.share, 1) + "%" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <ControlRow label="View by">
        {VIEWS_BY.map((v) => (
          <Pill
            key={v.id}
            active={viewBy === v.id}
            accent={C.pp}
            onClick={() => {
              setViewBy(v.id);
              // The machine pin belongs to the Failure lens; leaving it set
              // while the Machine lens is on screen would describe a scope
              // the bars do not have.
              if (v.id === "machine") setMachine("");
            }}
          >
            {v.label}
          </Pill>
        ))}
        <span style={{ width: 12 }} />
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: C.mu,
            textTransform: "uppercase",
            letterSpacing: ".4px",
          }}
        >
          Measure
        </span>
        {MEASURES.map((m) => (
          <Pill key={m.id} active={measure === m.id} onClick={() => setMeasure(m.id)}>
            {m.label}
          </Pill>
        ))}
      </ControlRow>

      <ControlRow label="Machine">
        <select
          value={machine}
          disabled={viewBy !== "failure"}
          onChange={(e) => setMachine(e.target.value)}
          title={
            viewBy === "failure"
              ? "Filter to one machine, then group by failure"
              : "Enabled in the Failure view only — the Machine view already is one bar per machine"
          }
          style={{
            padding: "7px 10px",
            borderRadius: 8,
            border: "1px solid " + C.bd,
            background: viewBy === "failure" ? C.cd : C.c2,
            color: viewBy === "failure" ? C.tx : C.mu,
            fontSize: 12.5,
            fontWeight: 700,
            cursor: viewBy === "failure" ? "pointer" : "not-allowed",
            maxWidth: 220,
          }}
        >
          <option value="">All machines</option>
          {machineOptions.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        {viewBy !== "failure" && (
          <span style={{ fontSize: 11.5, color: C.mu }}>
            Available in the Failure view — the Machine view is already one bar per machine.
          </span>
        )}
      </ControlRow>

      {error ? (
        <div style={{ padding: 14, color: C.rd, fontSize: 13 }}>
          Breakdown chart fetch failed: {error.message || "Request failed"}
        </div>
      ) : loading ? (
        <JKLoader message="Loading breakdown chart" />
      ) : (
        <>
          <div
            style={{
              border: "1px solid " + C.bd,
              background: C.c2,
              borderRadius: 8,
              padding: "10px 12px",
              fontSize: 12.5,
              color: C.md,
              lineHeight: 1.6,
            }}
          >
            <b style={{ color: C.tx }}>Scope:</b>{" "}
            {machine ? `machine ${machine}` : `${fmtNum(scope.machines)} machines with a breakdown`} —{" "}
            <b style={{ color: C.tx }}>{fmtNum(scope.minutes)} min</b> over{" "}
            <b style={{ color: C.tx }}>{fmtNum(scope.occurrences)}</b> breakdowns.{" "}
            {allRows.length === 0
              ? "Nothing recorded in this scope."
              : `${fmtNum(rowsTo80)} of ${fmtNum(allRows.length)} ${
                  groupLabel === "Machine" ? "machines" : "failures"
                } carry 80% of the ${activeMeasure.label.toLowerCase()}.`}
          </div>

          {barRows.length > 0 && (
            <>
              <ParetoChart
                rows={barRows}
                measureLabel={activeMeasure.label}
                total={measureTotal}
                barsTo80={rowsTo80}
              />
              <div style={{ fontSize: 12, color: C.mu, textAlign: "center", lineHeight: 1.5 }}>
                Bars = {activeMeasure.label.toLowerCase()} (additive) · amber line = cumulative % of
                scope
                {allRows.length > maxBars &&
                  ` · top ${maxBars} of ${fmtNum(allRows.length)}, the remaining ${fmtNum(
                    allRows.length - maxBars,
                  )} pooled into "Other"`}
              </div>
            </>
          )}

          <DTable
            columns={columns}
            rows={allRows}
            getRowKey={(r) => r.key}
            emptyMessage="No breakdowns recorded in this scope."
          />
        </>
      )}
    </div>
  );
}

const MODAL_VIEWS = [
  { id: "pareto", label: "Pareto" },
  { id: "trend", label: "Monthly trend" },
];

/**
 * The modal: the spec's two toggled views behind the Breakdown trend icon.
 *
 * @param {{ open: boolean, onClose: () => void, date: string, granularity: string,
 *           title?: string, initialViewBy?: string, maxBars?: number,
 *           paretoOnly?: boolean }} props
 */
function BreakdownChartModal({
  open,
  onClose,
  date,
  granularity,
  title = "Breakdown",
  initialViewBy,
  maxBars,
  paretoOnly = false,
}) {
  const [view, setView] = useState("pareto");

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15,23,42,.55)",
        zIndex: 1000,
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        padding: "40px 18px",
        overflowY: "auto",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: C.cd,
          borderRadius: 12,
          border: "1px solid " + C.bd,
          boxShadow: "0 20px 60px rgba(0,0,0,.25)",
          width: "100%",
          maxWidth: 1100,
        }}
      >
        <div
          style={{
            padding: "14px 18px",
            borderBottom: "1px solid " + C.bd,
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          <div>
            <div
              style={{
                fontSize: 12,
                color: C.mu,
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: ".5px",
              }}
            >
              Breakdown Analysis
            </div>
            <div style={{ fontSize: 19, fontWeight: 700, color: C.tx, marginTop: 2 }}>{title}</div>
          </div>
          {!paretoOnly && (
            <div style={{ display: "flex", gap: 8, marginLeft: 24 }}>
              {MODAL_VIEWS.map((v) => (
                <Pill key={v.id} active={view === v.id} onClick={() => setView(v.id)}>
                  {v.label}
                </Pill>
              ))}
            </div>
          )}
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              marginLeft: "auto",
              width: 30,
              height: 30,
              borderRadius: 8,
              border: "1px solid " + C.bd,
              background: C.c2,
              color: C.mu,
              fontSize: 19,
              lineHeight: 1,
              cursor: "pointer",
            }}
          >
            {"✕"}
          </button>
        </div>
        <div style={{ padding: "16px 18px" }}>
          {view === "pareto" || paretoOnly ? (
            <ParetoView
              date={date}
              granularity={granularity}
              initialViewBy={initialViewBy}
              maxBars={maxBars}
            />
          ) : (
            <MonthlyBreakdownTrend />
          )}
        </div>
      </div>
    </div>
  );
}

export default BreakdownChartModal;
