/**
 * The Breakdown chart, opened from the Breakdown card's trend icon (and, capped
 * at 10 machines, from Top Machine Breakdowns). Built to plot_drilldown_spec
 * §2 in the Production trend modal's look.
 *
 *   VIEW BY   Machine · Failure
 *   MEASURE   Downtime (min) · Occurrences
 *   FILTER    Category · Section
 *
 * A click on a bar or a table row opens the second level:
 *
 *   VIEW BY Machine   machine ──► its failures, coloured by discipline
 *   VIEW BY Failure   failure ──► the machines that have it
 *
 * The rows load once; a click only filters them (spec: "Load once. Every
 * click just filters these rows"):
 *
 *   Machine bars   BreakdownMin_m + BreakdownOcc_m (+ Breakdown_Pct_m)
 *   Failure bars   BreakdownMin_m_Failure + BreakdownOcc_m_Failure
 *                  (+ Breakdown_Pct_m_Failure), one row per
 *                  (machine, failure, discipline)
 *
 * Machine-bar occurrences come from `BreakdownOcc_m`: summing the failure
 * rows overcounts (0206 would read 78 instead of 70).
 *
 * Two departures, both agreed: the chart stays a Pareto (bars + cumulative
 * line), and the tail is not pooled into an "Other" bar — 221 machines sum to
 * 96,207 min against a 3,108-min leader, which would flatten every real bar.
 * The caption states what the tail carries instead.
 *
 * Breakdown % is only ever a published value: the machine's
 * `Breakdown_Pct_m`, or `Breakdown_Pct_m_Failure` while a machine is pinned.
 * A failure across machines has no published % and reads "—".
 */
import { useCallback, useMemo, useState } from "react";
import { Box, Stack, Typography, useTheme } from "@mui/material";
import Highcharts from "highcharts";
import HighchartsReactImport from "highcharts-react-official";
import { getReliabilityKpiChildren } from "@/api/engineering.js";
import DataTable from "@/components/tables/DataTable.jsx";
import {
  ChartPanel,
  DrillBreadcrumb,
  DropdownRow,
  ModalFrame,
  SingleSelectRow,
} from "@/components/trend/TrendModalParts.jsx";
import { usePolledQuery } from "@/hooks/usePolledQuery.js";
import { formatIndianNumber } from "@/lib/numberFormat.js";
import {
  DISCIPLINES,
  OTHER_DISCIPLINE,
  UNMAPPED,
  disciplineColor,
  num,
} from "./reliabilityDrill.js";
import {
  reliabilityTrendRequest,
  useReliabilityTrendRange,
} from "./reliabilityTrendRange.jsx";

const HighchartsReact = HighchartsReactImport?.default ?? HighchartsReactImport;

const MACHINE_KPIS = ["BreakdownMin_m", "BreakdownOcc_m", "Breakdown_Pct_m"];
const FAILURE_KPIS = [
  "BreakdownMin_m_Failure",
  "BreakdownOcc_m_Failure",
  "Breakdown_Pct_m_Failure",
];
// A rate cannot be summed over a date range.
const PCT_KPIS = new Set(["Breakdown_Pct_m", "Breakdown_Pct_m_Failure"]);

const VIEWS_BY = [
  { value: "machine", label: "Machine" },
  { value: "failure", label: "Failure" },
];

const MEASURES = [
  { value: "downtime", label: "Downtime (min)", key: "minutes", unit: "min" },
  { value: "occurrences", label: "Occurrences", key: "occurrences", unit: "" },
];

// Spec: "Show the top 15". See the header note on the tail.
const MAX_BARS = 15;

// Matching fractions keep the value and percentage axes on the same scale.
const PARETO_STEPS = [0, 0.2, 0.4, 0.6, 0.8, 1];

const fmt = (v, decimals = 0) =>
  formatIndianNumber(v, { maxDecimals: decimals, minDecimals: decimals });

function truncate(text, max = 30) {
  const s = String(text ?? "—");
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

/**
 * Sorted bars + a cumulative % line over the same order. Both axes span the
 * displayed rows' total, so the first cumulative point sits on the first bar.
 */
function ParetoChart({
  rows,
  measureLabel,
  groupLabel,
  barsTo80,
  groups,
  onPick,
}) {
  const theme = useTheme();
  const options = useMemo(() => {
    const grid = theme.palette.divider;
    const text = theme.palette.text.secondary;
    const strong = theme.palette.text.primary;
    const blue = theme.custom.brand.blue;
    const amber = theme.custom.brand.amber;
    const axisTitle = { color: text, fontSize: "12px", fontWeight: "700" };

    const displayedTotal = rows.reduce((sum, row) => sum + row.value, 0);
    const cumulative = rows
      .reduce((acc, r) => {
        const running = (acc.length ? acc[acc.length - 1].sum : 0) + r.value;
        acc.push({ sum: running });
        return acc;
      }, [])
      .map(({ sum }) => (displayedTotal ? (sum / displayedTotal) * 100 : 0));
    const valueMax = displayedTotal || 1;
    // The same headroom on both axes for the final marker and label.
    const headroom = 1.1;
    const longest = rows.reduce(
      (n, r) => Math.max(n, truncate(r.label).length),
      0,
    );
    // Upright labels are as tall as their text is long: machine codes ask
    // for ~70px, a failure phrase for ~220px.
    const upright = longest > 8;
    const labelRoom = upright
      ? Math.min(240, Math.max(90, longest * 6.2 + 30))
      : 70;
    const clickable = rows.some((r) => r.clickable);

    return {
      chart: {
        type: "column",
        height: 310 + labelRoom + 24 + (groups ? 30 : 0),
        backgroundColor: "transparent",
        spacing: [12, 8, 8, 8],
        style: { fontFamily: theme.typography.fontFamily },
      },
      title: { text: null },
      credits: { enabled: false },
      accessibility: { enabled: false },
      legend: {
        enabled: Boolean(groups),
        itemStyle: { color: text, fontSize: "11px", fontWeight: 600 },
        symbolWidth: 12,
        symbolHeight: 12,
      },
      alignTicks: false,
      xAxis: {
        categories: rows.map((r) => r.label),
        title: { text: groupLabel, style: axisTitle },
        lineColor: grid,
        tickLength: 0,
        labels: {
          rotation: upright ? -90 : 0,
          align: upright ? "right" : "center",
          overflow: "allow",
          crop: false,
          useHTML: true,
          style: {
            fontSize: "11px",
            color: text,
            whiteSpace: "nowrap",
            textOverflow: "none",
          },
          formatter: function () {
            // The name, and under it that row's own published Breakdown %.
            const row = rows[this.pos];
            const own = row?.pct == null ? null : fmt(row.pct, 2) + "%";
            return (
              `<div style="line-height:1.3">` +
              `<div style="color:${text}">${truncate(this.value)}</div>` +
              (own
                ? `<div style="color:${theme.palette.text.disabled}">${own}</div>`
                : "") +
              `</div>`
            );
          },
        },
      },
      yAxis: [
        {
          title: { text: measureLabel, style: axisTitle },
          gridLineColor: grid,
          min: 0,
          max: valueMax * headroom,
          endOnTick: false,
          tickPositions: PARETO_STEPS.map((f) => f * valueMax),
          labels: {
            style: { fontSize: "11px", color: text },
            formatter: function () {
              return fmt(this.value);
            },
          },
        },
        {
          min: 0,
          max: 100 * headroom,
          endOnTick: false,
          tickPositions: PARETO_STEPS.map((f) => f * 100),
          opposite: true,
          title: {
            text: "Cumulative % of displayed total",
            style: { ...axisTitle, color: amber },
          },
          labels: {
            style: { fontSize: "11px", color: amber },
            formatter: function () {
              return fmt(this.value) + "%";
            },
          },
          gridLineWidth: 0,
          plotLines: [
            {
              value: 80,
              color: amber,
              dashStyle: "Dash",
              width: 1,
              zIndex: 3,
              label: {
                text: "80% of displayed total",
                align: "right",
                x: -4,
                y: -5,
                style: { color: amber, fontSize: "10px", fontWeight: "700" },
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
            row.tooltip.map(([k, v]) => `${k}: <b>${v}</b>`).join("<br/>") +
            `<br/>Cumulative of displayed total: <b>${fmt(cumulative[idx], 1)}%</b>` +
            (row.clickable
              ? `<br/><span style="color:${text}">Click to drill down</span>`
              : "")
          );
        },
      },
      plotOptions: {
        column: {
          // One bar per category: the legend-only discipline series below
          // would otherwise each claim a slot and push the bar off-centre.
          grouping: false,
          borderWidth: 0,
          borderRadius: 3,
          groupPadding: 0.12,
          pointPadding: 0.06,
          cursor: clickable ? "pointer" : undefined,
          point: {
            events: {
              click: function () {
                const row = rows[this.index];
                if (row?.clickable) onPick?.(row);
              },
            },
          },
          dataLabels: {
            enabled: true,
            style: {
              fontSize: "11px",
              fontWeight: "700",
              color: strong,
              textOutline: "none",
            },
            formatter: function () {
              return fmt(this.y);
            },
          },
        },
      },
      series: [
        {
          name: measureLabel,
          type: "column",
          yAxis: 0,
          showInLegend: false,
          data: rows.map((r, i) => ({
            y: r.value,
            // A discipline colour when the level has one; otherwise solid up
            // to the 80% cut and faded after it.
            color: r.color ?? (i < barsTo80 ? blue : blue + "66"),
          })),
        },
        {
          name: "Cumulative %",
          type: "line",
          yAxis: 1,
          color: amber,
          lineWidth: 2,
          showInLegend: false,
          enableMouseTracking: true,
          marker: { enabled: true, radius: 4, symbol: "circle" },
          dataLabels: {
            enabled: true,
            crop: false,
            overflow: "allow",
            style: {
              fontSize: "11px",
              fontWeight: "700",
              color: amber,
              textOutline: "none",
            },
            formatter: function () {
              return fmt(this.y, 1) + "%";
            },
          },
          data: cumulative,
        },
        // Legend-only series: one swatch per discipline.
        ...(groups ?? []).map((g) => ({
          name: g.name,
          color: g.color,
          type: "column",
          data: [],
          events: { legendItemClick: () => false },
        })),
      ],
    };
  }, [rows, measureLabel, groupLabel, barsTo80, groups, onPick, theme]);

  return (
    <Box sx={{ width: "100%" }}>
      <HighchartsReact highcharts={Highcharts} options={options} />
    </Box>
  );
}

/** Sum the failure rows into one row per `by` ("remarks" or "machine"). */
function groupFailures(rows, by) {
  const out = new Map();
  for (const r of rows) {
    const key = r[by];
    const g = out.get(key) ?? {
      key,
      label: key,
      section: r.section,
      status: r.status,
      minutes: 0,
      occurrences: 0,
      pct: null,
      split: new Map(),
    };
    g.minutes += r.minutes;
    g.occurrences += r.occurrences ?? 0;
    if (r.pct != null) g.pct = (g.pct ?? 0) + r.pct;
    g.split.set(r.sub_section, (g.split.get(r.sub_section) ?? 0) + r.minutes);
    out.set(key, g);
  }
  return [...out.values()];
}

function ParetoView({
  date,
  granularity,
  from,
  to,
  aggregate = false,
  initialViewBy,
  maxBars = MAX_BARS,
  periodText,
}) {
  const theme = useTheme();
  const [viewBy, setViewBy] = useState(initialViewBy ?? "machine");
  const [measure, setMeasure] = useState("downtime");
  const [category, setCategory] = useState("");
  const [section, setSection] = useState("");
  // The clicked bar: a machine (VIEW BY Machine) or a failure (VIEW BY
  // Failure). null = level 1.
  const [picked, setPicked] = useState(null);

  const period = { date, from, to, granularity };
  const periodKey = JSON.stringify(period);
  const withoutPct = (names) =>
    aggregate ? names.filter((n) => !PCT_KPIS.has(n)) : names;

  const machineQuery = usePolledQuery(
    () =>
      getReliabilityKpiChildren({
        ...period,
        kpiNames: withoutPct(MACHINE_KPIS),
        groupBy: "machine",
        agg: aggregate ? "sum" : undefined,
        includeUnmapped: true,
      }).then((res) => ({ key: periodKey, rows: res?.rows ?? [] })),
    { interval: 0, deps: [periodKey] },
  );
  const failureQuery = usePolledQuery(
    () =>
      getReliabilityKpiChildren({
        ...period,
        kpiNames: withoutPct(FAILURE_KPIS),
        groupBy: "machine,remarks,sub_section",
        // One gold row per tuple in a month, so the sum is that row; over a
        // range it adds the days.
        agg: "sum",
        includeUnmapped: true,
      }).then((res) => ({ key: periodKey, rows: res?.rows ?? [] })),
    { interval: 0, deps: [periodKey] },
  );

  const machineRows = useMemo(
    () =>
      machineQuery.data?.key === periodKey
        ? machineQuery.data.rows
            .filter((r) => r.machine)
            .map((r) => ({
              machine: r.machine,
              section: r.section || UNMAPPED,
              status: r.status || UNMAPPED,
              minutes: num(r.BreakdownMin_m),
              occurrences: num(r.BreakdownOcc_m),
              pct: num(r.Breakdown_Pct_m),
            }))
        : null,
    [machineQuery.data, periodKey],
  );
  const failureRows = useMemo(
    () =>
      failureQuery.data?.key === periodKey
        ? failureQuery.data.rows
            .map((r) => ({
              machine: r.machine,
              remarks: r.remarks,
              sub_section: r.sub_section,
              section: r.section || UNMAPPED,
              status: r.status || UNMAPPED,
              minutes: num(r.BreakdownMin_m_Failure),
              occurrences: num(r.BreakdownOcc_m_Failure),
              pct: num(r.Breakdown_Pct_m_Failure),
            }))
            // Breakdown_Pct_m_Failure is published for pairs that never
            // broke down; those are not failures.
            .filter((r) => r.minutes > 0)
        : null,
    [failureQuery.data, periodKey],
  );

  // Option lists are cut by the filter above them.
  const categoryOptions = useMemo(
    () =>
      [...new Set((machineRows ?? []).map((r) => r.status))].sort((a, b) =>
        a === UNMAPPED ? 1 : b === UNMAPPED ? -1 : a.localeCompare(b),
      ),
    [machineRows],
  );
  const sectionOptions = useMemo(
    () =>
      [
        ...new Set(
          (machineRows ?? [])
            .filter((r) => !category || r.status === category)
            .map((r) => r.section),
        ),
      ].sort(),
    [machineRows, category],
  );
  // A section the category no longer offers is not applied.
  const activeSection = sectionOptions.includes(section) ? section : "";

  const inScope = useCallback(
    (r) =>
      (!category || r.status === category) &&
      (!activeSection || r.section === activeSection),
    [category, activeSection],
  );

  const measureDef = MEASURES.find((m) => m.value === measure);
  const level = picked ? 2 : 1;

  // One list per level: the chart's bars and the table's rows.
  const allRows = useMemo(() => {
    if (!machineRows || !failureRows) return null;
    let built;
    if (viewBy === "machine" && !picked) {
      built = machineRows.filter(inScope).map((r) => ({
        ...r,
        key: r.machine,
        label: r.machine,
      }));
    } else if (viewBy === "machine") {
      // The clicked machine's failures. A failure filed under two
      // disciplines is one bar, coloured by the one with more minutes.
      built = groupFailures(
        failureRows.filter((r) => r.machine === picked.key),
        "remarks",
      ).map((g) => {
        const split = [...g.split.entries()].sort((a, b) => b[1] - a[1]);
        return {
          ...g,
          discipline: split[0]?.[0],
          splitText:
            split.length > 1
              ? split.map(([d, m]) => `${d} ${fmt(m)} min`).join(" · ")
              : null,
          color: disciplineColor(split[0]?.[0]),
        };
      });
    } else if (!picked) {
      // Failures across machines: no published % of their own.
      built = groupFailures(failureRows.filter(inScope), "remarks").map(
        (g) => ({ ...g, pct: null }),
      );
    } else {
      built = groupFailures(
        failureRows.filter((r) => r.remarks === picked.key && inScope(r)),
        "machine",
      );
    }

    const ranked = built
      .map((r) => ({ ...r, value: r[measureDef.key] }))
      // A Pareto ranks what was lost; a machine that ran clean has no bar.
      .filter((r) => r.value != null && r.value > 0)
      .sort((a, b) => b.value - a.value);
    const total = ranked.reduce((s, r) => s + r.value, 0);
    return ranked.map((r) => ({
      ...r,
      share: total ? (r.value / total) * 100 : 0,
      clickable: level === 1,
    }));
  }, [machineRows, failureRows, viewBy, picked, inScope, measureDef, level]);

  const measureTotal = useMemo(
    () => (allRows ?? []).reduce((s, r) => s + r.value, 0),
    [allRows],
  );

  // How many distinct rows carry 80% of the scope — counted on real rows.
  const rowsTo80 = useMemo(() => {
    if (!allRows || !measureTotal) return 0;
    let running = 0;
    for (let i = 0; i < allRows.length; i++) {
      running += allRows[i].value;
      if ((running / measureTotal) * 100 >= 80) return i + 1;
    }
    return allRows.length;
  }, [allRows, measureTotal]);

  const groupLabel =
    viewBy === "machine"
      ? picked
        ? "Failure"
        : "Machine"
      : picked
        ? "Machine"
        : "Failure";

  const barRows = useMemo(
    () =>
      (allRows ?? []).slice(0, maxBars).map((r) => ({
        ...r,
        tooltip: [
          ...(r.section && groupLabel === "Machine"
            ? [
                ["Section", r.section],
                ["Category", r.status],
              ]
            : []),
          ...(r.splitText
            ? [["Disciplines", r.splitText]]
            : r.discipline
              ? [["Discipline", r.discipline]]
              : []),
          ["Downtime", `${fmt(r.minutes)} min`],
          ["Occurrences", fmt(r.occurrences)],
          ...(r.pct == null ? [] : [["Breakdown %", `${fmt(r.pct, 2)}%`]]),
          ["Share of scope", `${fmt(r.share, 1)}%`],
        ],
      })),
    [allRows, maxBars, groupLabel],
  );
  const plottedShare = measureTotal
    ? (barRows.reduce((s, r) => s + r.value, 0) / measureTotal) * 100
    : 0;

  // Discipline legend for a machine's failures, in the fixed order.
  const disciplineGroups = useMemo(() => {
    if (!(viewBy === "machine" && picked)) return null;
    const present = new Set(barRows.map((r) => r.discipline));
    return [...DISCIPLINES, OTHER_DISCIPLINE]
      .filter((d) => present.has(d.id))
      .map((d) => ({ name: d.id, color: d.color }));
  }, [viewBy, picked, barRows]);

  const pick = useCallback(
    (row) => setPicked({ key: row.key, label: row.label }),
    [],
  );

  const loading = machineQuery.isLoading || !machineRows || !failureRows;
  const error = machineQuery.error || failureQuery.error;
  const scopeMinutes = (allRows ?? []).reduce(
    (s, r) => s + (r.minutes ?? 0),
    0,
  );
  const scopeOcc = (allRows ?? []).reduce(
    (s, r) => s + (r.occurrences ?? 0),
    0,
  );
  const plural = groupLabel === "Machine" ? "machines" : "failures";
  const emptyMessage = error
    ? `Breakdown chart fetch failed: ${error.message || "Request failed"}`
    : loading
      ? "Loading…"
      : picked
        ? `No breakdowns for ${picked.label} in this period.`
        : "No breakdowns in this period.";

  const steps = [
    {
      label: viewBy === "machine" ? "All machines" : "All failures",
      onClick: () => setPicked(null),
    },
    ...(picked ? [{ label: picked.label }] : []),
  ];

  const columns = [
    { key: "label", label: groupLabel, align: "left" },
    ...(groupLabel === "Machine"
      ? [
          { key: "section", label: "Section", align: "left" },
          { key: "status", label: "Category" },
        ]
      : []),
    ...(viewBy === "machine" && picked
      ? [{ key: "discipline", label: "Discipline", align: "left" }]
      : []),
    {
      key: "minutes",
      label: "Downtime (min)",
      align: "right",
      render: (r) => fmt(r.minutes),
    },
    {
      key: "occurrences",
      label: "Occurrences",
      align: "right",
      render: (r) => fmt(r.occurrences),
    },
    {
      key: "pct",
      label: "Breakdown %",
      align: "right",
      render: (r) => (r.pct == null ? "—" : fmt(r.pct, 2) + "%"),
    },
    {
      key: "share",
      label: "Share of scope",
      align: "right",
      render: (r) => fmt(r.share, 1) + "%",
    },
  ];

  return (
    <>
      <Stack spacing={1.25}>
        <SingleSelectRow
          label="View by"
          value={viewBy}
          onChange={(next) => {
            setViewBy(next);
            setPicked(null);
          }}
          options={VIEWS_BY}
        />
        <SingleSelectRow
          label="Measure"
          value={measure}
          onChange={setMeasure}
          options={MEASURES}
        />
        <DropdownRow
          label="Filter"
          filters={[
            {
              id: "category",
              value: category,
              onChange: (v) => {
                setCategory(v);
                setSection("");
              },
              options: categoryOptions,
              allLabel: "All categories",
            },
            {
              id: "section",
              value: activeSection,
              onChange: setSection,
              options: sectionOptions,
              allLabel: "All sections",
            },
          ]}
        />
      </Stack>

      <DrillBreadcrumb steps={steps} />

      <ChartPanel
        theme={theme}
        title={`${measureDef.label} by ${groupLabel.toLowerCase()} · ${periodText}`}
        loading={loading}
        empty={loading || Boolean(error) || barRows.length === 0}
        emptyMessage={emptyMessage}
      >
        <ParetoChart
          rows={barRows}
          measureLabel={measureDef.label}
          groupLabel={groupLabel}
          barsTo80={disciplineGroups ? barRows.length : rowsTo80}
          groups={disciplineGroups}
          onPick={pick}
        />
      </ChartPanel>

      {!loading && !error && barRows.length > 0 && (
        <>
          <Typography sx={{ fontSize: 12, color: "text.secondary" }}>
            <b>{fmt(scopeMinutes)} min</b> over <b>{fmt(scopeOcc)}</b>{" "}
            breakdowns. {fmt(rowsTo80)} of {fmt(allRows.length)} {plural} carry
            80% of the {measureDef.label.toLowerCase()}.
            {allRows.length > maxBars &&
              ` Top ${maxBars} = ${fmt(plottedShare, 1)}% of scope; the remaining ${fmt(
                allRows.length - maxBars,
              )} carry ${fmt(100 - plottedShare, 1)}%.`}
            {level === 1 && " Click a bar or a row to drill down."}
          </Typography>
          <DataTable
            columns={columns}
            rows={allRows}
            getRowKey={(r) => r.key}
            onRowClick={level === 1 ? pick : undefined}
            searchPlaceholder={`Search ${groupLabel.toLowerCase()}…`}
            emptyMessage="No breakdowns recorded in this scope."
          />
        </>
      )}
    </>
  );
}

/**
 * @param {{ open: boolean, onClose: () => void, date: string,
 *   granularity: string, asOf?: string, title?: string,
 *   initialViewBy?: string, maxBars?: number }} props
 */
function BreakdownChartModal({
  open,
  onClose,
  date,
  asOf,
  title = "Breakdown",
  initialViewBy,
  maxBars,
}) {
  // No Daily view here: Monthly and a custom Date Range only.
  const trend = useReliabilityTrendRange({ open, hiddenPresets: ["today"] });
  const request = reliabilityTrendRequest({
    preset: trend.preset,
    from: trend.from,
    to: trend.to,
    asOf: asOf ?? date,
  });
  const periodText = request.aggregate
    ? `${request.from} – ${request.to}`
    : new Date(`${request.date}T00:00:00`).toLocaleString("en-IN", {
        month: "short",
        year: "numeric",
      });

  return (
    <ModalFrame
      open={open}
      onClose={onClose}
      kpi={{ name: title }}
      headerExtras={trend.control}
    >
      {/* Remounted per opening so every opening starts at level 1. */}
      {open && (
        <ParetoView
          date={request.date}
          from={request.from}
          to={request.to}
          granularity={request.granularity}
          aggregate={request.aggregate}
          initialViewBy={initialViewBy}
          maxBars={maxBars}
          periodText={periodText}
        />
      )}
    </ModalFrame>
  );
}

export default BreakdownChartModal;
