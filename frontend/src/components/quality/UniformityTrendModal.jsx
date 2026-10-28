import { useMemo, useState } from "react";
import { Stack, useTheme } from "@mui/material";
import TimeRangeSelect from "@/components/production/TimeRangeSelect.jsx";
import {
  ChartPanel,
  FilterRow,
  ModalFrame,
  SingleSelectRow,
} from "@/components/trend/TrendModalParts.jsx";
import MultiLineChart from "@/components/trend/MultiLineChart.jsx";
import BarChart from "@/components/trend/BarChart.jsx";
import CategoryBarChart from "@/components/trend/CategoryBarChart.jsx";
import { usePolledQuery } from "@/hooks/usePolledQuery.js";
import { getUniformityTrend } from "@/api/quality.js";
import { formatIndianNumber } from "@/lib/numberFormat.js";
import {
  MACHINE_TYPE_GROUPS,
  UNIFORMITY_TREND_CARDS,
  periodKey,
  periodKeys,
  periodLabel,
  resolveTrendWindow,
} from "@/lib/uniformityTrend.js";

const STEP_LABEL = { shift: "Per shift", day: "Daily", month: "Monthly" };

const numOrNull = (v) => {
  const n = typeof v === "number" ? v : Number.parseFloat(v);
  return Number.isFinite(n) ? n : null;
};

/** A yield line starts just below its lowest value, not at 0 (spec §1.5). */
function yieldFloor(seriesList) {
  const values = seriesList.flatMap((s) => s.values).filter((v) => v != null);
  return values.length ? Math.floor(Math.min(...values) - 0.5) : null;
}

/**
 * Trend modal for the Quality › Product › Uniformity & Balancing cards
 * (Uniformity_KPI_Fetch_Spec). Built from the Production trend modal's
 * parts so the two read as one product. Every value plotted is its own gold
 * row — nothing is added or averaged here. A missing period has no point;
 * the line is drawn across it so a machine's trend still reads as one line.
 *
 * @param {{ open: boolean, onClose: () => void, cardKpi: string,
 *   title: string, today: string,
 *   initialFilter: { preset: "today"|"month"|"custom", month?: string|null,
 *     from?: string, to?: string, shift?: string } }} props
 */
function UniformityTrendModal({
  open,
  onClose,
  cardKpi,
  title,
  today,
  initialFilter,
}) {
  const theme = useTheme();
  const card = UNIFORMITY_TREND_CARDS[cardKpi];

  // The modal opens on the page's filter; changes here stay in the modal.
  const [preset, setPreset] = useState(initialFilter.preset);
  const [month, setMonth] = useState(initialFilter.month ?? null);
  const [from, setFrom] = useState(initialFilter.from ?? "");
  const [to, setTo] = useState(initialFilter.to ?? "");
  const [shift, setShift] = useState(initialFilter.shift ?? "all");
  const [viewId, setViewId] = useState("overall");
  const [machines, setMachines] = useState([]);

  const view = card.views.find((v) => v.id === viewId) ?? card.views[0];
  const win = resolveTrendWindow({ preset, month, from, to, shift, today });
  const overallWindow = view.kind === "line" || view.kind === "columns";
  const usesOverallAxis = overallWindow || view.kind === "machineLines";

  const request = useMemo(() => {
    const span = usesOverallAxis
      ? {
          granularities: win.overall.granularities,
          dateFrom: win.overall.from,
          dateTo: win.overall.to,
        }
      : {
          granularities: win.single.granularities,
          dateFrom: win.single.date,
          dateTo: win.single.date,
        };
    if (view.kind === "byType") {
      return { kpiNames: view.kpis.map(([k]) => k), rows: "plant", ...span };
    }
    if (view.kind === "machineBars") {
      return {
        kpiNames: MACHINE_TYPE_GROUPS.map((g) => g.kpi),
        rows: "machine",
        ...span,
      };
    }
    if (view.kind === "machineLines") {
      return {
        kpiNames: [view.machineYield, view.machineTested],
        rows: "machine",
        ...span,
      };
    }
    return { kpiNames: [cardKpi], rows: "plant", ...span };
  }, [view, cardKpi, usesOverallAxis, win]);

  const { data, isLoading } = usePolledQuery(
    () => getUniformityTrend(request),
    {
      enabled: open,
      interval: 0,
      deps: [JSON.stringify(request)],
      keepPreviousData: false,
    },
  );
  // Only rows of the current request: on a view switch the previous
  // view's rows are still in `data` for one render.
  const rows = useMemo(() => {
    if (!Array.isArray(data?.rows)) return [];
    const kpis = new Set(request.kpiNames);
    const wantMachine = request.rows === "machine";
    return data.rows.filter(
      (r) => kpis.has(r.kpi_name) && Boolean(r.machine) === wantMachine,
    );
  }, [data, request]);

  // Machine lines: machines with a yield row in the window, and the one
  // that tested the most tyres as the default single line.
  const machineData = useMemo(() => {
    if (view.kind !== "machineLines") return null;
    const yieldRows = rows.filter((r) => r.kpi_name === view.machineYield);
    const tested = new Map();
    const testedTotal = new Map();
    for (const r of rows) {
      if (r.kpi_name !== view.machineTested) continue;
      const v = numOrNull(r.actual_value);
      tested.set(`${r.machine}|${periodKey(r)}`, v);
      if (v != null) {
        testedTotal.set(r.machine, (testedTotal.get(r.machine) ?? 0) + v);
      }
    }
    const options = [...new Set(yieldRows.map((r) => r.machine))].sort();
    const busiest = [...options].sort(
      (a, b) => (testedTotal.get(b) ?? 0) - (testedTotal.get(a) ?? 0),
    )[0];
    return { yieldRows, tested, options, busiest };
  }, [rows, view]);

  const shownMachines = useMemo(
    () =>
      machines.length > 0
        ? machines
        : machineData?.busiest
          ? [machineData.busiest]
          : [],
    [machines, machineData],
  );

  const chart = useMemo(() => {
    const step = win.overall.step;
    if (view.kind === "line" || view.kind === "columns") {
      const keys = periodKeys(rows, win.overall.lastShifts);
      const byKey = new Map(
        rows.map((r) => [periodKey(r), numOrNull(r.actual_value)]),
      );
      return {
        labels: keys.map((k) => periodLabel(k, step)),
        values: keys.map((k) => byKey.get(k) ?? null),
      };
    }
    if (view.kind === "machineLines") {
      const keys = periodKeys(machineData.yieldRows, win.overall.lastShifts);
      const series = shownMachines.map((machine) => {
        const byKey = new Map(
          machineData.yieldRows
            .filter((r) => r.machine === machine)
            .map((r) => [periodKey(r), numOrNull(r.actual_value)]),
        );
        return {
          name: machine,
          values: keys.map((k) => byKey.get(k) ?? null),
          notes: keys.map((k) => {
            const n = machineData.tested.get(`${machine}|${k}`);
            return n == null ? null : `${formatIndianNumber(n)} tyres tested`;
          }),
        };
      });
      return { labels: keys.map((k) => periodLabel(k, step)), series };
    }
    if (view.kind === "byType") {
      const names = new Map(view.kpis);
      return {
        items: rows
          .map((r) => ({
            label: names.get(r.kpi_name) ?? r.kpi_name,
            value: numOrNull(r.actual_value),
          }))
          .filter((it) => it.value != null)
          .sort((a, b) => a.value - b.value),
      };
    }
    // machineBars
    const groupOf = new Map(MACHINE_TYPE_GROUPS.map((g) => [g.kpi, g.id]));
    const order = MACHINE_TYPE_GROUPS.map((g) => g.id);
    return {
      items: rows
        .map((r) => ({
          label: r.machine,
          value: numOrNull(r.actual_value),
          group: groupOf.get(r.kpi_name),
        }))
        .filter((it) => it.value != null)
        .sort(
          (a, b) =>
            order.indexOf(a.group) - order.indexOf(b.group) ||
            a.label.localeCompare(b.label, undefined, { numeric: true }),
        ),
    };
  }, [rows, view, win, machineData, shownMachines]);

  const brand = theme.custom.brand;
  const typeGroups = MACHINE_TYPE_GROUPS.map((g, i) => ({
    ...g,
    color: [brand.blue, brand.orange, brand.teal][i],
  }));

  const singleView = !usesOverallAxis;
  const panelTitle = singleView
    ? `${view.label} · ${win.single.label}`
    : `${view.label} · ${STEP_LABEL[win.overall.step]}`;
  const empty = singleView
    ? chart.items.length === 0
    : view.kind === "machineLines"
      ? chart.series.every((s) => s.values.every((v) => v == null))
      : chart.values.every((v) => v == null);
  const emptyMessage = isLoading
    ? "Loading…"
    : singleView
      ? win.isToday
        ? "No tests for today."
        : "No tests for this period."
      : "No data for this period.";

  return (
    <ModalFrame
      open={open}
      onClose={onClose}
      kpi={{ name: title, unit: card.unit }}
      headerExtras={
        <TimeRangeSelect
          preset={preset}
          from={from}
          to={to}
          shift={shift}
          onShiftChange={setShift}
          asOf={today}
          month={month}
          onMonthChange={(key) => {
            setPreset("month");
            setMonth(key);
          }}
          onPresetChange={(next) => {
            setPreset(next?.preset ?? "month");
            setMonth(null);
            setFrom("");
            setTo("");
            if (next?.preset !== "today") setShift("all");
          }}
          onFromChange={(v) => {
            setFrom(v);
            setPreset("custom");
            setShift("all");
          }}
          onToChange={(v) => {
            setTo(v);
            setPreset("custom");
            setShift("all");
          }}
        />
      }
    >
      <Stack spacing={1.25}>
        {card.views.length > 1 && (
          <SingleSelectRow
            label="View by"
            value={view.id}
            onChange={(id) => {
              setViewId(id);
              setMachines([]);
            }}
            options={card.views.map((v) => ({ value: v.id, label: v.label }))}
          />
        )}
        {view.kind === "machineLines" && (
          <FilterRow
            label="Machines"
            options={machineData.options}
            value={shownMachines}
            onChange={setMachines}
            placeholder="Pick machines"
          />
        )}
      </Stack>

      <ChartPanel
        theme={theme}
        title={panelTitle}
        loading={isLoading}
        empty={empty}
        emptyMessage={emptyMessage}
      >
        {!empty && view.kind === "line" && (
          <MultiLineChart
            labels={chart.labels}
            series={[{ name: "Overall", values: chart.values }]}
            unit={card.unit}
            yMin={yieldFloor([{ values: chart.values }])}
            connectNulls
          />
        )}
        {!empty && view.kind === "columns" && (
          <BarChart
            labels={chart.labels}
            values={chart.values}
            unit={card.unit}
          />
        )}
        {!empty && view.kind === "machineLines" && (
          <MultiLineChart
            labels={chart.labels}
            series={chart.series}
            unit="%"
            yMin={yieldFloor(chart.series)}
            connectNulls
          />
        )}
        {!empty && view.kind === "byType" && (
          <CategoryBarChart items={chart.items} horizontal unit="%" />
        )}
        {!empty && view.kind === "machineBars" && (
          <CategoryBarChart
            items={chart.items}
            groups={typeGroups}
            unit={card.unit}
          />
        )}
      </ChartPanel>
    </ModalFrame>
  );
}

export default UniformityTrendModal;
