import {
  Box,
  IconButton,
  Stack,
  Tooltip,
  Typography,
  useTheme,
} from "@mui/material";
import GridViewIcon from "@mui/icons-material/GridView";
import SettingsIcon from "@mui/icons-material/Settings";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import ArrowOutwardIcon from "@mui/icons-material/ArrowOutward";
import SouthEastIcon from "@mui/icons-material/SouthEast";
import ShowChartIcon from "@mui/icons-material/ShowChart";
import TableChartOutlinedIcon from "@mui/icons-material/TableChartOutlined";
import AccessTimeFilledIcon from "@mui/icons-material/AccessTimeFilled";
import Sparkline from "./Sparkline.jsx";
import { formatIndianNumber } from "@/lib/numberFormat.js";
import { evaluateKpiTier, getKpiCardTheme } from "@/lib/thresholds.js";

/**
 * Adobe XD Thematic KPI Card
 * Supports dynamic threshold tiers: green, amber, red.
 */
function KpiCard({
  kpi,
  isDrilling = false,
  isDrilldown = false,
  onClick,
  onTrendOpen,
  onCloseDrill,
}) {
  const theme = useTheme();
  if (!kpi) return null;

  // Determine dynamic threshold tier: "green" | "amber" | "red"
  const tier = evaluateKpiTier(kpi);
  const cardTheme = getKpiCardTheme(theme, tier);

  // Pick Icon based on KPI
  const kpiId = String(kpi.id || kpi.rawName || "").toLowerCase();
  const kpiName = String(kpi.name || "").toLowerCase();

  let HeaderIcon;
  let displayName;
  let subtitle;

  if (kpiId.includes("oee") || kpiName.includes("oee")) {
    HeaderIcon = SettingsIcon;
    displayName = "OEE";
    subtitle = "";
  } else if (
    kpiId.includes("comp") ||
    kpiName.includes("compliance") ||
    kpiName.includes("fulfillment") ||
    kpiName.includes("plan")
  ) {
    HeaderIcon = CheckCircleIcon;
    displayName = kpi.name || "SKU Plan Fulfillment";
    subtitle = "of total planned";
  } else if (kpiId.includes("downtime") || kpiName.includes("downtime")) {
    HeaderIcon = AccessTimeFilledIcon;
    displayName = kpi.name || "Total Downtime";
    subtitle = kpi.unit ? kpi.unit : "mins";
  } else if (kpiId.includes("prod") || kpiName.includes("prod")) {
    HeaderIcon = GridViewIcon;
    displayName = kpi.name || "Production";
    subtitle = kpi.unit || "NOS";
  } else {
    HeaderIcon = GridViewIcon;
    displayName = kpi.name || "KPI";
    subtitle = kpi.unit ?? "";
  }

  // Calculate Progress % & formatted value
  const numVal =
    typeof kpi.value === "number"
      ? kpi.value
      : kpi.value != null && kpi.value !== ""
        ? parseFloat(kpi.value)
        : null;

  let progressPct = 0;
  let formattedVal = "–";

  if (numVal != null && !isNaN(numVal)) {
    if (kpiId.includes("oee") || kpiName.includes("oee")) {
      progressPct = Math.min(100, Math.max(0, numVal));
      formattedVal = `${Number.isInteger(numVal) ? numVal : numVal.toFixed(1)}%`;
    } else if (
      kpiId.includes("comp") ||
      kpiName.includes("compliance") ||
      kpiName.includes("plan")
    ) {
      progressPct = Math.min(100, Math.max(0, numVal));
      formattedVal = `${Number.isInteger(numVal) ? numVal : numVal.toFixed(1)}%`;
    } else {
      const target =
        typeof kpi.target === "number"
          ? kpi.target
          : kpi.target != null && kpi.target !== ""
            ? parseFloat(kpi.target)
            : null;
      if (target != null && !isNaN(target) && target > 0) {
        progressPct = Math.min(100, Math.max(0, (numVal / target) * 100));
      } else {
        progressPct = numVal > 0 ? 100 : 0;
      }
      formattedVal = formatIndianNumber(numVal);
    }
  }

  // Trend formatting & colour resolution
  const trendUp = kpi.trend == null ? true : kpi.trend >= 0;
  const isFavourable =
    kpi.trendFavourable ?? (kpi.trend == null ? true : kpi.trend >= 0);
  const trendColor =
    kpi.trend == null || kpi.trend === ""
      ? theme.palette.text.secondary
      : isFavourable
        ? theme.custom.status.green
        : theme.custom.status.red;

  let trendVal = "–";
  const isProduction = kpiId.includes("prod") || kpiName.includes("prod");
  const trendValue =
    kpi.trendValue == null || kpi.trendValue === ""
      ? null
      : Number(kpi.trendValue);
  const trendPct =
    kpi.trend == null || kpi.trend === "" ? null : Number(kpi.trend);

  if (isProduction) {
    const unitLabel = kpi.unit || "NOS";
    if (Number.isFinite(trendValue)) {
      trendVal = `${trendValue > 0 ? "+" : ""}${formatIndianNumber(trendValue)} ${unitLabel}`;
    } else if (Number.isFinite(trendPct) && Number.isFinite(numVal)) {
      const denominator = 1 + trendPct / 100;
      if (denominator !== 0) {
        const baselineValue = numVal / denominator;
        const absoluteDifference = Math.round(numVal - baselineValue);
        trendVal = `${absoluteDifference > 0 ? "+" : ""}${formatIndianNumber(absoluteDifference)} ${unitLabel}`;
      }
    }
  } else if (Number.isFinite(trendPct)) {
    trendVal = `${trendPct > 0 ? "+" : ""}${trendPct.toFixed(1)}%`;
  }
  const trendLabel = kpi.trendBaseline ?? "vs prev";

  const hasSpark = Array.isArray(kpi.spark) && kpi.spark.length >= 2;

  return (
    <Box
      onClick={() => onClick?.(kpi)}
      sx={{
        position: "relative",
        containerType: "inline-size",
        backgroundColor: cardTheme.cardBg,
        border: isDrilling ? 2 : 1,
        borderColor: isDrilling ? "primary.main" : `${cardTheme.sparkColor}30`,
        borderRadius: 2.5,
        p: 1.75,
        minWidth: 0,
        boxShadow: isDrilling
          ? "0 4px 14px rgba(0,0,0,0.08)"
          : theme.custom.shadow,
        cursor: kpi.drillable ? "pointer" : "default",
        transition: "all 0.15s ease",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        minHeight: 136,
        "&:hover": {
          boxShadow: "0 4px 12px rgba(0,0,0,0.06)",
        },
      }}
    >
      {/* 1. Header: Icon + Title + Info (i) */}
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        sx={{ mb: 0.75 }}
      >
        <Stack
          direction="row"
          alignItems="center"
          spacing={1}
          sx={{ minWidth: 0 }}
        >
          <HeaderIcon
            sx={{ fontSize: 20, color: cardTheme.iconColor, flexShrink: 0 }}
          />
          <Typography
            sx={{
              fontSize: 15,
              fontWeight: 700,
              color: "text.primary",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {displayName}
          </Typography>
        </Stack>

        <Tooltip title="KPI Details & Calculation Info" arrow>
          <InfoOutlinedIcon
            sx={{
              fontSize: 18,
              color: "text.secondary",
              cursor: "pointer",
              flexShrink: 0,
            }}
          />
        </Tooltip>
      </Stack>

      {/* 2. Main Metric + Sparkline */}
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        spacing={1}
        sx={{ my: 0.25, minWidth: 0 }}
      >
        {/* Left: Value, Unit & Sub-Badges */}
        <Stack sx={{ minWidth: 0, flex: 1 }}>
          <Stack
            direction="row"
            alignItems="baseline"
            spacing={0.75}
            sx={{ minWidth: 0 }}
          >
            <Typography
              sx={{
                fontSize: { xs: 24, md: 26, lg: 28 },
                fontWeight: 800,
                lineHeight: 1.1,
                color: cardTheme.textColor,
                whiteSpace: "nowrap",
              }}
            >
              {formattedVal}
            </Typography>
            {subtitle && (
              <Typography
                sx={{
                  fontSize: 13,
                  fontWeight: 500,
                  color: "text.secondary",
                  whiteSpace: "nowrap",
                }}
              >
                {subtitle}
              </Typography>
            )}
          </Stack>

          {/* Badges / Annotations row (placed neatly below the metric value) */}
          {(Boolean(kpi.topMachine) ||
            Boolean(kpi.partialDay) ||
            Boolean(kpi.truncated)) && (
            <Stack
              direction="row"
              alignItems="center"
              spacing={0.75}
              sx={{ mt: 0.25, flexWrap: "wrap", rowGap: 0.25 }}
            >
              {kpi.topMachine && (
                <Tooltip
                  title={`Machine with the most downtime in this window (Breakdown, Power Failure, Preventive Maintenance, Setup & Change, Operations/Material/Manpower — excludes No Schedule): ${Math.round(kpi.topMachine.minutes).toLocaleString()} min.`}
                  arrow
                >
                  <Typography
                    sx={{
                      fontSize: 11,
                      fontWeight: 500,
                      color: "text.secondary",
                      whiteSpace: "nowrap",
                    }}
                  >
                    Top: {kpi.topMachine.machine} (
                    {Math.round(kpi.topMachine.minutes).toLocaleString()} min)
                  </Typography>
                </Tooltip>
              )}
              {kpi.partialDay && (
                <Tooltip
                  title="This day is still in progress — one or more shifts have no row yet, so a comparison against the previous full day would be an artefact."
                  arrow
                >
                  <Typography
                    sx={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: "warning.main",
                      whiteSpace: "nowrap",
                    }}
                  >
                    in progress · partial day
                  </Typography>
                </Tooltip>
              )}
              {kpi.truncated && (
                <Tooltip
                  title="The row cap was reached for this window, so the oldest days are missing from this total. Narrow the date range for a complete figure."
                  arrow
                >
                  <Typography
                    sx={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: "error.main",
                      whiteSpace: "nowrap",
                    }}
                  >
                    partial data · range too wide
                  </Typography>
                </Tooltip>
              )}
            </Stack>
          )}
        </Stack>

        {/* Sparkline Graph — Auto-hides when card is too narrow (<215px) to prevent text collision */}
        {hasSpark && (
          <Box
            sx={{
              flexShrink: 0,
              ml: 1,
              "@container (max-width: 215px)": {
                display: "none",
              },
            }}
          >
            <Sparkline
              data={kpi.spark}
              color={cardTheme.sparkColor}
              width={70}
              height={22}
              onClick={(e) => {
                e.stopPropagation();
                onTrendOpen?.(kpi);
              }}
            />
          </Box>
        )}
      </Stack>

      {/* 3. Horizontal Target / Progress Bar with Gradient */}
      {!isDrilling && !isDrilldown && (
        <Box
          sx={{
            width: "100%",
            height: 6,
            borderRadius: 3,
            backgroundColor: cardTheme.trackColor,
            overflow: "hidden",
            my: 0.75,
          }}
        >
          <Box
            sx={{
              width: `${progressPct}%`,
              height: "100%",
              borderRadius: 3,
              background: cardTheme.barGradient || cardTheme.barColor,
              transition: "width 0.4s ease",
            }}
          />
        </Box>
      )}

      {/* Production vs Plan & Shortfall (SKU Plan Fulfillment) — Compact single-line row */}
      {kpi.produced != null &&
        kpi.planned != null &&
        !isDrilling &&
        !isDrilldown && (
          <Stack
            direction="row"
            alignItems="center"
            justifyContent="space-between"
            sx={{ mt: 0.5, mb: 0.25, minWidth: 0, flexWrap: "wrap", gap: 0.5 }}
          >
            <Typography
              sx={{
                fontSize: 11.5,
                fontWeight: 600,
                color: "text.secondary",
                whiteSpace: "nowrap",
              }}
            >
              Prod / Plan:{" "}
              <Box
                component="span"
                sx={{ fontWeight: 700, color: cardTheme.textColor }}
              >
                {formatIndianNumber(kpi.produced)}
              </Box>{" "}
              / {formatIndianNumber(kpi.planned)} {kpi.quantityUnit || "NOS"}
            </Typography>

            {kpi.shortfall != null && (
              <Typography
                sx={{
                  fontSize: 11.5,
                  fontWeight: 600,
                  color: "text.secondary",
                  whiteSpace: "nowrap",
                }}
              >
                {kpi.shortfall > 0 ? (
                  <>
                    Shortfall:{" "}
                    <Box
                      component="span"
                      sx={{
                        fontWeight: 700,
                        color: theme.custom?.status?.red ?? "error.main",
                      }}
                    >
                      {formatIndianNumber(kpi.shortfall)}
                    </Box>{" "}
                    {kpi.quantityUnit || "NOS"}
                  </>
                ) : kpi.shortfall < 0 ? (
                  <>
                    Surplus:{" "}
                    <Box
                      component="span"
                      sx={{
                        fontWeight: 700,
                        color: theme.custom?.status?.green ?? "success.main",
                      }}
                    >
                      +{formatIndianNumber(-kpi.shortfall)}
                    </Box>{" "}
                    {kpi.quantityUnit || "NOS"}
                  </>
                ) : (
                  <>
                    Shortfall:{" "}
                    <Box
                      component="span"
                      sx={{
                        fontWeight: 700,
                        color: theme.custom?.status?.green ?? "success.main",
                      }}
                    >
                      0
                    </Box>{" "}
                    {kpi.quantityUnit || "NOS"}
                  </>
                )}
              </Typography>
            )}
          </Stack>
        )}

      {/* 4. Footer: Trend Badge & Action Icons */}
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        sx={{ mt: 0.5 }}
      >
        {/* Trend Indicator */}
        <Stack direction="row" alignItems="center" spacing={0.5}>
          {trendUp ? (
            <ArrowOutwardIcon sx={{ fontSize: 15, color: trendColor }} />
          ) : (
            <SouthEastIcon sx={{ fontSize: 15, color: trendColor }} />
          )}
          <Typography
            sx={{
              fontSize: 13,
              fontWeight: 700,
              color: trendColor,
            }}
          >
            {trendVal}
          </Typography>
          <Typography
            sx={{
              fontSize: 12.5,
              fontWeight: 500,
              color: "text.secondary",
            }}
          >
            {trendLabel}
          </Typography>
        </Stack>

        {/* Action Drilldown & Table Icons */}
        <Stack direction="row" alignItems="center" spacing={0.5}>
          <Tooltip title="View Trend Analytics" arrow>
            <IconButton
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                onTrendOpen?.(kpi);
              }}
              sx={{
                p: 0.25,
                color: "text.secondary",
                "&:hover": { color: "primary.main" },
              }}
            >
              <ShowChartIcon sx={{ fontSize: 15 }} />
            </IconButton>
          </Tooltip>

          <Tooltip title="Drilldown Data Table" arrow>
            <IconButton
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                if (isDrilling) onCloseDrill?.();
                else onClick?.(kpi);
              }}
              sx={{
                p: 0.25,
                color: "text.secondary",
                "&:hover": { color: "primary.main" },
              }}
            >
              <TableChartOutlinedIcon sx={{ fontSize: 15 }} />
            </IconButton>
          </Tooltip>
        </Stack>
      </Stack>
    </Box>
  );
}

export default KpiCard;
