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
      const absoluteDifference = Math.round(numVal * (trendPct / 100));
      trendVal = `${absoluteDifference > 0 ? "+" : ""}${formatIndianNumber(absoluteDifference)} ${unitLabel}`;
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
        p: 2,
        minWidth: 0,
        boxShadow: isDrilling
          ? "0 4px 14px rgba(0,0,0,0.08)"
          : theme.custom.shadow,
        cursor: kpi.drillable ? "pointer" : "default",
        transition: "all 0.15s ease",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        minHeight: 148,
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
        sx={{ mb: 1 }}
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
        sx={{ my: 0.5, minWidth: 0 }}
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
          {(Boolean(kpi.scope?.kind === "perMachineAvg" && kpi.scope.machines > 0) ||
            Boolean(kpi.partialDay) ||
            Boolean(kpi.truncated)) && (
            <Stack
              direction="row"
              alignItems="center"
              spacing={0.75}
              sx={{ mt: 0.35, flexWrap: "wrap", rowGap: 0.25 }}
            >
              {kpi.scope?.kind === "perMachineAvg" && kpi.scope.machines > 0 && (
                <Tooltip
                  title={`Machines go down at the same time, so their minutes cannot simply be added. This is the average across the ${kpi.scope.machines} machines that recorded downtime in this window.`}
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
                    ({kpi.scope.machines} m/c avg)
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
            height: 7,
            borderRadius: 4,
            backgroundColor: cardTheme.trackColor,
            overflow: "hidden",
            my: 1,
          }}
        >
          <Box
            sx={{
              width: `${progressPct}%`,
              height: "100%",
              borderRadius: 4,
              background: cardTheme.barGradient || cardTheme.barColor,
              transition: "width 0.4s ease",
            }}
          />
        </Box>
      )}

      {/* Production vs Plan & Shortfall (SKU Plan Fulfillment) */}
      {kpi.produced != null && kpi.planned != null && !isDrilling && !isDrilldown && (
        <Box sx={{ my: 0.75 }}>
          <Typography
            sx={{
              fontSize: 12,
              fontWeight: 600,
              color: "text.secondary",
              lineHeight: 1.2,
            }}
          >
            Production vs Plan
          </Typography>
          <Stack
            direction="row"
            alignItems="baseline"
            spacing={0.5}
            sx={{ mt: 0.35 }}
          >
            <Typography
              sx={{
                fontSize: 14,
                fontWeight: 700,
                color: cardTheme.textColor,
                lineHeight: 1.2,
              }}
            >
              {formatIndianNumber(kpi.produced)}
            </Typography>
            <Typography
              sx={{
                fontSize: 14,
                fontWeight: 700,
                color: "text.primary",
                lineHeight: 1.2,
              }}
            >
              / {formatIndianNumber(kpi.planned)} {kpi.quantityUnit || "NOS"}
            </Typography>
          </Stack>
          <Stack direction="row" spacing={3} sx={{ mt: 0.1 }}>
            <Typography
              sx={{ fontSize: 10, fontWeight: 500, color: "text.secondary" }}
            >
              Produced
            </Typography>
            <Typography
              sx={{ fontSize: 10, fontWeight: 500, color: "text.secondary" }}
            >
              Planned
            </Typography>
          </Stack>
          {kpi.shortfall != null && (
            <Typography
              sx={{
                fontSize: 12,
                fontWeight: 600,
                color: kpi.shortfall > 0 ? "text.primary" : "success.main",
                mt: 0.5,
              }}
            >
              {kpi.shortfall > 0
                ? `Shortfall: ${formatIndianNumber(kpi.shortfall)} ${kpi.quantityUnit || "NOS"}`
                : kpi.shortfall < 0
                  ? `Surplus: +${formatIndianNumber(-kpi.shortfall)} ${kpi.quantityUnit || "NOS"}`
                  : `Shortfall: 0 ${kpi.quantityUnit || "NOS"}`}
            </Typography>
          )}
        </Box>
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
