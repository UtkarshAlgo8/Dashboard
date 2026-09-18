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
 *
 * Look and interaction follow the mock: its `TrendPanel` shell and its
 * `HBarChart` — horizontal bars, label left, value at the bar end, a dashed
 * amber target tick per row, and bars going green or red against that
 * target. Both live in reliabilityChrome.jsx. The data, the controls and the
 * figures follow the KPI spec.
 */
import { useEffect, useMemo, useState } from "react";
import { getReliabilityKpiChildren } from "@/api/engineering.js";
import JKLoader from "@/components/JKLoader.jsx";
import { C, DTable, GradeChip, fmtNum } from "./reliabilityShared.jsx";
import {
  AnalysisModal,
  Block,
  ChartCaption,
  Chip,
  ControlLabel,
  ControlRow,
  HBarChart,
  ScopeBanner,
} from "./reliabilityChrome.jsx";
import { TARGETS } from "./reliabilityTargets.js";

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

  const machineCount = machines.filter((m) => m[measureId] != null).length;

  return (
    <AnalysisModal
      open={open}
      onClose={onClose}
      eyebrow="KPI Trend Analysis"
      title="MTBF / MTTR"
      maxWidth={1000}
    >
      <ControlRow>
        <ControlLabel>View by</ControlLabel>
        {VIEWS_BY.map((v) => (
          <Chip key={v.id} on={viewBy === v.id} color={C.pp} onClick={() => setViewBy(v.id)}>
            {v.label}
          </Chip>
        ))}
        <span style={{ width: 12 }} />
        <ControlLabel gutter={false}>Measure</ControlLabel>
        {Object.values(MEASURES).map((m) => (
          <Chip key={m.id} on={measureId === m.id} onClick={() => setMeasureId(m.id)}>
            {m.label}
          </Chip>
        ))}
      </ControlRow>

      {viewBy === "section" ? (
        <Block title={`${measure.label} by Section`}>
          <div style={{ fontSize: 12.5, color: C.md, lineHeight: 1.6 }}>
            <b style={{ color: C.tx }}>This view needs a KPI the engine is not publishing.</b>
            <div style={{ marginTop: 6 }}>
              It reads <code>MTBF_Section</code> and <code>MTTR_Section</code> directly. Gold
              carries no such rows today — only the <code>_Grade_Section</code> pairs, which are cut
              by machine category as well as section.
            </div>
            <div style={{ marginTop: 6 }}>
              A section cannot be rebuilt from those: the spec measured it — Curing pooled by the
              engine is 7,600 min, while averaging its grade rows gives 7,554 — and rules 2, 3 and 8
              forbid recomputing a rate in the UI. So this view stays empty until the two files
              land. Use the <b>Machine</b> view meanwhile.
            </div>
          </div>
        </Block>
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
            <ScopeBanner>
              <b style={{ color: C.tx }}>Top machine: </b>
              {topMachine.label} ({topMachine.section ?? "—"}) —{" "}
              <b style={{ color: C.tx }}>{fmtNum(topMachine.minutes)} min</b>,{" "}
              {fmtNum(topMachine.contribution, 1)}% of plant breakdown
            </ScopeBanner>
          )}

          <Block title={`${measure.label} by Machine (hrs) — ${measure.sense}`}>
            <HBarChart
              items={barRows.map((r) => ({ label: r.label, value: r.hours }))}
              unit="hrs"
              target={measure.targetHrs}
              higherIsBetter={measure.id === "mtbf"}
            />
            <ChartCaption>
              Read from {measure.kpi} and divided by 60 · sorted by {measure.label} · top{" "}
              {MAX_BARS} of {fmtNum(machineCount)} · bars are green on target, red off it. No pooled
              "Other" bar: {measure.label} is a ratio, and a ratio may not be summed or averaged.
              {measure.id === "mtbf" && TARGETS.mtbfNeedsRebaseline
                ? ` The ${fmtNum(TARGETS.mtbfHrs)} hr target is the stated figure and is flagged in the spec for re-baselining — it assumed 24 h/day, while the plant runs 480 min × active shifts, putting real plant MTBF near 91 hrs.`
                : " The target is hardcoded; no threshold_value is published."}
            </ChartCaption>
          </Block>

          <div style={{ marginTop: 10 }}>
            <DTable
              columns={columns}
              rows={machines}
              getRowKey={(r) => r.key}
              emptyMessage="No machines published for this period."
            />
          </div>
        </>
      )}
    </AnalysisModal>
  );
}

export default MtbfMttrChartModal;
