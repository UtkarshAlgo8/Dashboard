import { useRef, useState } from "react";
import {
  Box,
  Stack,
  Tooltip,
  Typography,
  useTheme,
} from "@mui/material";
import GridViewIcon from "@mui/icons-material/GridView";
import DeleteSweepOutlinedIcon from "@mui/icons-material/DeleteSweepOutlined";
import SyncOutlinedIcon from "@mui/icons-material/SyncOutlined";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import TableChartOutlinedIcon from "@mui/icons-material/TableChartOutlined";
import { usePolledQuery } from "@/hooks/usePolledQuery.js";
import client from "@/api/client.js";
import {
  canonicalizeProductType,
  canonicalizeSubSection,
} from "@/lib/dashboardRowScopes.js";
import { canonicalUnit, resolveProductionKpi } from "@/lib/kpi-transformer.js";
import { buildDatePayload } from "@/lib/timeRange.js";
import { displayUnit, isKg, kgToTonnes } from "@/lib/units.js";
import { formatIndianNumber } from "@/lib/numberFormat.js";
import JKLoader from "@/components/JKLoader.jsx";
import DataTable from "@/components/tables/DataTable.jsx";
import CardDownloadButton from "@/components/CardDownloadButton.jsx";
import { evaluateShiftTier, getStemColor } from "@/lib/thresholds.js";

const USE_MOCK = import.meta.env.VITE_USE_MOCK_DATA !== "false";

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
  const payload = {
    plantId,
    section,
    category,
    ...(subSection ? { subSection } : {}),
    ...buildDatePayload(isRange ? { from, to } : { date }),
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

  const loadingFirst =
    (prodLoading || qualLoading) &&
    prodRows.length === 0 &&
    qualRows.length === 0;

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
    pickProdRows(prodBands[i] ?? [], prodKpi, productPin);

  const qRowsFor = (kpiName, i) =>
    (qualBands[i] ?? []).filter((r) => r.kpi_name === kpiName);

  const readShift = (rows, kpiName) => {
    if (!rows.length) return null;
    const direct = rows.find((r) => r.kpi_name === kpiName);
    if (direct?.actual_value != null) {
      return numOrNull(direct.actual_value);
    }
    const nums = rows.map((r) => numOrNull(r.actual_value)).filter(Boolean);
    return nums.length ? nums.reduce((a, b) => a + b, 0) : null;
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

  // Map shift metrics to thousands (k) or 0 if null
  const displayProd = prodByShift.map((v) => (v == null ? 0 : v / 1000));
  const displayScrap = scrapByShift.map((v) => (v == null ? 0 : v / 1000));
  const displayRework = reworkByShift.map((v) => (v == null ? 0 : v / 1000));

  const prodScale = computeYAxisScale(displayProd, 100);
  const scrapScale = computeYAxisScale(displayScrap, 4);
  const reworkScale = computeYAxisScale(displayRework, 12);

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
            data={displayProd}
            rawValues={prodByShift}
            unitLabel={isKg(prodUnit) ? "MT" : (prodUnit ?? "Tyres")}
            shifts={shifts}
            metricType="production"
            yTicks={prodScale.yTicks}
            maxVal={prodScale.maxVal}
          />

          {/* Card 2: Shift Wise Total Scrap */}
          <LollipopChartCard
            title="Shift Wise Total Scrap"
            icon={
              <DeleteSweepOutlinedIcon
                sx={{ fontSize: 18, color: "text.primary" }}
              />
            }
            data={displayScrap}
            rawValues={scrapByShift}
            unitLabel="Tyres"
            shifts={shifts}
            metricType="scrap"
            yTicks={scrapScale.yTicks}
            maxVal={scrapScale.maxVal}
          />

          {/* Card 3: Shift Wise Total Rework */}
          <LollipopChartCard
            title="Shift Wise Total Rework"
            icon={
              <SyncOutlinedIcon sx={{ fontSize: 18, color: "text.primary" }} />
            }
            data={displayRework}
            rawValues={reworkByShift}
            unitLabel="Tyres"
            shifts={shifts}
            metricType="rework"
            yTicks={reworkScale.yTicks}
            maxVal={reworkScale.maxVal}
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
  unit,
}) {
  const theme = useTheme();
  const cardRef = useRef(null);
  const prodUnit = canonicalUnit(unit);
  const unitLabel = isKg(prodUnit)
    ? "MT"
    : prodUnit
      ? displayUnit(prodUnit)
      : "";

  const columns = [
    {
      key: "shift",
      label: "Shift",
      align: "left",
      render: (row) => (
        <Box
          component="span"
          sx={{
            px: 1,
            py: 0.25,
            borderRadius: 999,
            fontSize: 11,
            fontWeight: 700,
            backgroundColor:
              row.shiftKey === "SHIFT A"
                ? "rgba(0, 119, 182, 0.12)"
                : row.shiftKey === "SHIFT B"
                  ? "rgba(230, 81, 0, 0.12)"
                  : "rgba(106, 27, 154, 0.12)",
            color:
              row.shiftKey === "SHIFT A"
                ? "primary.main"
                : row.shiftKey === "SHIFT B"
                  ? "warning.main"
                  : "secondary.main",
          }}
        >
          {row.shift}
        </Box>
      ),
    },
    {
      key: "production",
      label: `Prod ${unitLabel ? `(${unitLabel})` : ""}`,
      align: "right",
      value: (row) => row.production,
      render: (row) =>
        row.production != null
          ? formatIndianNumber(Math.round(row.production * 100) / 100)
          : "—",
    },
    {
      key: "scrap",
      label: "Scrap",
      align: "right",
      value: (row) => row.scrap,
      render: (row) => (
        <Box
          component="span"
          sx={{
            fontWeight: row.scrap > 0 ? 600 : 400,
            color: row.scrap > 0 ? "error.main" : "text.secondary",
          }}
        >
          {row.scrap != null ? formatIndianNumber(row.scrap) : "—"}
        </Box>
      ),
    },
    {
      key: "rework",
      label: "Rework",
      align: "right",
      value: (row) => row.rework,
      render: (row) => (
        <Box
          component="span"
          sx={{
            fontWeight: row.rework > 0 ? 600 : 400,
            color: row.rework > 0 ? "warning.main" : "text.secondary",
          }}
        >
          {row.rework != null ? formatIndianNumber(row.rework) : "—"}
        </Box>
      ),
    },
  ];

  const tableRows = shifts.map((shift, idx) => ({
    shiftKey: shift.gran,
    shift: shift.label,
    production: prodData[idx],
    scrap: scrapData[idx],
    rework: reworkData[idx],
  }));

  const excelHeaders = [
    "Shift",
    `Prod ${unitLabel ? `(${unitLabel})` : ""}`,
    "Scrap",
    "Rework",
  ];
  const excelRows = tableRows.map((r) => ({
    Shift: r.shift,
    [`Prod ${unitLabel ? `(${unitLabel})` : ""}`]:
      r.production != null ? r.production : "",
    Scrap: r.scrap != null ? r.scrap : "",
    Rework: r.rework != null ? r.rework : "",
  }));

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
        gap: 1.25,
      }}
    >
      {/* Header */}
      <Stack direction="row" alignItems="center" justifyContent="space-between">
        <Stack direction="row" alignItems="center" spacing={1}>
          <TableChartOutlinedIcon
            sx={{ fontSize: 18, color: "text.primary" }}
          />
          <Typography
            sx={{
              fontSize: 14,
              fontWeight: 700,
              color: "text.primary",
            }}
          >
            Shift-wise Comparison
          </Typography>
        </Stack>
        <Stack direction="row" alignItems="center" spacing={1}>
          <CardDownloadButton
            cardRef={cardRef}
            rows={excelRows}
            headers={excelHeaders}
            filename="shift-wise-comparison"
            sheetName="Shift Comparison"
          />
          <Tooltip
            title="Shift-wise Breakdown for Production, Scrap & Rework"
            arrow
          >
            <InfoOutlinedIcon
              sx={{ fontSize: 17, color: "text.secondary", cursor: "pointer" }}
            />
          </Tooltip>
        </Stack>
      </Stack>

      <Box ref={cardRef}>
        <DataTable
          columns={columns}
          rows={tableRows}
          getRowKey={(r) => r.shiftKey}
          search={false}
          maxHeight={320}
          emptyMessage="No shift data available."
        />
      </Box>
    </Box>
  );
}

/**
 * Computes dynamic, legible Y-axis ticks and ceiling based on actual data
 */
function computeYAxisScale(data, fallbackMax = 10) {
  const nums = (data || []).filter(
    (v) => typeof v === "number" && Number.isFinite(v) && v > 0,
  );
  const maxValRaw = nums.length > 0 ? Math.max(...nums) : 0;
  if (maxValRaw <= 0) {
    const step = fallbackMax / 4;
    return {
      maxVal: fallbackMax,
      yTicks: [0, step, step * 2, step * 3, fallbackMax],
    };
  }

  // Target max with ~25% headroom so data labels and markers don't hit the ceiling
  const targetMax = maxValRaw * 1.28;
  const roughStep = targetMax / 4;
  const power = Math.pow(10, Math.floor(Math.log10(roughStep)));
  const fraction = roughStep / power;
  let niceFraction;
  if (fraction <= 1.25) niceFraction = 1;
  else if (fraction <= 2.5) niceFraction = 2;
  else if (fraction <= 5) niceFraction = 5;
  else niceFraction = 10;

  const step = niceFraction * power;
  const niceMax = Math.ceil(targetMax / step) * step;
  const count = Math.max(2, Math.min(6, Math.round(niceMax / step)));

  const yTicks = [];
  for (let i = 0; i <= count; i++) {
    const tick = Number((i * step).toFixed(2));
    yTicks.push(tick);
  }

  return { maxVal: yTicks[yTicks.length - 1], yTicks };
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

  const xPositions = [
    padLeft + plotWidth * 0.2,
    padLeft + plotWidth * 0.5,
    padLeft + plotWidth * 0.8,
  ];

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
          No. of Tyres in Thousands
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
          const labelText =
            val == null || isNaN(val)
              ? ""
              : val >= 100
                ? `${Math.round(val)}k`
                : `${val.toFixed(1)}k`;

          const rawVal =
            rawValues && rawValues[idx] != null
              ? rawValues[idx]
              : val != null
                ? val * 1000
                : 0;
          const exactText = `${formatIndianNumber(Math.round(rawVal * 100) / 100)}${unitLabel ? ` ${unitLabel}` : ""}`;
          const tooltipWidth = exactText.length * 7.5 + 20;

          return (
            <g
              key={idx}
              onMouseEnter={() => setHoveredIdx(idx)}
              onMouseLeave={() => setHoveredIdx(null)}
              style={{ cursor: "pointer" }}
            >
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
              />

              {/* Exact Value Tooltip Badge on Hover */}
              {isHovered && (
                <g transform={`translate(${x}, ${Math.max(20, yTop - 10)})`}>
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

              {/* Shift Label at Bottom */}
              <text
                x={x}
                y={chartHeight - 10}
                textAnchor="middle"
                fill={isHovered ? color : theme.palette.text.secondary}
                fontSize="11"
                fontWeight={isHovered ? "700" : "600"}
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
