/* eslint-disable */
/**
 * The MTBF / MTTR bar chart, opened from either the MTBF or the MTTR card.
 * One chart, two controls, exactly as the KPI spec defines it:
 *
 *   VIEW BY   Section · Machine
 *   MEASURE   MTBF · MTTR
 *
 * Files — read directly, one per view. "Sort by `actual_value`, plot. No
 * calculation in the UI."
 *
 *   Section   mtbf_section · mttr_section      ← NOT PUBLISHED, see below
 *   Machine   mtbf_m · mttr_m
 *
 * WHY THE SECTION VIEW IS EMPTY. The spec is explicit: "Section rows are
 * pooled by the engine, not averaged from the grade rows. Curing pooled is
 * 7,600 min; averaging its grade-C and grade-D rows gives 7,554. Always read
 * `mtbf_section` — never rebuild a section from `mtbf_grade_section`." Gold
 * publishes no `MTBF_Section`, `MTTR_Section` or `Breakdown_Pct_Section` row
 * today — the only `%Section%` kpi_names are the `_Grade_Section` pairs. So
 * this view states the gap instead of filling it with UI arithmetic that
 * rules 2, 3 and 8 forbid. It starts working the day the engine publishes
 * those two files; nothing here needs to change but the empty state going
 * away.
 *
 * Machine view columns are the spec's: Machine · Section · Downtime (min) ·
 * Events · MTBF (min) · MTTR (min) · Contribution %. Both rates are shown
 * side by side even though the bars show one, because "they often disagree,
 * and the difference is the point".
 *
 * The single piece of UI arithmetic is Contribution % — `BreakdownMin_m` for
 * that machine ÷ the sum of `BreakdownMin_m` in scope × 100 — which rule 3
 * permits by name as "a plain share of a total".
 */
import { useEffect, useMemo, useState } from "react";
import Highcharts from "highcharts";
import HighchartsReactImport from "highcharts-react-official";
import { getReliabilityKpiChildren } from "@/api/engineering.js";
import JKLoader from "@/components/JKLoader.jsx";
import { C, DTable, GradeChip, fmtNum } from "./reliabilityShared.jsx";
import { TARGETS } from "./reliabilityTargets.js";

const HighchartsReact = HighchartsReactImport?.default ?? HighchartsReactImport;

// One fetch serves both measures and the whole table.
const MACHINE_KPIS = ["MTBF_m", "MTTR_m", "BreakdownMin_m", "BreakdownOcc_m"];

const VIEWS_BY = [
  { id: "section", label: "Section" },
  { id: "machine", label: "Machine" },
];

const MEASURES = {
  mtbf: {
    id: "mtbf",
    label: "MTBF",
    kpi: "MTBF_m",
    targetHrs: TARGETS.mtbfHrs,
    sense: "higher is better",
  },
  mttr: {
    id: "mttr",
    label: "MTTR",
    kpi: "MTTR_m",
    targetHrs: TARGETS.mttrHrs,
    sense: "lower is better",
  },
};

// Spec: "default the Machine view to the top 15-20". No "Other" bar here —
// MTBF and MTTR are ratios, and rule 8 forbids summing or averaging them, so
// a pooled tail bar could not be computed honestly.
const MAX_BARS = 20;

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
      {active ? children : children}
    </button>
  );
}

/** Bars of the active measure in hours, with the hardcoded target line. */
function MeasureBars({ rows, measure }) {
  const options = useMemo(() => {
    const longest = rows.reduce((n, r) => Math.max(n, String(r.label).length), 0);
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
          style: { fontSize: "11px", color: C.md, whiteSpace: "nowrap", textOverflow: "none" },
        },
      },
      yAxis: {
        title: { text: null },
        gridLineColor: C.bd,
        labels: { style: { fontSize: "11px", color: C.mu } },
        // Bars are sorted, so both ends of the plot are occupied and an
        // inline plot-line label sits on top of one. The target is named in
        // the legend line above the chart instead.
        softMax: measure.targetHrs * 1.05,
        plotLines: [
          {
            value: measure.targetHrs,
            color: C.am,
            dashStyle: "Dash",
            width: 1.5,
            zIndex: 3,
          },
        ],
      },
      tooltip: {
        useHTML: true,
        formatter: function () {
          const row = rows[this.point.index];
          if (!row) return false;
          return (
            `<b>${row.label}</b><br/>` +
            `MTBF: <b>${row.mtbf == null ? "—" : fmtNum(row.mtbf / 60, 1) + " hrs"}</b><br/>` +
            `MTTR: <b>${row.mttr == null ? "—" : fmtNum(row.mttr / 60, 2) + " hrs"}</b><br/>` +
            `Downtime: <b>${fmtNum(row.minutes)} min</b><br/>` +
            `Events: <b>${fmtNum(row.events)}</b>`
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
              return fmtNum(this.y, this.y < 10 ? 2 : 1);
            },
          },
        },
      },
      series: [{ name: `${measure.label} (hrs)`, type: "column", data: rows.map((r) => r.hours) }],
    };
  }, [rows, measure]);

  return <HighchartsReact highcharts={Highcharts} options={options} />;
}

/**
 * @param {{ open: boolean, onClose: () => void, date: string, granularity: string,
 *           initialMeasure?: "mtbf"|"mttr" }} props
 */
function MtbfMttrChartModal({ open, onClose, date, granularity, initialMeasure = "mtbf" }) {
  // Opens on the card the user clicked, and on the view that has published
  // files behind it.
  const [viewBy, setViewBy] = useState("machine");
  const [measureId, setMeasureId] = useState(initialMeasure);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (open) setMeasureId(initialMeasure);
  }, [open, initialMeasure]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    getReliabilityKpiChildren({
      kpiNames: MACHINE_KPIS,
      date,
      granularity,
      groupBy: "machine",
    })
      .then((res) => !cancelled && setRows(Array.isArray(res?.rows) ? res.rows : []))
      .catch((err) => !cancelled && setError(err))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [open, date, granularity]);

  const measure = MEASURES[measureId];

  const machines = useMemo(() => {
    const scopeMinutes = rows.reduce((s, r) => s + (r.BreakdownMin_m ?? 0), 0);
    return rows.map((r) => ({
      key: r.machine,
      label: r.machine ?? "—",
      section: r.section,
      status: r.status,
      minutes: r.BreakdownMin_m ?? 0,
      events: r.BreakdownOcc_m,
      mtbf: r.MTBF_m,
      mttr: r.MTTR_m,
      // The one UI calculation the spec names here.
      contribution: scopeMinutes ? ((r.BreakdownMin_m ?? 0) / scopeMinutes) * 100 : 0,
    }));
  }, [rows]);

  // Bars: the active measure, sorted by actual_value as the spec says.
  const barRows = useMemo(
    () =>
      machines
        .filter((m) => m[measureId] != null)
        .sort((a, b) => b[measureId] - a[measureId])
        .slice(0, MAX_BARS)
        .map((m) => ({ ...m, hours: m[measureId] / 60 })),
    [machines, measureId],
  );

  // Spec: "Top machine = first row when sorted by downtime. Call it out
  // above the chart."
  const topMachine = useMemo(
    () => [...machines].sort((a, b) => b.minutes - a.minutes)[0] ?? null,
    [machines],
  );

  const columns = [
    { key: "label", label: "Machine", align: "left", render: (r) => r.label },
    { key: "section", label: "Section", render: (r) => r.section ?? "—" },
    { key: "status", label: "Category", render: (r) => <GradeChip grade={r.status} /> },
    { key: "minutes", label: "Downtime (min)", align: "right", render: (r) => fmtNum(r.minutes) },
    { key: "events", label: "Events", align: "right", render: (r) => fmtNum(r.events) },
    { key: "mtbf", label: "MTBF (min)", align: "right", render: (r) => fmtNum(r.mtbf, 0) },
    { key: "mttr", label: "MTTR (min)", align: "right", render: (r) => fmtNum(r.mttr, 1) },
    {
      key: "contribution",
      label: "Contribution %",
      align: "right",
      render: (r) => fmtNum(r.contribution, 1) + "%",
    },
  ];

  if (!open) return null;

  const machineCount = machines.filter((m) => m[measureId] != null).length;

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
              Reliability Analysis
            </div>
            <div style={{ fontSize: 19, fontWeight: 700, color: C.tx, marginTop: 2 }}>
              MTBF / MTTR
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
            {"✕"}
          </button>
        </div>

        <div style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 12 }}>
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
              View by
            </span>
            {VIEWS_BY.map((v) => (
              <Pill
                key={v.id}
                active={viewBy === v.id}
                accent={C.pp}
                onClick={() => setViewBy(v.id)}
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
            {Object.values(MEASURES).map((m) => (
              <Pill key={m.id} active={measureId === m.id} onClick={() => setMeasureId(m.id)}>
                {m.label}
              </Pill>
            ))}
          </div>

          {viewBy === "section" ? (
            <div
              style={{
                border: "1px solid " + C.bd,
                background: C.c2,
                borderRadius: 8,
                padding: "16px 14px",
                fontSize: 13,
                color: C.md,
                lineHeight: 1.6,
              }}
            >
              <b style={{ color: C.tx }}>Section view needs a KPI the engine is not publishing.</b>
              <div style={{ marginTop: 6 }}>
                It reads <code>MTBF_Section</code> and <code>MTTR_Section</code> directly. Gold
                carries no such rows today — only the <code>_Grade_Section</code> pairs, which are
                cut by machine category as well as section.
              </div>
              <div style={{ marginTop: 6 }}>
                A section cannot be rebuilt from those: the spec measured it — Curing pooled by the
                engine is 7,600 min, while averaging its grade rows gives 7,554 — and rules 2, 3
                and 8 forbid recomputing a rate in the UI. So this view stays empty until the two
                files land. Use the <b>Machine</b> view meanwhile.
              </div>
            </div>
          ) : error ? (
            <div style={{ padding: 14, color: C.rd, fontSize: 13 }}>
              MTBF/MTTR fetch failed: {error.message || "Request failed"}
            </div>
          ) : loading ? (
            <JKLoader message="Loading machines" />
          ) : barRows.length === 0 ? (
            <div style={{ padding: 16, color: C.mu, fontSize: 13 }}>
              No {measure.label} rows published for this period.
            </div>
          ) : (
            <>
              {topMachine && (
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
                  <b style={{ color: C.tx }}>Top machine:</b> {topMachine.label} (
                  {topMachine.section ?? "—"}) — <b style={{ color: C.tx }}>{fmtNum(topMachine.minutes)} min</b>,{" "}
                  {fmtNum(topMachine.contribution, 1)}% of plant breakdown
                </div>
              )}

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: 11.5,
                  color: C.md,
                  fontWeight: 600,
                }}
              >
                <span
                  style={{
                    width: 16,
                    borderTop: "1.5px dashed " + C.am,
                    display: "inline-block",
                  }}
                />
                Target {measure.id === "mtbf" ? "≥" : "<"} {fmtNum(measure.targetHrs)} hrs
                <span style={{ color: C.mu, fontWeight: 500 }}>
                  (hardcoded — no threshold_value is published)
                </span>
              </div>

              <MeasureBars rows={barRows} measure={measure} />

              <div style={{ fontSize: 12, color: C.mu, textAlign: "center", lineHeight: 1.5 }}>
                {measure.label} in hours per machine ({measure.sense}), read from{" "}
                {measure.kpi} and divided by 60 · sorted by {measure.label} · top {MAX_BARS} of{" "}
                {fmtNum(machineCount)}
                {". "}
                No pooled "Other" bar: {measure.label} is a ratio, and a ratio may not be summed or
                averaged.{" "}
                {measure.id === "mtbf" && TARGETS.mtbfNeedsRebaseline
                  ? `Target ${fmtNum(TARGETS.mtbfHrs)} hrs is the stated figure and is flagged in the spec for re-baselining — it assumed 24 h/day, while the plant runs 480 min × active shifts.`
                  : "Target is hardcoded; no threshold is published."}
              </div>

              <DTable
                columns={columns}
                rows={machines}
                getRowKey={(r) => r.key}
                emptyMessage="No machines published for this period."
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default MtbfMttrChartModal;
