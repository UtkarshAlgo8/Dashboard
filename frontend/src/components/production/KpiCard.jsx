import {
  Box,
  IconButton,
  Stack,
  Tooltip,
  Typography,
  useTheme,
} from "@mui/material";
import GridViewIcon from "@mui/icons-material/GridView";
import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined";
import CheckCircleOutlinedIcon from "@mui/icons-material/CheckCircleOutlined";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import ArrowOutwardIcon from "@mui/icons-material/ArrowOutward";
import SouthEastIcon from "@mui/icons-material/SouthEast";
import ShowChartIcon from "@mui/icons-material/ShowChart";
import TableChartOutlinedIcon from "@mui/icons-material/TableChartOutlined";
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
    HeaderIcon = SettingsOutlinedIcon;
    displayName = "Overall Equipment Effectiveness (OEE)";
    subtitle = "";
  } else if (
    kpiId.includes("comp") ||
    kpiName.includes("compliance") ||
    kpiName.includes("plan")
  ) {
    HeaderIcon = CheckCircleOutlinedIcon;
    displayName = "Plan Compliance";
    subtitle = "of total planned";
  } else {
    HeaderIcon = GridViewIcon;
    displayName = kpi.name || "Production";
    subtitle = "tyres";
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

  // Trend formatting
  const trendUp = kpi.trend == null || kpi.trend >= 0;
  let trendVal = "–";
  if (kpi.trendValue != null && !isNaN(kpi.trendValue)) {
    trendVal =
      `${kpi.trendValue > 0 ? "+" : ""}${formatIndianNumber(kpi.trendValue)} ${kpiId.includes("prod") ? "Tyres" : ""}`.trim();
  } else if (kpi.trend != null && !isNaN(kpi.trend)) {
    trendVal = `${kpi.trend > 0 ? "+" : ""}${kpi.trend.toFixed(1)}%`;
  }
  const trendLabel = kpi.trendBaseline ?? "vs prev";

  // Sparkline data
  const sparkData =
    Array.isArray(kpi.spark) && kpi.spark.length >= 2
      ? kpi.spark
      : kpiId.includes("comp") || kpiName.includes("plan")
        ? [96, 95, 93, 95, 92, 94]
        : kpiId.includes("oee") || kpiName.includes("oee")
          ? [82, 85, 84, 87, 86, 88]
          : [680000, 695000, 710000, 705000, 720000, 714548];

  return (
    <Box
      onClick={() => onClick?.(kpi)}
      sx={{
        position: "relative",
        backgroundColor: cardTheme.cardBg,
        border: 1,
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
        sx={{ my: 0.5 }}
      >
        <Stack
          direction="row"
          alignItems="baseline"
          spacing={0.75}
          sx={{ minWidth: 0 }}
        >
          <Typography
            sx={{
              fontSize: 28,
              fontWeight: 800,
              lineHeight: 1.1,
              color: cardTheme.textColor,
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

        {/* Sparkline Graph */}
        <Box sx={{ flexShrink: 0 }}>
          <Sparkline
            data={sparkData}
            color={cardTheme.sparkColor}
            width={75}
            height={24}
            onClick={(e) => {
              e.stopPropagation();
              onTrendOpen?.(kpi);
            }}
          />
        </Box>
      </Stack>

      {/* 3. Horizontal Target / Progress Bar with Gradient */}
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
            <ArrowOutwardIcon
              sx={{ fontSize: 15, color: cardTheme.trendColor }}
            />
          ) : (
            <SouthEastIcon sx={{ fontSize: 15, color: "error.main" }} />
          )}
          <Typography
            sx={{
              fontSize: 13,
              fontWeight: 700,
              color: cardTheme.trendColor,
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
