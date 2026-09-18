/* eslint-disable */
/**
 * PARETO ANALYSIS — Breakdown (spec 16/17, Reliability tab).
 *
 * A modal opened from the Breakdown card's TREND icon, which is where the
 * design reference puts it ("opened from the trend icon on a pareto-flagged
 * Engineering KPI"): for this KPI the question is not "how did the monthly
 * figure move" but "which few machines/failures carry most of the lost
 * time", so the Pareto takes the trend modal's place. The card's chevron
 * still opens the ordinary recursive drill.
 *
 * One scope, three lenses, sorted bars + a cumulative % line, and the same
 * rows as a sortable table underneath.
 *
 *   VIEW BY   Machine · Failure Phenomenon · Machine × Phenomenon
 *   MEASURE   Downtime (min) · Occurrences  (the bars AND the sort)
 *   FILTER    Machine category (status) · Section · Machine
 *
 * Every figure is a PUBLISHED KPI value, read as stored. The only
 * arithmetic here is the scope roll-up the UI is allowed to do (the same
 * formula the backend's `toAggregatedSummary` uses):
 *
 *   scope downtime   = Σ BreakdownMin_m over the machines in scope
 *   scope Breakdown% = Σ BreakdownMin_m / Σ ScheduledMin_m × 100
 *   share of scope   = the row's measure / the scope's measure
 *   cumulative %     = running share, in the sorted order
 *
 * Per-row "Breakdown %" is the row's OWN published percentage, so its
 * denominator follows the lens (stated in the chart caption):
 *   - Machine              → Breakdown_Pct_m          (of that machine's scheduled time)
 *   - Machine × Phenomenon → Breakdown_Pct_m_Failure   (ditto — verified additive
 *     across sub_section: Σ per machine reproduces Breakdown_Pct_m exactly,
 *     because every part shares that machine's denominator)
 *   - Failure Phenomenon   → not published at that grain (the KPI has no
 *     machine dimension), so it is the row's minutes over the SCOPE's
 *     scheduled minutes instead.
 */
import { useEffect, useMemo, useState } from "react";
import Highcharts from "highcharts";
import HighchartsReactImport from "highcharts-react-official";
import { getReliabilityKpiChildren } from "@/api/engineering.js";
import JKLoader from "@/components/JKLoader.jsx";
import { C, DTable, GradeChip, fmtNum } from "./reliabilityShared.jsx";

const HighchartsReact = HighchartsReactImport?.default ?? HighchartsReactImport;

// The machine universe of the selected period: one row per machine, with the
// three figures a Pareto needs plus the scheduled minutes the scope's
// Breakdown % is measured against. Fetched ONCE per period, unfiltered — it
// is both the "Machine" lens's rows and the source of the filter dropdowns,
// so changing a filter re-slices what is already in memory.
const MACHINE_KPIS = [
  "BreakdownMin_m",
  "BreakdownOcc_m",
  "Breakdown_Pct_m",
  "ScheduledMin_m",
];

// Machine × failure: one published row per (machine, failure, discipline),
// summed over discipline by `agg: "sum"`.
const MACHINE_FAILURE_KPIS = [
  "BreakdownMin_m_Failure",
  "BreakdownOcc_m_Failure",
  "Breakdown_Pct_m_Failure",
];

const VIEWS = [
  { id: "machine", label: "Machine" },
  { id: "failure", label: "Failure Phenomenon" },
  { id: "machineFailure", label: "Machine × Phenomenon" },
];

const MEASURES = [
  { id: "downtime", label: "Downtime (min)", unit: "min" },
  { id: "occurrences", label: "Occurrences", unit: "" },
];

// Bars past this point are unreadable; the table below carries every row.
const MAX_BARS = 15;

/** One VIEW BY / MEASURE pill. */
function Pill({ active, accent = C.bl, children, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "7px 14px",
        borderRadius: 8,
        border: "1px solid " + (active ? accent : C.bd),
        background: active ? accent + "10" : C.cd,
        color: active ? accent : C.md,
        fontSize: 12.5,
        fontWeight: 700,
        cursor: "pointer",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </button>
  );
}

/** One FILTER dropdown. `value === ""` is the "All …" option. */
function FilterSelect({ allLabel, value, options, onChange }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{
        padding: "7px 10px",
        borderRadius: 8,
        border: "1px solid " + C.bd,
        background: C.cd,
        color: C.tx,
        fontSize: 12.5,
        fontWeight: 700,
        cursor: "pointer",
        maxWidth: 220,
      }}
    >
      <option value="">{allLabel}</option>
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
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

/** Long failure phenomena need cutting to fit an axis label. */
function truncate(text, max = 30) {
  const s = String(text ?? "—");
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

/**
 * Sorted bars (the measure) + a cumulative-% line over the same order.
 *
 * The cumulative series is a DERIVED running total of the very bars beside
 * it, not an independent second measure — so its 0-100% scale is deliberately
 * NOT drawn as a second axis (which would invite reading two unrelated
 * scales against each other). Only the minutes/count axis is printed; the
 * line is read off its 80% marker and its tooltip.
 */
function ParetoChart({ rows, measure, total, barsTo80 }) {
  const options = useMemo(() => {
    const shown = rows.slice(0, MAX_BARS);
    let running = 0;
    const cumulative = shown.map((r) => {
      running += r.measure;
      return total ? (running / total) * 100 : 0;
    });
    // Upright labels are as tall as their text is long, so the room they
    // need is a property of the data: machine codes ask for ~70px, a
    // machine-and-phenomenon sentence for ~220px. Deriving it keeps the
    // Machine lens from carrying the tallest lens's empty margin.
    const longest = shown.reduce((n, r) => Math.max(n, truncate(r.label).length), 0);
    // A machine code fits flat under its bar; a phenomenon sentence does not.
    const upright = longest > 8;
    const labelRoom = upright ? Math.min(240, Math.max(90, longest * 6.2 + 30)) : 70;
    return {
      // The rotated category labels are two lines of a machine-and-failure
      // name, so the bottom margin is reserved rather than negotiated.
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
        categories: shown.map((r) => r.label),
        lineColor: C.bd,
        tickLength: 0,
        labels: {
          useHTML: true,
          // Vertical, not horizontal or diagonal. A failure phenomenon is a
          // sentence ("SEGMENT OPEN/CLOSE PROBLEM"): horizontal labels at
          // this bar width collapse to "0204 — MAIN M…", and a -35° label
          // still gets cropped at the first tick, where its box would run
          // off the left of the chart. Upright, each label's footprint is
          // its line height, so nothing is cropped at either edge —
          // verified by rendering all three lenses.
          rotation: upright ? -90 : 0,
          align: upright ? "right" : "center",
          overflow: "allow",
          crop: false,
          style: {
            fontSize: "11px",
            color: C.mu,
            whiteSpace: "nowrap",
            textOverflow: "none",
            width: "190px",
          },
          formatter: function () {
            const row = shown[this.pos];
            const own = row?.pct == null ? "—" : fmtNum(row.pct, 2) + "%";
            return (
              `<div style="line-height:1.3">` +
              `<div style="color:${C.md}">${truncate(this.value)}</div>` +
              `<div style="color:${C.mu}">${own}</div>` +
              `</div>`
            );
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
          // The cumulative %'s scale — present so the 80% marker can be
          // drawn (Highcharts renders no plot line on a `visible: false`
          // axis), but printing nothing itself: no labels, no grid, no line.
          // Only the marker and the tooltip make the line readable.
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
          const row = shown[this.points?.[0]?.point?.index ?? 0];
          if (!row) return false;
          const cum = cumulative[this.points[0].point.index];
          const unit = measure === "downtime" ? " min" : "";
          return (
            `<b>${row.label}</b><br/>` +
            `${MEASURES.find((m) => m.id === measure).label}: <b>${fmtNum(row.measure)}${unit}</b><br/>` +
            `Breakdown %: <b>${row.pct == null ? "—" : fmtNum(row.pct, 2) + "%"}</b><br/>` +
            `Share of scope: <b>${fmtNum(row.share, 1)}%</b><br/>` +
            `Cumulative: <b>${fmtNum(cum, 1)}%</b>`
          );
        },
      },
      plotOptions: {
        column: {
          color: C.bl,
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
          name: MEASURES.find((m) => m.id === measure).label,
          type: "column",
          yAxis: 0,
          // Solid up to the 80% cut, faded after it: the bars that carry the
          // scope are the ones to act on, and the fade says where that ends.
          data: shown.map((r, i) => ({
            y: r.measure,
            color: i < barsTo80 ? C.bl : C.bl + "66",
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
  }, [rows, measure, total, barsTo80]);

  return <HighchartsReact highcharts={Highcharts} options={options} />;
}

/**
 * The analysis itself, without the modal chrome.
 * @param {{ date: string, granularity: string }} props
 */
function ParetoBody({ date, granularity, initialView }) {
  // Opens on the finest lens by default — a machine paired with the failure
  // that stopped it is the row an engineer acts on. Top Machine Breakdowns
  // opens the same analysis on the Machine lens instead, which is what that
  // card names.
  const [view, setView] = useState(initialView ?? "machineFailure");
  const [measure, setMeasure] = useState("downtime");
  const [status, setStatus] = useState("");
  const [section, setSection] = useState("");
  const [machine, setMachine] = useState("");

  // The machine universe (scope + filter options + the "Machine" lens).
  const [machineRows, setMachineRows] = useState([]);
  const [machineError, setMachineError] = useState(null);
  const [machineLoading, setMachineLoading] = useState(true);

  // The failure-grain rows for the other two lenses.
  const [failureRows, setFailureRows] = useState([]);
  const [failureError, setFailureError] = useState(null);
  const [failureLoading, setFailureLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setMachineLoading(true);
    setMachineError(null);
    getReliabilityKpiChildren({
      kpiNames: MACHINE_KPIS,
      date,
      granularity,
      groupBy: "machine",
    })
      .then((res) => !cancelled && setMachineRows(Array.isArray(res?.rows) ? res.rows : []))
      .catch((err) => !cancelled && setMachineError(err))
      .finally(() => !cancelled && setMachineLoading(false));
    return () => {
      cancelled = true;
    };
  }, [date, granularity]);

  // Scope changes are pushed to the SERVER for the failure lenses: the
  // machine × failure grain is ~1.4k rows a period, and the filters are
  // exactly the columns the endpoint already pins.
  const needsFailureRows = view !== "machine";
  useEffect(() => {
    if (!needsFailureRows) return;
    let cancelled = false;
    setFailureLoading(true);
    setFailureError(null);
    getReliabilityKpiChildren({
      kpiNames: MACHINE_FAILURE_KPIS,
      date,
      granularity,
      // One row per failure, or per (machine, failure) pair. Either way the
      // published rows split by sub_section, so they are summed — never
      // joined (see the backend's `toLossTree`).
      groupBy: view === "failure" ? "remarks" : "machine,remarks",
      agg: "sum",
      status: status || undefined,
      section: section || undefined,
      machine: machine || undefined,
    })
      .then((res) => !cancelled && setFailureRows(Array.isArray(res?.rows) ? res.rows : []))
      .catch((err) => !cancelled && setFailureError(err))
      .finally(() => !cancelled && setFailureLoading(false));
    return () => {
      cancelled = true;
    };
  }, [needsFailureRows, view, date, granularity, status, section, machine]);

  /* ─── filter options: every machine of the period, before filtering ─── */
  const options = useMemo(() => {
    const uniq = (key) =>
      [...new Set(machineRows.map((r) => r[key]).filter((v) => v != null && v !== ""))].sort();
    return { statuses: uniq("status"), sections: uniq("section"), machines: uniq("machine") };
  }, [machineRows]);

  // A section/category choice can exclude the pinned machine; clearing it
  // keeps the three dropdowns from describing an empty scope.
  const scopeMachines = useMemo(
    () =>
      machineRows.filter(
        (r) =>
          (!status || r.status === status) &&
          (!section || r.section === section) &&
          (!machine || r.machine === machine),
      ),
    [machineRows, status, section, machine],
  );

  /* ─── the scope banner's figures ─── */
  const scope = useMemo(() => {
    let minutes = 0;
    let occurrences = 0;
    let scheduled = 0;
    let measured = false;
    for (const r of scopeMachines) {
      if (r.BreakdownMin_m != null) minutes += r.BreakdownMin_m;
      if (r.BreakdownOcc_m != null) occurrences += r.BreakdownOcc_m;
      if (r.ScheduledMin_m != null) {
        scheduled += r.ScheduledMin_m;
        measured = true;
      }
    }
    return {
      minutes,
      occurrences,
      scheduled,
      pct: measured && scheduled > 0 ? (minutes / scheduled) * 100 : null,
      machineCount: scopeMachines.length,
    };
  }, [scopeMachines]);

  /* ─── the Pareto rows for the active lens ─── */
  const rows = useMemo(() => {
    const build = () => {
      if (view === "machine") {
        return scopeMachines.map((r) => ({
          key: r.machine,
          label: r.machine ?? "—",
          status: r.status,
          section: r.section,
          minutes: r.BreakdownMin_m,
          occurrences: r.BreakdownOcc_m,
          pct: r.Breakdown_Pct_m,
        }));
      }
      if (view === "failure") {
        return failureRows.map((r) => ({
          key: r.remarks,
          label: r.remarks ?? "—",
          minutes: r.BreakdownMin_m_Failure,
          occurrences: r.BreakdownOcc_m_Failure,
          // No per-failure percentage is published without a machine
          // dimension, so this one is the scope's own denominator.
          pct:
            r.BreakdownMin_m_Failure != null && scope.scheduled > 0
              ? (r.BreakdownMin_m_Failure / scope.scheduled) * 100
              : null,
        }));
      }
      return failureRows.map((r) => ({
        key: `${r.machine}␟${r.remarks}`,
        label: `${r.machine ?? "—"} — ${r.remarks ?? "—"}`,
        minutes: r.BreakdownMin_m_Failure,
        occurrences: r.BreakdownOcc_m_Failure,
        pct: r.Breakdown_Pct_m_Failure,
      }));
    };

    const measured = build()
      .map((r) => ({ ...r, measure: measure === "downtime" ? r.minutes : r.occurrences }))
      // A Pareto ranks what was lost; a machine that ran clean has no bar.
      .filter((r) => r.measure != null && r.measure > 0)
      .sort((a, b) => b.measure - a.measure);

    const total = measured.reduce((s, r) => s + r.measure, 0);
    return measured.map((r) => ({ ...r, share: total ? (r.measure / total) * 100 : 0 }));
  }, [view, measure, scopeMachines, failureRows, scope.scheduled]);

  const measureTotal = useMemo(() => rows.reduce((s, r) => s + r.measure, 0), [rows]);

  // How many of the sorted rows it takes to reach 80% of the scope — the
  // Pareto's actual finding.
  const barsTo80 = useMemo(() => {
    if (!measureTotal) return 0;
    let running = 0;
    for (let i = 0; i < rows.length; i++) {
      running += rows[i].measure;
      if ((running / measureTotal) * 100 >= 80) return i + 1;
    }
    return rows.length;
  }, [rows, measureTotal]);

  // What the plotted bars actually cover. With a long tail (plant-wide
  // machine × phenomenon runs to ~1,300 rows) the cumulative line is
  // legitimately low, and saying so is the point — it reads as "no
  // concentration at this grain; narrow the scope", not as a broken chart.
  const plottedShare = useMemo(
    () =>
      measureTotal
        ? (rows.slice(0, MAX_BARS).reduce((s, r) => s + r.measure, 0) / measureTotal) * 100
        : 0,
    [rows, measureTotal],
  );

  const activeMeasure = MEASURES.find((m) => m.id === measure);
  const loading = machineLoading || (needsFailureRows && failureLoading);
  const error = machineError || failureError;

  const groupLabel =
    view === "machine" ? "Machine" : view === "failure" ? "Failure Phenomenon" : "Machine × Phenomenon";

  const columns = [
    {
      key: "label",
      label: groupLabel,
      align: "left",
      render: (r) => r.label,
    },
    ...(view === "machine"
      ? [
          { key: "section", label: "Section", render: (r) => r.section ?? "—" },
          { key: "status", label: "Category", render: (r) => <GradeChip grade={r.status} /> },
        ]
      : []),
    {
      key: "minutes",
      label: "Downtime (min)",
      align: "right",
      render: (r) => fmtNum(r.minutes),
    },
    {
      key: "occurrences",
      label: "Occurrences",
      align: "right",
      render: (r) => fmtNum(r.occurrences),
    },
    {
      key: "pct",
      label: "Breakdown %",
      align: "right",
      render: (r) => (r.pct == null ? "—" : fmtNum(r.pct, 2) + "%"),
    },
    {
      key: "share",
      label: "Share of scope",
      align: "right",
      render: (r) => fmtNum(r.share, 1) + "%",
    },
  ];

  const pctBasis =
    view === "failure"
      ? "small figure = the row's share of the scope's scheduled time"
      : "small figure = that row's own Breakdown % (of its machine's scheduled time)";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <ControlRow label="View by">
        {VIEWS.map((v) => (
          <Pill key={v.id} active={view === v.id} accent={C.pp} onClick={() => setView(v.id)}>
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

      <ControlRow label="Filter">
        <FilterSelect
          allLabel="All categories"
          value={status}
          options={options.statuses}
          onChange={setStatus}
        />
        <FilterSelect
          allLabel="All sections"
          value={section}
          options={options.sections}
          onChange={setSection}
        />
        <FilterSelect
          allLabel="All machines"
          value={machine}
          options={options.machines}
          onChange={setMachine}
        />
        {(status || section || machine) && (
          <button
            onClick={() => {
              setStatus("");
              setSection("");
              setMachine("");
            }}
            style={{
              padding: "7px 12px",
              borderRadius: 8,
              border: "1px solid " + C.bd,
              background: C.cd,
              color: C.pp,
              fontSize: 12.5,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Clear
          </button>
        )}
      </ControlRow>

      {error ? (
        <div style={{ padding: 14, color: C.rd, fontSize: 13 }}>
          Pareto fetch failed: {error.message || "Request failed"}
        </div>
      ) : loading ? (
        <JKLoader message="Loading Pareto" />
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
            <b style={{ color: C.tx }}>Scope:</b> {status || "all categories"} ·{" "}
            {section || "all sections"} · {machine ? `machine ${machine}` : `${fmtNum(scope.machineCount)} machines`} —{" "}
            <b style={{ color: C.tx }}>{fmtNum(scope.minutes)} min</b> over{" "}
            <b style={{ color: C.tx }}>{fmtNum(scope.occurrences)}</b> breakdowns, Breakdown{" "}
            <b style={{ color: C.tx }}>{scope.pct == null ? "—" : fmtNum(scope.pct, 2) + "%"}</b>.{" "}
            {rows.length === 0
              ? "No breakdowns recorded in this scope."
              : `Cumulative % is on this scope: ${fmtNum(barsTo80)} of ${fmtNum(rows.length)} rows carry 80%.`}
          </div>

          {rows.length > 0 && (
            <>
              <ParetoChart
                rows={rows}
                measure={measure}
                total={measureTotal}
                barsTo80={barsTo80}
              />
              <div style={{ fontSize: 12, color: C.mu, textAlign: "center", lineHeight: 1.5 }}>
                Bars = {activeMeasure.label.toLowerCase()} (additive) · amber line = cumulative % of
                scope · {pctBasis}
                {rows.length > MAX_BARS &&
                  ` · top ${MAX_BARS} of ${fmtNum(rows.length)} plotted = ${fmtNum(plottedShare, 1)}% of scope`}
              </div>
            </>
          )}

          <DTable
            columns={columns}
            rows={rows}
            getRowKey={(r) => r.key}
            emptyMessage="No breakdowns recorded in this scope."
          />
        </>
      )}
    </div>
  );
}

/**
 * The modal chrome: "PARETO ANALYSIS / Breakdown", a close button, click-out
 * and Escape — the same affordances as the reference and as `TrendModal`,
 * whose place this takes for the Breakdown KPI.
 *
 * @param {{ open: boolean, onClose: () => void, date: string, granularity: string, title?: string, initialView?: string }} props
 */
function BreakdownParetoModal({ open, onClose, date, granularity, title = "Breakdown", initialView }) {
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
              Pareto Analysis
            </div>
            <div style={{ fontSize: 19, fontWeight: 700, color: C.tx, marginTop: 2 }}>
              {title}
            </div>
          </div>
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
            {"\u2715"}
          </button>
        </div>
        <div style={{ padding: "16px 18px" }}>
          <ParetoBody date={date} granularity={granularity} initialView={initialView} />
        </div>
      </div>
    </div>
  );
}

export default BreakdownParetoModal;
