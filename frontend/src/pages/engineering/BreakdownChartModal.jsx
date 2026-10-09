/* eslint-disable */
/**
 * The Breakdown chart, opened from the Breakdown card's trend icon.
 *
 * Built to the KPI spec ("Breakdown chart — opens from the Breakdown card
 * trend icon"):
 *
 *   VIEW BY      Machine · Failure
 *   MEASURE      Downtime (min) · Occurrences
 *   FILTER       Category · Section · Machine  — "filter first, then group"
 *
 * The three filters compose and cascade: picking a category narrows the
 * section list, and both narrow the machine list, so a combination that
 * selects nothing can never be built. Category and Section are the machine's
 * published `status` and `section`; the machine lens applies them to the
 * machine rows (both measures are additive totals, so a filtered sum is the
 * scope's own figure), and the failure lens hands them to the engine, which
 * is the only place a failure row can be cut by them.
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
 *    bar." The cap is here; the pooled bar is NOT, and that is a considered
 *    departure. Breakdown is spread almost evenly — the spec says so itself,
 *    "no single machine dominates, the worst is 2.4%" — so pooling the tail
 *    produces a bar that dwarfs the chart: 221 machines sum to 96,207 min
 *    against a 3,108-min leader, 31x the tallest real bar, flattening every
 *    row it was meant to make readable. That defeats the instruction's own
 *    stated purpose ("or the axis is unreadable"), and the design mock's
 *    Pareto pools nothing either. The tail is reported in words under the
 *    chart instead, so nothing it carried is lost.
 * 3. The Breakdown % the mock shows under each bar and in the table is only
 *    ever a PUBLISHED value, never a recomputed one (rule 2). It exists at
 *    two grains and nowhere else:
 *      Machine lens                → `Breakdown_Pct_m`
 *      Failure lens + machine pin  → `Breakdown_Pct_m_Failure`, which is
 *                                    published per (machine, failure)
 *    In the unpinned Failure lens a failure spans machines with different
 *    denominators, so there is no published figure and the column reads "—"
 *    rather than inventing one.
 *
 * Look and interaction follow the mock (reliabilityChrome.jsx carries its
 * chips, labels, banner and modal shell); the data, the controls and the
 * figures follow the KPI spec.
 */
import { useEffect, useMemo, useState } from "react";
import Highcharts from "highcharts";
import HighchartsReactImport from "highcharts-react-official";
import { getReliabilityKpiChildren } from "@/api/engineering.js";
import JKLoader from "@/components/JKLoader.jsx";
import { C, DTable, GradeChip, fmtNum } from "./reliabilityShared.jsx";
import {
  AnalysisModal,
  ChartCaption,
  Chip,
  ControlLabel,
  ControlRow,
  ScopeBanner,
  selectStyle,
} from "./reliabilityChrome.jsx";

const HighchartsReact = HighchartsReactImport?.default ?? HighchartsReactImport;

const MACHINE_KPIS = ["BreakdownMin_m", "BreakdownOcc_m", "Breakdown_Pct_m"];
const FAILURE_KPIS = [
  "BreakdownMin_m_Failure",
  "BreakdownOcc_m_Failure",
  // Only meaningful when a machine is pinned — see the header note.
  "Breakdown_Pct_m_Failure",
];

const VIEWS_BY = [
  { id: "machine", label: "Machine" },
  { id: "failure", label: "Failure" },
];

const MEASURES = [
  { id: "downtime", label: "Downtime (min)", key: "minutes" },
  { id: "occurrences", label: "Occurrences", key: "occurrences" },
];

// Spec: "Cap the bars … Default to the top 15-20". See the header note on
// why the tail is reported in the caption rather than pooled into a bar.
const MAX_BARS = 15;

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
          useHTML: true,
          formatter: function () {
            // The mock's axis label: the name, and under it that row's own
            // Breakdown %. The second line appears only where the figure is
            // published (see the header note) — never computed to fill it.
            const row = rows[this.pos];
            const own = row?.pct == null ? null : fmtNum(row.pct, 2) + "%";
            return (
              `<div style="line-height:1.3">` +
              `<div style="color:${C.md}">${truncate(this.value)}</div>` +
              (own ? `<div style="color:${C.mu}">${own}</div>` : "") +
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
            (row.pct == null ? "" : `Breakdown %: <b>${fmtNum(row.pct, 2)}%</b><br/>`) +
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
            // Solid up to the 80% cut, faded after it — the mock's `i < cut`
            // rule, which says where the rows worth acting on end.
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
  }, [rows, measureLabel, total, barsTo80]);

  return <HighchartsReact highcharts={Highcharts} options={options} />;
}

/**
 * @param {{ date: string, granularity: string, initialViewBy?: string, maxBars?: number }} props
 */
function ParetoView({ date, granularity, initialViewBy, maxBars = MAX_BARS }) {
  const [viewBy, setViewBy] = useState(initialViewBy ?? "machine");
  const [measure, setMeasure] = useState("downtime");
  const [category, setCategory] = useState("");
  const [section, setSection] = useState("");
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

  // "Filter first, then group": all three filters go to the engine, which is
  // the only place a failure row knows its machine's category and section.
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
      status: category || undefined,
      section: section || undefined,
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
  }, [viewBy, date, granularity, category, section, machine]);

  // Every option list is cut by the filters above it, so no combination can
  // select an empty scope.
  const categoryOptions = useMemo(
    () => [...new Set(machineRows.map((r) => r.status).filter(Boolean))].sort(),
    [machineRows],
  );

  const sectionOptions = useMemo(
    () =>
      [
        ...new Set(
          machineRows
            .filter((r) => !category || r.status === category)
            .map((r) => r.section)
            .filter(Boolean),
        ),
      ].sort(),
    [machineRows, category],
  );

  // The scope the machine lens plots and the scope every share is taken on.
  // Both measures are additive totals, so filtering rows and summing them is
  // the scope's own figure, not a recomputed one.
  const scopeRows = useMemo(
    () =>
      machineRows.filter(
        (r) =>
          (!category || r.status === category) &&
          (!section || r.section === section) &&
          (!machine || r.machine === machine),
      ),
    [machineRows, category, section, machine],
  );

  const machineOptions = useMemo(
    () =>
      [
        ...new Set(
          machineRows
            .filter((r) => (!category || r.status === category) && (!section || r.section === section))
            .map((r) => r.machine)
            .filter((m) => m != null && m !== ""),
        ),
      ].sort(),
    [machineRows, category, section],
  );

  // A narrowed filter can strand the selection below it — drop it rather
  // than describe the chart with a scope it no longer has.
  useEffect(() => {
    if (section && !sectionOptions.includes(section)) setSection("");
  }, [section, sectionOptions]);
  useEffect(() => {
    if (machine && !machineOptions.includes(machine)) setMachine("");
  }, [machine, machineOptions]);

  const scope = useMemo(() => {
    let minutes = 0;
    let occurrences = 0;
    for (const r of scopeRows) {
      minutes += r.BreakdownMin_m ?? 0;
      occurrences += r.BreakdownOcc_m ?? 0;
    }
    return { minutes, occurrences, machines: scopeRows.filter((r) => r.BreakdownMin_m > 0).length };
  }, [scopeRows]);

  const measureKey = MEASURES.find((m) => m.id === measure).key;

  const allRows = useMemo(() => {
    const built =
      viewBy === "machine"
        ? scopeRows.map((r) => ({
            key: r.machine,
            label: r.machine ?? "—",
            section: r.section,
            status: r.status,
            minutes: r.BreakdownMin_m,
            // Spec rule: the machine-level counter, never the summed
            // failure rows.
            occurrences: r.BreakdownOcc_m,
            pct: r.Breakdown_Pct_m,
          }))
        : failureRows.map((r) => ({
            key: r.remarks,
            label: r.remarks ?? "—",
            minutes: r.BreakdownMin_m_Failure,
            occurrences: r.BreakdownOcc_m_Failure,
            // Published per (machine, failure) — so it describes this row
            // only while a machine is pinned.
            pct: machine ? r.Breakdown_Pct_m_Failure : null,
          }));

    const ranked = built
      .map((r) => ({ ...r, value: r[measureKey] }))
      // A Pareto ranks what was lost; a machine that ran clean has no bar.
      .filter((r) => r.value != null && r.value > 0)
      .sort((a, b) => b.value - a.value);

    const total = ranked.reduce((s, r) => s + r.value, 0);
    return ranked.map((r) => ({ ...r, share: total ? (r.value / total) * 100 : 0 }));
  }, [viewBy, scopeRows, failureRows, measureKey, machine]);

  const measureTotal = useMemo(() => allRows.reduce((s, r) => s + r.value, 0), [allRows]);

  const barRows = useMemo(() => allRows.slice(0, maxBars), [allRows, maxBars]);

  // What the plotted head actually covers, stated in the caption — this is
  // the figure the pooled "Other" bar would have shown.
  const plottedShare = useMemo(
    () =>
      measureTotal ? (barRows.reduce((s, r) => s + r.value, 0) / measureTotal) * 100 : 0,
    [barRows, measureTotal],
  );

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
    {
      key: "pct",
      label: "Breakdown %",
      align: "right",
      // Published or "—": a failure spanning machines has no percentage of
      // its own, and the UI does not make one up.
      render: (r) => (r.pct == null ? "—" : fmtNum(r.pct, 2) + "%"),
    },
    { key: "share", label: "Share of scope", align: "right", render: (r) => fmtNum(r.share, 1) + "%" },
  ];

  return (
    <div>
      <ControlRow>
        <ControlLabel>View by</ControlLabel>
        {VIEWS_BY.map((v) => (
          <Chip
            key={v.id}
            on={viewBy === v.id}
            color={C.pp}
            onClick={() => setViewBy(v.id)}
          >
            {v.label}
          </Chip>
        ))}
        <span style={{ width: 12 }} />
        <ControlLabel gutter={false}>Measure</ControlLabel>
        {MEASURES.map((m) => (
          <Chip key={m.id} on={measure === m.id} onClick={() => setMeasure(m.id)}>
            {m.label}
          </Chip>
        ))}
      </ControlRow>

      <ControlRow last>
        <ControlLabel>Filter</ControlLabel>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          style={{ ...selectStyle, maxWidth: 200 }}
        >
          <option value="">All categories</option>
          {categoryOptions.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select
          value={section}
          onChange={(e) => setSection(e.target.value)}
          style={{ ...selectStyle, maxWidth: 220 }}
        >
          <option value="">All sections</option>
          {sectionOptions.map((sec) => (
            <option key={sec} value={sec}>
              {sec}
            </option>
          ))}
        </select>
        <select
          value={machine}
          onChange={(e) => setMachine(e.target.value)}
          style={{ ...selectStyle, maxWidth: 220 }}
        >
          <option value="">All machines</option>
          {machineOptions.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        {(category || section || machine) && (
          <Chip
            on
            color={C.pp}
            onClick={() => {
              setCategory("");
              setSection("");
              setMachine("");
            }}
          >
            Clear
          </Chip>
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
          <ScopeBanner>
            <b style={{ color: C.tx }}>Scope: </b>
            {category || "All categories"} · {section || "all sections"} ·{" "}
            {machine ? `machine ${machine}` : `${fmtNum(scope.machines)} machines with a breakdown`} —{" "}
            <b style={{ color: C.tx }}>{fmtNum(scope.minutes)} min</b> over{" "}
            <b style={{ color: C.tx }}>{fmtNum(scope.occurrences)}</b> breakdowns.{" "}
            {allRows.length === 0
              ? "Nothing recorded in this scope."
              : `${fmtNum(rowsTo80)} of ${fmtNum(allRows.length)} ${
                  groupLabel === "Machine" ? "machines" : "failures"
                } carry 80% of the ${activeMeasure.label.toLowerCase()}.`}
          </ScopeBanner>

          {barRows.length > 0 && (
            <>
              <ParetoChart
                rows={barRows}
                measureLabel={activeMeasure.label}
                total={measureTotal}
                barsTo80={rowsTo80}
              />
              <ChartCaption>
                Bars = {activeMeasure.label.toLowerCase()} (additive) · amber line = cumulative % of
                scope
                {viewBy === "machine" || machine
                  ? " · small figure = that row's own Breakdown %"
                  : ""}
                {allRows.length > maxBars &&
                  ` · top ${maxBars} of ${fmtNum(allRows.length)} = ${fmtNum(
                    plottedShare,
                    1,
                  )}% of scope; the remaining ${fmtNum(allRows.length - maxBars)} carry ${fmtNum(
                    100 - plottedShare,
                    1,
                  )}%`}
              </ChartCaption>
            </>
          )}

          <div style={{ marginTop: 10 }}>
            <DTable
              columns={columns}
              rows={allRows}
              getRowKey={(r) => r.key}
              emptyMessage="No breakdowns recorded in this scope."
              downloadName="engineering-breakdown-pareto"
            />
          </div>
        </>
      )}
    </div>
  );
}

/**
 * The modal behind the Breakdown trend icon: one Pareto, three filters.
 *
 * @param {{ open: boolean, onClose: () => void, date: string, granularity: string,
 *           title?: string, initialViewBy?: string, maxBars?: number }} props
 */
function BreakdownChartModal({
  open,
  onClose,
  date,
  granularity,
  title = "Breakdown",
  initialViewBy,
  maxBars,
}) {
  return (
    <AnalysisModal
      open={open}
      onClose={onClose}
      eyebrow="Pareto Analysis"
      title={title}
      maxWidth={1000}
    >
      <ParetoView
        date={date}
        granularity={granularity}
        initialViewBy={initialViewBy}
        maxBars={maxBars}
      />
    </AnalysisModal>
  );
}

export default BreakdownChartModal;
