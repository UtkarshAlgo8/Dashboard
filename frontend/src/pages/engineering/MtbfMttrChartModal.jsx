/**
 * The MTBF / MTTR chart, opened from either the MTBF or the MTTR card, built
 * to plot_drilldown_spec §3 in the Production trend modal's look.
 *
 *   MEASURE   MTBF · MTTR      (the clicked card picks the first one)
 *   VIEW BY   Section · Machine
 *   DISPLAY   Bars · Map       (Map at machine level only)
 *
 * A click on a bar, a bubble or a table row opens the next level:
 *
 *   Section ──► Machine ──► Discipline ──► Failure (MTTR only)
 *
 * Every level is its own gold file read as published, with two exceptions
 * the data forces:
 *
 * - SECTION is pooled from the machine rows' own `section` column, because
 *   gold has no `MTBF_Section` / `MTTR_Section`:
 *     MTBF(section) = Σ OperatingMin_m ÷ Σ BreakdownOcc_m
 *     MTTR(section) = Σ BreakdownMin_m ÷ Σ BreakdownOcc_m
 *   Summing the components and dividing once is what the engine does, so it
 *   lands on the engine's figures (Curing 126.7 hrs in Aug 2026, the spec's
 *   acceptance test 9). It is not an average of the level below.
 * - DAILY and DATE RANGE sum DAY rows, and a rate cannot be summed, so both
 *   pool the same components per machine as well. Gold has no per-discipline
 *   occurrence file to pool, so in those modes the drill stops at Machine.
 *
 * Units follow the spec's examples: MTBF in hrs everywhere; MTTR in hrs at
 * Section and Machine, in min at Discipline and Failure.
 */
import { useCallback, useMemo, useRef, useState } from "react";
import { Box, Link, Stack, Typography, useTheme } from "@mui/material";
import {
  getReliabilityKpiChildren,
  getReliabilitySummary,
} from "@/api/engineering.js";
import DataTable from "@/components/tables/DataTable.jsx";
import DrillColumnChart from "@/components/trend/DrillColumnChart.jsx";
import {
  ChartPanel,
  DrillBreadcrumb,
  ModalFrame,
  SingleSelectRow,
} from "@/components/trend/TrendModalParts.jsx";
import { usePolledQuery } from "@/hooks/usePolledQuery.js";
import { formatIndianNumber } from "@/lib/numberFormat.js";
import MtbfMttrMap from "./MtbfMttrMap.jsx";
import ExportButton from "./ExportButton.jsx";
import {
  DISCIPLINES,
  OTHER_DISCIPLINE,
  UNMAPPED,
  categoryColor,
  categoryGroups,
  disciplineColor,
  fmtDrill,
  lighter,
  num,
} from "./reliabilityDrill.js";
import {
  reliabilityTrendRequest,
  useReliabilityTrendRange,
} from "./reliabilityTrendRange.jsx";
import { TARGETS } from "./reliabilityTargets.js";

const LEVELS = [
  { id: "section", label: "Section" },
  { id: "machine", label: "Machine" },
  { id: "discipline", label: "Discipline" },
  { id: "failure", label: "Failure" },
];

const MEASURES = [
  { value: "mtbf", label: "MTBF" },
  { value: "mttr", label: "MTTR" },
];

const VIEWS_BY = [
  { value: "section", label: "Section" },
  { value: "machine", label: "Machine" },
];

const DISPLAYS = [
  { value: "bars", label: "Bars" },
  { value: "map", label: "Map" },
];

// Every machine that ran publishes OperatingMin_m; only machines that broke
// publish the other two. OperatingMin_m leads so every machine row carries
// its section and category.
const POOL_KPIS = ["OperatingMin_m", "BreakdownMin_m", "BreakdownOcc_m"];
const DISCIPLINE_KPIS = [
  "MTBF_m_Discipline",
  "MTTR_m_Discipline",
  "BreakdownMin_m_Discipline",
];
const FAILURE_KPIS = [
  "MTTR_m_Failure",
  "BreakdownOcc_m_Failure",
  "BreakdownMin_m_Failure",
];

// Spec §3: "Show the top 15, plus a 'Show all' link." No "Other" bar.
const MAX_BARS = 15;

const ratio = (a, b) => (a != null && b ? a / b : null);
const toHrs = (min) => (min == null ? null : min / 60);

/** MTBF: low is worst. MTTR: high is worst. "No breakdown" goes last. */
function worstFirst(measure) {
  return (a, b) => {
    if (a.value == null && b.value == null) return 0;
    if (a.value == null) return 1;
    if (b.value == null) return -1;
    return measure === "mtbf" ? a.value - b.value : b.value - a.value;
  };
}

function periodLabel(request) {
  if (!request.aggregate) {
    const d = new Date(`${request.date}T00:00:00`);
    return Number.isNaN(d.getTime())
      ? request.date
      : d.toLocaleString("en-IN", { month: "short", year: "numeric" });
  }
  return `${request.from} – ${request.to}`;
}

/**
 * @param {{ open: boolean, onClose: () => void, date: string,
 *   granularity: string, asOf?: string, measure: "mtbf"|"mttr" }} props
 */
function MtbfMttrChartModal({
  open,
  onClose,
  date,
  asOf,
  measure: cardMeasure,
}) {
  const theme = useTheme();
  // The chart panel (title + plot or map) — what the plot's PDF captures.
  const chartRef = useRef(null);
  const [measure, setMeasure] = useState(cardMeasure);
  const [viewBy, setViewBy] = useState("section");
  const [path, setPath] = useState([]);
  const [display, setDisplay] = useState("bars");
  const [showAll, setShowAll] = useState(false);

  // Each opening starts from the card's measure at the top level.
  const [previousOpen, setPreviousOpen] = useState(false);
  if (open !== previousOpen) {
    setPreviousOpen(open);
    if (open) {
      setMeasure(cardMeasure);
      setViewBy("section");
      setPath([]);
      setDisplay("bars");
      setShowAll(false);
    }
  }

  const trend = useReliabilityTrendRange({ open });
  const request = reliabilityTrendRequest({
    preset: trend.preset,
    from: trend.from,
    to: trend.to,
    asOf: asOf ?? date,
  });
  const aggregate = request.aggregate;

  // The drill depth this measure and period allow. A deeper path is kept,
  // only cut for display, so switching back restores it — except that
  // switching to MTBF at Failure lands on Discipline (spec §3).
  const startLevel = viewBy === "section" ? 0 : 1;
  const lastLevel = aggregate ? 1 : measure === "mtbf" ? 2 : 3;
  const trail = useMemo(
    () => path.slice(0, Math.max(0, lastLevel - startLevel)),
    [path, lastLevel, startLevel],
  );
  const level = startLevel + trail.length;
  const levelId = LEVELS[level].id;
  const pinned = Object.fromEntries(trail.map((step) => [step.level, step]));

  const period = {
    date: request.date,
    from: request.from,
    to: request.to,
    granularity: request.granularity,
  };
  const periodKey = JSON.stringify(period);

  // Machine rows feed Section, Machine and the Map — one read, cut by the
  // pinned section on the client.
  const machineKpis = aggregate
    ? POOL_KPIS
    : [...POOL_KPIS, "MTBF_m", "MTTR_m"];
  const machineQuery = usePolledQuery(
    () =>
      getReliabilityKpiChildren({
        ...period,
        kpiNames: machineKpis,
        groupBy: "machine",
        agg: aggregate ? "sum" : undefined,
        includeUnmapped: true,
      }).then((res) => ({ key: periodKey, rows: res?.rows ?? [] })),
    { enabled: open, interval: 0, deps: [periodKey] },
  );

  const levelRequest =
    levelId === "discipline"
      ? { kpiNames: DISCIPLINE_KPIS, groupBy: "sub_section" }
      : levelId === "failure"
        ? {
            kpiNames: FAILURE_KPIS,
            groupBy: "remarks",
            subSection: pinned.discipline.value,
          }
        : null;
  const levelKey = levelRequest
    ? JSON.stringify([periodKey, levelId, pinned.machine?.value, levelRequest])
    : null;
  const levelQuery = usePolledQuery(
    () =>
      getReliabilityKpiChildren({
        ...period,
        ...levelRequest,
        machine: pinned.machine.value,
        includeUnmapped: true,
      }).then((res) => ({ key: levelKey, rows: res?.rows ?? [] })),
    { enabled: open && Boolean(levelRequest), interval: 0, deps: [levelKey] },
  );

  // The plant's own MTBF / MTTR for the period: the MTBF reference line and
  // the Map crosshair.
  const summaryQuery = usePolledQuery(
    () =>
      getReliabilitySummary(
        aggregate
          ? { date: request.from, from: request.from, to: request.to }
          : { date: request.date, granularity: request.granularity },
      ).then((res) => ({ key: periodKey, values: res?.values ?? {} })),
    { enabled: open, interval: 0, deps: [periodKey] },
  );
  const plantValues =
    summaryQuery.data?.key === periodKey ? summaryQuery.data.values : {};
  const plant = {
    mtbf: toHrs(num(plantValues.MTBF_Overall)),
    mttr: toHrs(num(plantValues.MTTR_Overall)),
  };

  const machines = useMemo(() => {
    if (machineQuery.data?.key !== periodKey) return null;
    return machineQuery.data.rows
      .filter((r) => r.machine)
      .map((r) => {
        const op = num(r.OperatingMin_m);
        const min = num(r.BreakdownMin_m);
        const occ = num(r.BreakdownOcc_m);
        return {
          machine: r.machine,
          section: r.section || UNMAPPED,
          status: r.status || UNMAPPED,
          op,
          min,
          occ,
          // Monthly reads the published rate; a summed window pools it.
          mtbf: toHrs(aggregate ? ratio(op, occ) : num(r.MTBF_m)),
          mttr: toHrs(aggregate ? ratio(min, occ) : num(r.MTTR_m)),
        };
      });
  }, [machineQuery.data, periodKey, aggregate]);

  const levelRows =
    levelQuery.data?.key === levelKey ? levelQuery.data.rows : null;

  const unit = measure === "mttr" && level >= 2 ? "min" : "hrs";

  // One list of rows per level: the chart's columns and the table's rows.
  const rows = useMemo(() => {
    const pick = (r) => (measure === "mtbf" ? r.mtbf : r.mttr);
    if (levelId === "section") {
      if (!machines) return null;
      const pooled = new Map();
      for (const m of machines) {
        const b = pooled.get(m.section) ?? {
          op: 0,
          min: 0,
          occ: 0,
          machines: 0,
        };
        b.op += m.op ?? 0;
        b.min += m.min ?? 0;
        b.occ += m.occ ?? 0;
        if (m.occ) b.machines += 1;
        pooled.set(m.section, b);
      }
      return [...pooled.entries()].map(([section, b]) => {
        const row = {
          key: section,
          label: section,
          mtbf: toHrs(ratio(b.op, b.occ)),
          mttr: toHrs(ratio(b.min, b.occ)),
          occ: b.occ,
          min: b.min,
          machines: b.machines,
          color:
            section === UNMAPPED
              ? categoryColor(UNMAPPED)
              : theme.custom.brand.blue,
        };
        return { ...row, value: pick(row) };
      });
    }
    if (levelId === "machine") {
      if (!machines) return null;
      return (
        machines
          .filter((m) => !pinned.section || m.section === pinned.section.value)
          .map((m) => ({
            ...m,
            key: m.machine,
            label: m.machine,
            value: pick(m),
            color: categoryColor(m.status),
          }))
          // A machine that did not break down has no rate; the section's
          // "no breakdown" label is the place for that, not 200 empty slots.
          .filter((m) => m.value != null)
      );
    }
    if (!levelRows) return null;
    if (levelId === "discipline") {
      const bySub = new Map(levelRows.map((r) => [r.sub_section, r]));
      const shown = [
        ...DISCIPLINES,
        ...(num(bySub.get(OTHER_DISCIPLINE.id)?.[DISCIPLINE_KPIS[0]]) != null ||
        num(bySub.get(OTHER_DISCIPLINE.id)?.[DISCIPLINE_KPIS[1]]) != null
          ? [OTHER_DISCIPLINE]
          : []),
      ];
      return shown.map((d) => {
        const r = bySub.get(d.id) ?? {};
        const row = {
          key: d.id,
          label: d.id,
          mtbf: toHrs(num(r.MTBF_m_Discipline)),
          mttr: num(r.MTTR_m_Discipline),
          min: num(r.BreakdownMin_m_Discipline),
          color: d.color,
        };
        return { ...row, value: pick(row) };
      });
    }
    // failure (MTTR only)
    const color = disciplineColor(pinned.discipline?.value);
    return levelRows
      .map((r) => {
        const n = num(r.BreakdownOcc_m_Failure);
        return {
          key: r.remarks,
          label: r.remarks,
          mttr: num(r.MTTR_m_Failure),
          value: num(r.MTTR_m_Failure),
          occ: n,
          min: num(r.BreakdownMin_m_Failure),
          // Spec §3: "Draw single-event bars lighter."
          color: n === 1 ? lighter(color) : color,
        };
      })
      .filter((r) => r.value != null);
  }, [
    levelId,
    machines,
    levelRows,
    measure,
    pinned.section,
    pinned.discipline,
    theme,
  ]);

  const ranked = useMemo(
    () => (rows ? [...rows].sort(worstFirst(measure)) : []),
    [rows, measure],
  );
  const capped = levelId === "machine" || levelId === "failure";
  const shown = capped && !showAll ? ranked.slice(0, MAX_BARS) : ranked;
  const clickable = level < lastLevel;

  const goTo = useCallback(
    (item) => {
      setPath([
        ...trail,
        { level: levelId, value: item.key, label: item.label },
      ]);
      setShowAll(false);
    },
    [trail, levelId],
  );

  const items = shown.map((r) => ({
    key: r.key,
    label: r.label,
    value: r.value,
    color: r.color,
    clickable: clickable && r.value != null,
    dataLabel:
      r.value == null
        ? "no breakdown"
        : levelId === "failure"
          ? `${fmtDrill(r.value)} · n ${formatIndianNumber(r.occ)}`
          : fmtDrill(r.value),
    tooltip: tooltipFor(r, levelId),
  }));

  const refLine =
    measure === "mtbf"
      ? plant.mtbf == null
        ? null
        : { value: plant.mtbf, label: `Plant MTBF ${fmtDrill(plant.mtbf)} hrs` }
      : unit === "hrs"
        ? { value: TARGETS.mttrHrs, label: `Target ${TARGETS.mttrHrs} hrs` }
        : {
            value: TARGETS.mttrHrs * 60,
            label: `Target ${TARGETS.mttrHrs * 60} min`,
          };

  const measureLabel = measure.toUpperCase();
  const chartTitle = `${measureLabel} by ${LEVELS[level].label.toLowerCase()} · ${periodLabel(request)}`;
  const isMap = levelId === "machine" && display === "map";
  const loading =
    level >= 2
      ? levelQuery.isLoading || !levelRows
      : machineQuery.isLoading || !machines;
  const empty = ranked.every((r) => r.value == null);
  const where = trail.length ? trail[trail.length - 1].label : null;
  const emptyMessage = loading
    ? "Loading…"
    : where
      ? `No breakdowns for ${where} in this period.`
      : "No breakdowns in this period.";

  const steps = [
    {
      label: viewBy === "section" ? "All sections" : "All machines",
      onClick: () => setPath([]),
    },
    ...trail.map((step, i) => ({
      label: step.label,
      onClick: () => setPath(trail.slice(0, i + 1)),
    })),
  ];

  const mapPoints = isMap
    ? ranked
        .filter((r) => r.mtbf != null && r.mttr != null)
        .map((r) => ({
          key: r.key,
          label: r.label,
          status: r.status,
          mtbf: r.mtbf,
          mttr: r.mttr,
          downtime: r.min,
          clickable: !aggregate,
        }))
    : [];

  return (
    <ModalFrame
      open={open}
      onClose={onClose}
      kpi={{ name: measureLabel, unit }}
      headerExtras={trend.control}
    >
      <Stack spacing={1.25}>
        <SingleSelectRow
          label="Measure"
          value={measure}
          onChange={setMeasure}
          options={MEASURES}
        />
        <SingleSelectRow
          label="View by"
          value={viewBy}
          onChange={(next) => {
            setViewBy(next);
            setPath([]);
            setShowAll(false);
          }}
          options={VIEWS_BY}
        />
        {levelId === "machine" && (
          <SingleSelectRow
            label="Display"
            value={display}
            onChange={setDisplay}
            options={DISPLAYS}
          />
        )}
      </Stack>

      <DrillBreadcrumb steps={steps} />

      <Box ref={chartRef}>
        <ChartPanel
          theme={theme}
          title={chartTitle}
          loading={loading}
          empty={loading || empty}
          emptyMessage={emptyMessage}
          action={
            !loading && !empty ? (
              <ExportButton
                targetRef={chartRef}
                columns={columnsFor(levelId, measure)}
                rows={ranked}
                name={chartTitle}
              />
            ) : null
          }
        >
          {isMap ? (
            <MtbfMttrMap points={mapPoints} plant={plant} onPick={goTo} />
          ) : (
            <DrillColumnChart
              items={items}
              unit={unit}
              xTitle={LEVELS[level].label}
              yTitle={`${measureLabel} (${unit})`}
              refLine={refLine}
              groups={
                levelId === "machine"
                  ? categoryGroups(shown.map((r) => r.status))
                  : null
              }
              onPick={goTo}
            />
          )}
        </ChartPanel>
      </Box>

      {!loading && !empty && (
        <Stack direction="row" spacing={2} sx={{ flexWrap: "wrap" }}>
          {capped && !isMap && ranked.length > MAX_BARS && (
            <Link
              component="button"
              type="button"
              underline="hover"
              onClick={() => setShowAll((v) => !v)}
              sx={{ fontSize: 13, fontWeight: 600 }}
            >
              {showAll
                ? `Show top ${MAX_BARS}`
                : `Show all ${formatIndianNumber(ranked.length)}`}
            </Link>
          )}
          {aggregate && levelId === "machine" && (
            <Typography sx={{ fontSize: 12, color: "text.secondary" }}>
              Daily and Date Range pool each machine&apos;s minutes and
              breakdowns. Pick Monthly to drill into disciplines and failures.
            </Typography>
          )}
          {levelId === "section" && (
            <Typography sx={{ fontSize: 12, color: "text.secondary" }}>
              Sections are pooled from their machines: Σ minutes ÷ Σ breakdowns,
              which matches the plant&apos;s own figures.
            </Typography>
          )}
        </Stack>
      )}

      {!loading && !empty && (
        <DataTable
          columns={columnsFor(levelId, measure)}
          rows={isMap ? ranked : shown}
          getRowKey={(r) => r.key}
          onRowClick={clickable ? (r) => r.value != null && goTo(r) : undefined}
          searchPlaceholder={`Search ${LEVELS[level].label.toLowerCase()}…`}
          emptyMessage={emptyMessage}
          toolbarRight={
            <ExportButton
              columns={columnsFor(levelId, measure)}
              rows={isMap ? ranked : shown}
              name={`${chartTitle}-table`}
            />
          }
        />
      )}
    </ModalFrame>
  );
}

function tooltipFor(r, levelId) {
  const lines = [];
  if (levelId === "machine") {
    lines.push(["Section", r.section], ["Category", r.status]);
  }
  const mttrUnit =
    levelId === "discipline" || levelId === "failure" ? "min" : "hrs";
  if (levelId !== "failure") {
    lines.push([
      "MTBF",
      r.mtbf == null ? "no breakdown" : `${fmtDrill(r.mtbf)} hrs`,
    ]);
  }
  lines.push([
    "MTTR",
    r.mttr == null ? "no breakdown" : `${fmtDrill(r.mttr)} ${mttrUnit}`,
  ]);
  if (r.occ != null) {
    lines.push([
      levelId === "failure" ? "Events" : "Breakdowns",
      formatIndianNumber(r.occ),
    ]);
  }
  if (r.min != null)
    lines.push(["Downtime", `${formatIndianNumber(r.min)} min`]);
  if (levelId === "section")
    lines.push(["Machines with a breakdown", formatIndianNumber(r.machines)]);
  return lines;
}

function columnsFor(levelId, measure) {
  const num2 = (key, label) => ({
    key,
    label,
    align: "right",
    render: (r) => (r[key] == null ? "no breakdown" : fmtDrill(r[key])),
  });
  const count = (key, label) => ({
    key,
    label,
    align: "right",
    render: (r) => formatIndianNumber(r[key]),
  });
  const name = {
    key: "label",
    label: LEVELS.find((l) => l.id === levelId).label,
    align: "left",
  };
  const mttrUnit =
    levelId === "discipline" || levelId === "failure" ? "min" : "hrs";
  const rates =
    levelId === "failure"
      ? [num2("mttr", "MTTR (min)")]
      : measure === "mtbf"
        ? [num2("mtbf", "MTBF (hrs)"), num2("mttr", `MTTR (${mttrUnit})`)]
        : [num2("mttr", `MTTR (${mttrUnit})`), num2("mtbf", "MTBF (hrs)")];
  if (levelId === "section") {
    return [
      name,
      ...rates,
      count("occ", "Breakdowns"),
      count("min", "Downtime (min)"),
      count("machines", "Machines with a breakdown"),
    ];
  }
  if (levelId === "machine") {
    return [
      name,
      { key: "section", label: "Section", align: "left" },
      { key: "status", label: "Category" },
      ...rates,
      count("occ", "Breakdowns"),
      count("min", "Downtime (min)"),
    ];
  }
  if (levelId === "discipline") {
    return [name, ...rates, count("min", "Downtime (min)")];
  }
  return [
    name,
    ...rates,
    count("occ", "Events"),
    count("min", "Downtime (min)"),
  ];
}

export default MtbfMttrChartModal;
