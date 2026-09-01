import { useMemo, useState } from "react";
import { Box, Stack, Tooltip, Typography, useTheme } from "@mui/material";
import GridViewIcon from "@mui/icons-material/GridView";
import DeleteSweepOutlinedIcon from "@mui/icons-material/DeleteSweepOutlined";
import SyncOutlinedIcon from "@mui/icons-material/SyncOutlined";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import { usePolledQuery } from "@/hooks/usePolledQuery.js";
import client from "@/api/client.js";
import {
  canonicalizeProductType,
  canonicalizeSubSection,
} from "@/lib/dashboardRowScopes.js";
import {
  AGGREGATE_PRODUCT,
  canonicalUnit,
  resolveProductionKpi,
} from "@/lib/kpi-transformer.js";
import { buildDatePayload, normalizeDateInput } from "@/lib/timeRange.js";
import { isKg, kgToTonnes } from "@/lib/units.js";
import { formatIndianNumber } from "@/lib/numberFormat.js";
import JKLoader from "@/components/JKLoader.jsx";
import DataTable from "@/components/tables/DataTable.jsx";
import { evaluateShiftTier, getStemColor } from "@/lib/thresholds.js";

const USE_MOCK = import.meta.env.VITE_USE_MOCK_DATA === "true";

function useShiftBands({
  plantId = "banmore",
  category,
  section,
  subSection,
  isRange,
  date,
  from,
  to,
  extraKpis = null,
}) {
  // Today mode: widen the backend window so `readShift` can fall back to the
  // most recent date that carries Production / Scrap / Rework rows when the
  // asOf day only has Curing_Plan / Plan_Adherence (partial-day scenario —
  // SHIFT KPI rows often trail the latest DAY row by 1-4 days). 14 days is
  // generous enough to cover any lag in the gold layer.
  const todayWindow = useMemo(() => {
    if (isRange || !date) return null;
    const isoDate = normalizeDateInput(date);
    if (!isoDate) return null;
    const end = new Date(`${isoDate}T00:00:00Z`);
    if (Number.isNaN(end.getTime())) return null;
    const start = new Date(end);
    start.setUTCDate(start.getUTCDate() - 14);
    const isoStart = start.toISOString().slice(0, 10);
    return { from: isoStart, to: isoDate };
  }, [isRange, date]);
  const payload = {
    plantId,
    section,
    category,
    ...(subSection ? { subSection } : {}),
    ...buildDatePayload(isRange ? { from, to } : (todayWindow ?? { date })),
    extraKpis,
    parentFilters: {},
    limit: 10000,
  };
  const hasWindow = isRange ? Boolean(from || to) : Boolean(date);
  const { data, isLoading } = usePolledQuery(
    async () => {
      if (USE_MOCK) {
        return [
          {
            granularity: "SHIFT A",
            kpi_name: "Production",
            actual_value: 230000,
            section,
          },
          {
            granularity: "SHIFT B",
            kpi_name: "Production",
            actual_value: 245000,
            section,
          },
          {
            granularity: "SHIFT C",
            kpi_name: "Production",
            actual_value: 205000,
            section,
          },
          {
            granularity: "SHIFT A",
            kpi_name: "Scrap",
            actual_value: 3500,
            section,
          },
          {
            granularity: "SHIFT B",
            kpi_name: "Scrap",
            actual_value: 3800,
            section,
          },
          {
            granularity: "SHIFT C",
            kpi_name: "Scrap",
            actual_value: 3200,
            section,
          },
          {
            granularity: "SHIFT A",
            kpi_name: "Rework",
            actual_value: 10500,
            section,
          },
          {
            granularity: "SHIFT B",
            kpi_name: "Rework",
            actual_value: 11500,
            section,
          },
          {
            granularity: "SHIFT C",
            kpi_name: "Rework",
            actual_value: 9500,
            section,
          },
        ];
      }
      try {
        return await client.post("/dashboard/shift-comparison", payload);
      } catch (err) {
        console.warn("useShiftBands HTTP call failed, using mock data:", err);
        return [];
      }
    },
    {
      enabled: Boolean(section) && hasWindow,
      interval: 0,
      deps: [JSON.stringify(payload)],
    },
  );
  return { rows: Array.isArray(data) ? data : [], isLoading };
}

/**
 * Fetches the DAY-granularity Production row for the same (plant, section,
 * sub_section, product_type) the chart shows so the Today view can render a
 * 'Day' lollipop alongside the per-shift stems. The user can then visually
 * verify Day == Shift A + Shift B + Shift C. Used only when the Today preset
 * is active — month/range presets already aggregate via the shift sums.
 */
function useDayProduction({
  plantId = "banmore",
  section,
  subSection = null,
  productType = null,
  unit = null,
  isRange,
  date,
  from,
  to,
  kpiName = "Production_product",
}) {
  const payload = {
    plantId,
    context: {
      section,
      ...(subSection ? { sub_section: subSection } : {}),
      ...(productType ? { product_type: productType } : {}),
      ...(unit ? { unit_of_measurement: unit } : {}),
      granularity: "DAY",
    },
    ...buildDatePayload(isRange ? { from, to } : { date }),
    drillKpis: [kpiName],
    drillOnly: true,
    parentFilters: {},
    limit: 10000,
  };
  const hasWindow = isRange ? Boolean(from || to) : Boolean(date);
  const { data, isLoading } = usePolledQuery(
    async () => {
      try {
        const res = await client.post("/dashboard/kpi-data", payload);
        return Array.isArray(res?.data?.data) ? res.data.data : [];
      } catch (err) {
        console.warn("useDayProduction HTTP call failed:", err);
        return [];
      }
    },
    {
      enabled: Boolean(section) && hasWindow && !isRange,
      interval: 0,
      deps: [JSON.stringify(payload)],
    },
  );
  const rows = Array.isArray(data) ? data : [];
  // Pick the latest DAY row matching section + product_type + unit. The gold
  // table can carry duplicate DAY roll-ups at different drill_down_level
  // values; the dashboard's own snapshot mode picks one — we mirror that by
  // taking the most recent row in the response (server orders DESC).
  const match = rows.find(
    (r) =>
      r.granularity === "DAY" &&
      (!r.section || r.section === section) &&
      (!productType || r.product_type === productType) &&
      (!unit || canonicalUnit(r.unit_of_measurement) === canonicalUnit(unit)),
  );
  return {
    value: match ? numOrNull(match.actual_value) : null,
    isLoading,
  };
}

/**
 * Adobe XD 3 Shift-Wise Lollipop Chart Cards
 * 1. Shift Wise Total Production
 * 2. Shift Wise Total Scrap
 * 3. Shift Wise Total Rework
 */
export default function ShiftComparisonCard({
  plantId = "banmore",
  section = "Curing",
  subSection = null,
  productType = null,
  unit = null,
  machine = null,
  mode = "day",
  date = null,
  from = null,
  to = null,
  isDrilldown = false,
  isDrilling = false,
}) {
  const showTable = isDrilldown || isDrilling;
  const isRange = mode === "range";

  const shifts = [
    { gran: "SHIFT A", label: "Shift A" },
    { gran: "SHIFT B", label: "Shift B" },
    { gran: "SHIFT C", label: "Shift C" },
  ];

  const bandArgs = { plantId, section, subSection, isRange, date, from, to };
  const prodArgs = {
    ...bandArgs,
    category: "Productivity",
    extraKpis:
      section === "TBM" || section === "Curing" ? ["Production_product"] : null,
  };
  const { rows: prodRows, isLoading: prodLoading } = useShiftBands(prodArgs);
  const { rows: qualRows, isLoading: qualLoading } = useShiftBands({
    ...bandArgs,
    category: "Quality",
  });

  // Day-granularity Production row for the Today preset — rendered as the
  // first lollipop on the Production chart so users can eyeball that
  // Day == Shift A + Shift B + Shift C. Disabled for Month/Range presets.
  const { value: dayProdValue, isLoading: dayProdLoading } = useDayProduction({
    plantId,
    section,
    subSection,
    productType,
    unit,
    isRange,
    date,
    from,
    to,
    kpiName:
      section === "TBM" || section === "Curing"
        ? "Production_product"
        : "Production",
  });

  const loadingFirst =
    (prodLoading || qualLoading || dayProdLoading) &&
    prodRows.length === 0 &&
    qualRows.length === 0;

  // When the Today preset is active and the DAY fetch resolved, prepend a
  // 'Day' stem to the Production chart only (Scrap / Rework stay at 3 stems
  // per scope). The Day value comes from a separate kpi-data fetch rather
  // than the shift rows, so users can visually verify Day == Σ shifts.
  const showDayStem =
    !isRange && dayProdValue !== null && Number.isFinite(dayProdValue);

  const rowsForShift = (rows, shift) =>
    rows.filter((r) => r.granularity === shift.gran);
  const prodBands = shifts.map((shift) => rowsForShift(prodRows, shift));
  const qualBands = shifts.map((shift) => rowsForShift(qualRows, shift));

  const { kpiName: prodKpi, productPin } = resolveProductionKpi(
    section,
    productType,
  );

  const matchesScope = (r) => {
    if (r.section !== section) return false;
    if (
      subSection &&
      canonicalizeSubSection(r.sub_section) !==
        canonicalizeSubSection(subSection)
    )
      return false;
    if (machine && r.machine !== machine) return false;
    return true;
  };

  const pickProdRows = (bandRows, kpiName, pin) =>
    bandRows.filter((r) => {
      if (r.kpi_name !== kpiName) return false;
      if (!matchesScope(r)) return false;
      if (unit && canonicalUnit(r.unit_of_measurement) !== canonicalUnit(unit))
        return false;
      const rowPt = canonicalizeProductType(r.product_type);
      if (pin) return rowPt === canonicalizeProductType(pin);
      return rowPt == null;
    });

  const prodRowsFor = (i) =>
    (() => {
      const band = prodBands[i] ?? [];
      const primary = pickProdRows(band, prodKpi, productPin);
      const isAggregatePin =
        productPin != null && productPin === AGGREGATE_PRODUCT[section];
      if (primary.length === 0 && isAggregatePin) {
        return pickProdRows(band, "Production", null);
      }
      return primary;
    })();

  const qRowsFor = (kpiName, i) =>
    (qualBands[i] ?? []).filter(
      (r) => r.kpi_name === kpiName && matchesScope(r),
    );

  const readShift = (rows, kpiName) => {
    const dated = rows
      .filter((r) => r.kpi_name === kpiName)
      .map((r) => ({ key: dateKey(r.date), value: numOrNull(r.actual_value) }))
      .filter((r) => r.value !== null)
      .sort((a, b) => (a.key < b.key ? 1 : -1));
    if (dated.length === 0) return null;

    if (!isRange) {
      const selectedDate = dateKey(date);
      if (selectedDate) {
        const dayRows = dated.filter((r) => r.key === selectedDate);
        if (dayRows.length > 0) {
          return dayRows.reduce((sum, row) => sum + row.value, 0);
        }
        // asOf may trail the latest SHIFT rows (e.g. SHIFT data only exists
        // through 2026-08-27 while asOf is 2026-08-31 — the day only carries
        // Curing_Plan / Plan_Adherence, no Production/Scrap/Rework). Fall
        // back to the most recent date that DOES have this KPI so the chart
        // still renders for the Today preset.
      }
      return dated
        .filter((r) => r.key === dated[0].key)
        .reduce((sum, row) => sum + row.value, 0);
    }

    return dated.reduce((sum, row) => sum + row.value, 0);
  };

  const prodUnit = canonicalUnit(unit);
  const prodByShift = shifts.map((_, i) => {
    const v = readShift(prodRowsFor(i), prodKpi);
    return isKg(prodUnit) ? kgToTonnes(v) : v;
  });

  const scrapByShift = shifts.map((_, i) =>
    readShift(qRowsFor("Scrap", i), "Scrap"),
  );
  const reworkByShift = shifts.map((_, i) =>
    readShift(qRowsFor("Rework", i), "Rework"),
  );

  // Day stem goes first when Today preset is active; convert the raw value
  // through the same unit pipeline as the shift values for consistency.
  const dayProdRaw = isKg(prodUnit) ? kgToTonnes(dayProdValue) : dayProdValue;
  const prodByShiftForChart = showDayStem
    ? [dayProdRaw, ...prodByShift]
    : prodByShift;
  const prodShiftsForChart = showDayStem
    ? [{ gran: "DAY", label: "Day", isDay: true }, ...shifts]
    : shifts;

  const prodScale = computeYAxisScale(prodByShiftForChart, 100);
  const scrapScale = computeYAxisScale(scrapByShift, 40);
  const reworkScale = computeYAxisScale(reworkByShift, 100);

  return (
    <Box
      sx={{
        width: "100%",
        height: "100%",
        flex: 1,
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
      }}
    >
      {loadingFirst ? (
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            height: "100%",
            minHeight: showTable ? 180 : 280,
            backgroundColor: "background.paper",
            borderRadius: 2.5,
            border: 1,
            borderColor: "divider",
          }}
        >
          <JKLoader />
        </Box>
      ) : showTable ? (
        <ShiftComparisonTableCard
          shifts={shifts}
          prodData={prodByShift}
          scrapData={scrapByShift}
          reworkData={reworkByShift}
          unit={unit}
          dayProdData={showDayStem ? dayProdRaw : null}
        />
      ) : (
        <Box
          sx={{
            display: "grid",
            gap: 2,
            height: "100%",
            flex: 1,
            minHeight: 0,
            gridTemplateColumns: {
              xs: "1fr",
              md: "repeat(3, minmax(0, 1fr))",
            },
          }}
        >
          {/* Card 1: Shift Wise Total Production */}
          <LollipopChartCard
            title="Shift Wise Total Production"
            icon={<GridViewIcon sx={{ fontSize: 18, color: "text.primary" }} />}
            data={prodScale.chartData}
            rawValues={prodByShiftForChart}
            unitLabel={isKg(prodUnit) ? "MT" : (prodUnit ?? "NOS")}
            shifts={prodShiftsForChart}
            metricType="production"
            yTicks={prodScale.yTicks}
            maxVal={prodScale.maxVal}
            inThousands={prodScale.inThousands}
          />

          {/* Card 2: Shift Wise Total Scrap */}
          <LollipopChartCard
            title="Shift Wise Total Scrap"
            icon={
              <DeleteSweepOutlinedIcon
                sx={{ fontSize: 18, color: "text.primary" }}
              />
            }
            data={scrapScale.chartData}
            rawValues={scrapByShift}
            unitLabel="NOS"
            shifts={shifts}
            metricType="scrap"
            yTicks={scrapScale.yTicks}
            maxVal={scrapScale.maxVal}
            inThousands={scrapScale.inThousands}
          />

          {/* Card 3: Shift Wise Total Rework */}
          <LollipopChartCard
            title="Shift Wise Total Rework"
            icon={
              <SyncOutlinedIcon sx={{ fontSize: 18, color: "text.primary" }} />
            }
            data={reworkScale.chartData}
            rawValues={reworkByShift}
            unitLabel="NOS"
            shifts={shifts}
            metricType="rework"
            yTicks={reworkScale.yTicks}
            maxVal={reworkScale.maxVal}
            inThousands={reworkScale.inThousands}
          />
        </Box>
      )}
    </Box>
  );
}

/**
 * Compact Table View for Shift-Wise Comparison (shown below stacked KPIs in drilldown view)
 * Uses the reusable DataTable component.
 */
function ShiftComparisonTableCard({
  shifts,
  prodData,
  scrapData,
  reworkData,
  dayProdData = null,
}) {
  const theme = useTheme();

  const columns = [
    {
      key: "shift",
      label: "Shift",
      align: "center",
      sortable: false,
      filterable: false,
      render: (row) => (
        <Typography
          sx={{
            fontSize: 12.5,
            fontWeight: row.isDay ? 800 : 600,
            color: "text.primary",
          }}
        >
          {row.shiftCode}
        </Typography>
      ),
    },
    {
      key: "production",
      label: "Production",
      align: "center",
      sortable: false,
      filterable: false,
      value: (row) => row.production,
      render: (row) => (
        <Typography
          sx={{
            fontSize: 12.5,
            fontWeight: row.isDay ? 700 : 400,
            color: "text.primary",
          }}
        >
          {row.production != null
            ? formatIndianNumber(Math.round(row.production))
            : "—"}
        </Typography>
      ),
    },
    {
      key: "scrap",
      label: "Scrap",
      align: "center",
      sortable: false,
      filterable: false,
      value: (row) => row.scrap,
      render: (row) => (
        <Typography sx={{ fontSize: 12.5, color: "text.primary" }}>
          {row.scrap != null ? formatIndianNumber(Math.round(row.scrap)) : "—"}
        </Typography>
      ),
    },
    {
      key: "rework",
      label: "Rework",
      align: "center",
      sortable: false,
      filterable: false,
      value: (row) => row.rework,
      render: (row) => (
        <Typography sx={{ fontSize: 12.5, color: "text.primary" }}>
          {row.rework != null
            ? formatIndianNumber(Math.round(row.rework))
            : "—"}
        </Typography>
      ),
    },
  ];

  // Prepend a 'Day' row first when the Today preset is active so the table
  // mirrors the chart's left-most lollipop and the user can read off
  // Day vs Σ shifts at a glance.
  const dayRow =
    dayProdData != null
      ? [
          {
            shiftKey: "DAY",
            shiftCode: "Day",
            shift: "Day",
            production: dayProdData,
            scrap: null,
            rework: null,
            isDay: true,
          },
        ]
      : [];
  const tableRows = [
    ...dayRow,
    ...shifts.map((shift, idx) => ({
      shiftKey: shift.gran,
      shiftCode: shift.label.replace("Shift ", ""),
      shift: shift.label,
      production: prodData[idx],
      scrap: scrapData[idx],
      rework: reworkData[idx],
    })),
  ];

  return (
    <Box
      sx={{
        backgroundColor: "background.paper",
        borderRadius: 2.5,
        border: 1,
        borderColor: "rgba(0,0,0,0.06)",
        p: 1.75,
        boxShadow: theme.custom.shadow,
        display: "flex",
        flexDirection: "column",
        gap: 1,
      }}
    >
      {/* Header matching UI sample */}
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        sx={{ px: 0.5 }}
      >
        <Typography
          sx={{
            fontSize: 14,
            fontWeight: 600,
            color: "text.primary",
          }}
        >
          Shift Wise Comparison
        </Typography>
        <Tooltip
          title="Shift Wise Breakdown for Production, Scrap & Rework"
          arrow
        >
          <InfoOutlinedIcon
            sx={{ fontSize: 17, color: "text.secondary", cursor: "pointer" }}
          />
        </Tooltip>
      </Stack>

      <Box
        sx={{
          "& .MuiTableContainer-root": {
            borderRadius: 1.5,
            border: 1,
            borderColor: "divider",
          },
          "& .MuiTableCell-root": {
            py: 0.75,
            px: 1,
          },
        }}
      >
        <DataTable
          columns={columns}
          rows={tableRows}
          getRowKey={(r) => r.shiftKey}
          search={false}
          stickyHeader={false}
          maxHeight="none"
          emptyMessage="No shift data available."
        />
      </Box>
    </Box>
  );
}

/**
 * Computes dynamic, legible Y-axis scale, ticks, and formatting mode based on raw values.
 * If max value >= 1000, scales in thousands ('k'). Otherwise, scales directly in exact units.
 */
function computeYAxisScale(rawValues, defaultMax = 100) {
  const nums = (rawValues || []).filter(
    (v) => typeof v === "number" && Number.isFinite(v) && v > 0,
  );
  const maxRaw = nums.length > 0 ? Math.max(...nums) : 0;
  const inThousands = maxRaw >= 1000;

  let maxVal;
  let yTicks;
  let chartData;

  if (inThousands) {
    // In thousands: chartData is in 'k'
    chartData = (rawValues || []).map((v) =>
      v == null || !Number.isFinite(v) ? null : v / 1000,
    );
    const maxK = maxRaw / 1000;
    const targetMax = maxK * 1.15;
    const step =
      targetMax >= 100
        ? Math.ceil(targetMax / 4 / 10) * 10
        : targetMax >= 20
          ? Math.ceil(targetMax / 4 / 5) * 5
          : targetMax >= 4
            ? Math.ceil(targetMax / 4)
            : Math.ceil((targetMax / 4) * 2) / 2 || 0.5;
    maxVal = Number((step * 4).toFixed(2));
    yTicks = Array.from({ length: 5 }, (_, i) => Number((step * i).toFixed(2)));
  } else {
    // Direct exact integer values (avoids 0.0k for small values)
    chartData = (rawValues || []).map((v) =>
      v == null || !Number.isFinite(v) ? null : v,
    );
    const targetMax = maxRaw <= 0 ? defaultMax : maxRaw * 1.2;
    const step =
      targetMax >= 200
        ? Math.ceil(targetMax / 4 / 25) * 25
        : targetMax >= 40
          ? Math.ceil(targetMax / 4 / 10) * 10
          : targetMax >= 10
            ? Math.ceil(targetMax / 4 / 2) * 2
            : Math.ceil(targetMax / 4) || 1;
    maxVal = step * 4;
    yTicks = Array.from({ length: 5 }, (_, i) => step * i);
  }

  return { inThousands, chartData, maxVal, yTicks };
}

/**
 * Individual White Card containing a responsive SVG Lollipop Chart
 */
function LollipopChartCard({
  title,
  icon,
  data,
  rawValues,
  unitLabel,
  shifts,
  metricType,
  yTicks,
  maxVal,
  inThousands = true,
}) {
  const theme = useTheme();

  return (
    <Box
      sx={{
        backgroundColor: "background.paper",
        borderRadius: 2.5,
        border: 1,
        borderColor: "rgba(0,0,0,0.06)",
        p: 2,
        boxShadow: theme.custom.shadow,
        display: "flex",
        flexDirection: "column",
        height: "100%",
        minHeight: 260,
      }}
    >
      {/* Header */}
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        sx={{ mb: 1 }}
      >
        <Stack direction="row" alignItems="center" spacing={1}>
          {icon}
          <Typography
            sx={{
              fontSize: 15,
              fontWeight: 700,
              color: "text.primary",
            }}
          >
            {title}
          </Typography>
        </Stack>
        <Tooltip title={`${title} Breakdown`} arrow>
          <InfoOutlinedIcon
            sx={{ fontSize: 18, color: "text.secondary", cursor: "pointer" }}
          />
        </Tooltip>
      </Stack>

      {/* Lollipop Chart Area */}
      <Box
        sx={{
          flex: 1,
          position: "relative",
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: 0,
        }}
      >
        <LollipopSvgChart
          data={data}
          rawValues={rawValues}
          unitLabel={unitLabel}
          shifts={shifts}
          metricType={metricType}
          yTicks={yTicks}
          maxVal={maxVal}
          inThousands={inThousands}
        />
      </Box>
    </Box>
  );
}

function LollipopSvgChart({
  data,
  rawValues,
  unitLabel,
  shifts,
  metricType,
  yTicks,
  maxVal,
  inThousands = true,
}) {
  const theme = useTheme();
  const [hoveredIdx, setHoveredIdx] = useState(null);

  const chartWidth = 350;
  const chartHeight = 300;
  const padLeft = 46;
  const padRight = 24;
  const padTop = 22;
  const padBottom = 32;

  const plotWidth = chartWidth - padLeft - padRight;
  const plotHeight = chartHeight - padTop - padBottom;

  const yCoord = (val) => {
    const ratio = Math.max(0, Math.min(1, val / maxVal));
    return padTop + plotHeight * (1 - ratio);
  };

  // Stems spread evenly across the plot area; supports 3 shifts (default) or
  // 4 stems when the Production chart prepends a 'Day' lollipop on Today.
  const stemCount = Math.max(shifts?.length ?? 3, 1);
  const xPositions = Array.from({ length: stemCount }, (_, i) =>
    stemCount === 1
      ? padLeft + plotWidth * 0.5
      : padLeft + (plotWidth * (i + 1)) / (stemCount + 1),
  );

  return (
    <Box sx={{ width: "100%", height: "100%", position: "relative" }}>
      <svg
        viewBox={`0 0 ${chartWidth} ${chartHeight}`}
        preserveAspectRatio="xMidYMid meet"
        style={{ width: "100%", height: "100%", display: "block" }}
      >
        {/* Gradients for Vertical Fading Effect on Stems */}
        <defs>
          {data.map((val, idx) => {
            const x = xPositions[idx];
            const yTop = yCoord(val);
            const yBottom = padTop + plotHeight;
            const tier = evaluateShiftTier(metricType, val, data);
            const color = getStemColor(theme, tier);
            const gradId = `stem-fade-${metricType}-${idx}`;
            return (
              <linearGradient
                key={gradId}
                id={gradId}
                gradientUnits="userSpaceOnUse"
                x1={x}
                y1={yTop}
                x2={x}
                y2={yBottom}
              >
                <stop offset="0%" stopColor={color} stopOpacity="1" />
                <stop offset="60%" stopColor={color} stopOpacity="0.75" />
                <stop offset="100%" stopColor={color} stopOpacity="0.25" />
              </linearGradient>
            );
          })}
        </defs>

        {/* Y-Axis Title (Rotated) */}
        <text
          x={-(padTop + plotHeight / 2)}
          y={12}
          transform="rotate(-90)"
          textAnchor="middle"
          fill={theme.palette.text.secondary}
          fontSize="9.5"
          fontWeight="500"
          fontFamily={theme.typography.fontFamily}
        >
          {inThousands
            ? `Quantity in Thousands (${unitLabel})`
            : `Quantity (${unitLabel})`}
        </text>

        {/* Horizontal Dashed Gridlines & Y-Axis Labels */}
        {yTicks.map((tick) => {
          const y = yCoord(tick);
          return (
            <g key={tick}>
              <line
                x1={padLeft}
                y1={y}
                x2={chartWidth - padRight}
                y2={y}
                stroke={theme.palette.divider}
                strokeWidth="1"
                strokeDasharray={tick === 0 ? "none" : "3 3"}
                opacity={0.8}
              />
              <text
                x={padLeft - 8}
                y={y + 3.5}
                textAnchor="end"
                fill={theme.palette.text.secondary}
                fontSize="10"
                fontWeight="500"
                fontFamily={theme.typography.fontFamily}
              >
                {tick}
              </text>
            </g>
          );
        })}

        {/* X-Axis Base Line */}
        <line
          x1={padLeft}
          y1={padTop + plotHeight}
          x2={chartWidth - padRight}
          y2={padTop + plotHeight}
          stroke={theme.palette.divider}
          strokeWidth="1"
        />

        {/* Lollipop Stems & Markers */}
        {data.map((val, idx) => {
          const x = xPositions[idx];
          const yTop = yCoord(val);
          const yBottom = padTop + plotHeight;
          const tier = evaluateShiftTier(metricType, val, data);
          const color = getStemColor(theme, tier);
          const isHovered = hoveredIdx === idx;
          const gradId = `stem-fade-${metricType}-${idx}`;

          const rawVal =
            rawValues && rawValues[idx] != null
              ? rawValues[idx]
              : val != null
                ? inThousands
                  ? val * 1000
                  : val
                : null;

          let labelText = "";
          if (rawVal != null && !isNaN(rawVal)) {
            if (rawVal === 0) {
              labelText = "0";
            } else if (!inThousands || rawVal < 1000) {
              labelText = formatIndianNumber(Math.round(rawVal));
            } else if (rawVal >= 100000) {
              labelText = `${formatIndianNumber(Math.round(rawVal / 1000))}k`;
            } else {
              const kVal = rawVal / 1000;
              labelText = `${Number.isInteger(kVal) ? kVal : kVal.toFixed(1)}k`;
            }
          }

          const exactText = `${formatIndianNumber(Math.round((rawVal ?? 0) * 100) / 100)}${unitLabel ? ` ${unitLabel}` : ""}`;
          const tooltipWidth = exactText.length * 7.5 + 20;

          return (
            <g key={idx}>
              {/* Data Value Label Above Marker (when not hovered) */}
              {!isHovered && (
                <text
                  x={x}
                  y={yTop - 7}
                  textAnchor="middle"
                  fill={theme.palette.text.primary}
                  fontSize="10.5"
                  fontWeight="700"
                  fontFamily={theme.typography.fontFamily}
                >
                  {labelText}
                </text>
              )}

              {val != null && (
                <>
                  {/* Stem vertical line with vertical fading gradient matching threshold color */}
                  <line
                    x1={x}
                    y1={yBottom}
                    x2={x}
                    y2={yTop}
                    stroke={`url(#${gradId})`}
                    strokeWidth={isHovered ? "2.8" : "2"}
                    strokeLinecap="round"
                  />

                  {/* Circular top marker - Outer Ring */}
                  <circle
                    cx={x}
                    cy={yTop}
                    r={isHovered ? 5.5 : 4.2}
                    fill={theme.palette.background.paper}
                    stroke={color}
                    strokeWidth={isHovered ? "2.6" : "1.8"}
                    onMouseEnter={() => setHoveredIdx(idx)}
                    onMouseLeave={() => setHoveredIdx(null)}
                    style={{ cursor: "pointer" }}
                  />

                  {/* Exact Value Tooltip Badge on Hover */}
                  {isHovered && (
                    <g
                      transform={`translate(${x}, ${Math.max(20, yTop - 10)})`}
                    >
                      <rect
                        x={-tooltipWidth / 2}
                        y={-22}
                        width={tooltipWidth}
                        height={22}
                        rx={6}
                        fill={theme.palette.background.paper}
                        stroke={color}
                        strokeWidth={1.6}
                        filter="drop-shadow(0 2px 5px rgba(0,0,0,0.18))"
                      />
                      <text
                        x={0}
                        y={-7}
                        textAnchor="middle"
                        fill={color}
                        fontSize="11.5"
                        fontWeight="800"
                        fontFamily={theme.typography.fontFamily}
                      >
                        {exactText}
                      </text>
                    </g>
                  )}
                </>
              )}

              {/* Shift Label at Bottom — 'Day' label is always bold so the
                  Today view's first stem reads as the daily aggregate. */}
              <text
                x={x}
                y={chartHeight - 10}
                textAnchor="middle"
                fill={isHovered ? color : theme.palette.text.secondary}
                fontSize="11"
                fontWeight={
                  shifts[idx]?.isDay ? "800" : isHovered ? "700" : "600"
                }
                fontFamily={theme.typography.fontFamily}
              >
                {shifts[idx]?.label || `Shift ${idx + 1}`}
              </text>
            </g>
          );
        })}
      </svg>
    </Box>
  );
}

function numOrNull(v) {
  if (v == null || v === "" || v === "nan" || v === "null") return null;
  const n = typeof v === "number" ? v : Number.parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

function dateKey(value) {
  if (typeof value !== "string") return "";
  const date = value.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
  const match = /^(\d{2})-(\d{2})-(\d{4})$/.exec(date);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : "";
}
