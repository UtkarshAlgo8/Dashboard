/**
 * Quality KPI card shared by the BTP and CTP Quality pages. The caller passes
 * the display value in `kpi.v`; any tyre-type adjustment happens upstream.
 */
import {
  Box,
  IconButton,
  Stack,
  Tooltip,
  Typography,
  useTheme,
} from "@mui/material";
import ArrowOutwardIcon from "@mui/icons-material/ArrowOutward";
import GridViewIcon from "@mui/icons-material/GridView";
import ShowChartIcon from "@mui/icons-material/ShowChart";
import SouthEastIcon from "@mui/icons-material/SouthEast";
import TableChartOutlinedIcon from "@mui/icons-material/TableChartOutlined";
import TaskAltOutlinedIcon from "@mui/icons-material/TaskAltOutlined";
import Sparkline from "@/components/production/Sparkline.jsx";
import { getKpiCardTheme } from "@/lib/thresholds.js";
import { formatIndianNumber } from "@/lib/numberFormat.js";
import {
  QUALITY_KPI_ICON,
  numericKpiValue,
  qualityCardTier,
} from "./qualityKpi.js";

/**
 * Quality KPI card, built on the Production dashboard's KpiCard so the two
 * pages read as one product: same tiered background, icon + title header,
 * value with its unit, progress bar, and trend / drill icons in the footer.
 */
export function QKpiCard({ kpi, isOpen, onToggle, onTrend }) {
  const theme = useTheme();
  const tier = qualityCardTier(kpi);
  const cardTheme = getKpiCardTheme(theme, tier);
  const v = kpi.v;
  const numVal = numericKpiValue(v);
  const hasValue = numVal != null;
  const isPct = kpi.u === "%";
  const progressPct = !hasValue
    ? 0
    : isPct
      ? Math.max(0, Math.min(100, numVal))
      : numVal > 0
        ? 100
        : 0;
  const value = hasValue
    ? `${formatIndianNumber(numVal)}${isPct ? "%" : ""}`
    : "–";
  const canTrend = !kpi.na && kpi.trendApi && typeof onTrend === "function";
  const canDrill = Boolean(kpi.drill);
  const Icon =
    QUALITY_KPI_ICON[kpi.id] ?? (isPct ? TaskAltOutlinedIcon : GridViewIcon);
  const caption = hasValue
    ? [kpi.metricLabel, kpi.periodLabel].filter(Boolean).join(" · ")
    : "";
  const footnote = !hasValue
    ? (kpi.emptyReason ?? (kpi.na ? "Not available yet" : null))
    : kpi.target
      ? `Target ${kpi.target}`
      : kpi.metricLabel && !kpi.periodLabel
        ? kpi.metricLabel
        : null;
  const trendPct = hasValue ? kpi.trendPct : null;
  const hasTrend = Number.isFinite(trendPct);
  const trendColor = !hasTrend
    ? theme.palette.text.secondary
    : trendPct === 0 || trendPct > 0 !== Boolean(kpi.lowerIsBetter)
      ? theme.custom.status.green
      : theme.custom.status.red;
  const iconButtonSx = {
    p: 0.25,
    color: "text.secondary",
    "&:hover": { color: "primary.main" },
  };

  return (
    <Box
      onClick={canDrill ? onToggle : undefined}
      role={canDrill ? "button" : undefined}
      tabIndex={canDrill ? 0 : undefined}
      aria-expanded={canDrill ? isOpen : undefined}
      onKeyDown={
        canDrill
          ? (e) => {
              if (e.target !== e.currentTarget) return;
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onToggle();
              }
            }
          : undefined
      }
      sx={{
        position: "relative",
        containerType: "inline-size",
        backgroundColor: cardTheme.cardBg,
        border: isOpen ? 2 : 1,
        borderColor: isOpen ? "primary.main" : `${cardTheme.sparkColor}30`,
        borderRadius: 2.5,
        p: 1.75,
        minWidth: 0,
        boxShadow: isOpen ? "0 4px 14px rgba(0,0,0,0.08)" : theme.custom.shadow,
        cursor: canDrill ? "pointer" : "default",
        transition: "all 0.15s ease",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        minHeight: 136,
        "&:hover": canDrill ? { boxShadow: "0 4px 12px rgba(0,0,0,0.06)" } : {},
        "&:focus-visible": {
          outline: "2px solid",
          outlineColor: "primary.main",
          outlineOffset: 2,
        },
      }}
    >
      {/* Header: icon + title */}
      <Stack
        direction="row"
        alignItems="center"
        spacing={1}
        sx={{ mb: 0.75, minWidth: 0 }}
      >
        <Icon
          sx={{
            fontSize: 20,
            color: hasValue ? cardTheme.iconColor : "text.disabled",
            flexShrink: 0,
          }}
        />
        <Typography
          title={kpi.n}
          sx={{
            fontSize: 15,
            fontWeight: 700,
            color: "text.primary",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {kpi.n}
        </Typography>
        {kpi.manual && (
          <Typography
            component="span"
            sx={{
              fontSize: 11,
              fontWeight: 600,
              color: "text.secondary",
              flexShrink: 0,
            }}
          >
            Manual
          </Typography>
        )}
      </Stack>

      {/* Value + unit, sparkline on the right when there is one */}
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        spacing={1}
        sx={{ my: 0.25, minWidth: 0 }}
      >
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
                color: hasValue ? cardTheme.textColor : "text.disabled",
                whiteSpace: "nowrap",
              }}
            >
              {value}
            </Typography>
            {hasValue && kpi.u && !isPct && (
              <Typography
                sx={{
                  fontSize: 13,
                  fontWeight: 500,
                  color: "text.secondary",
                  whiteSpace: "nowrap",
                }}
              >
                {kpi.u}
              </Typography>
            )}
          </Stack>
          {caption && (
            <Typography
              title={caption}
              sx={{
                mt: 0.25,
                fontSize: 11,
                fontWeight: 500,
                color: "text.secondary",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {caption}
            </Typography>
          )}
        </Stack>
        {hasValue && Array.isArray(kpi.sp) && kpi.sp.length >= 2 && (
          <Box
            sx={{
              flexShrink: 0,
              ml: 1,
              "@container (max-width: 215px)": { display: "none" },
            }}
          >
            <Sparkline
              data={kpi.sp}
              color={cardTheme.sparkColor}
              width={70}
              height={22}
              onClick={
                canTrend
                  ? (e) => {
                      e.stopPropagation();
                      onTrend(kpi);
                    }
                  : undefined
              }
            />
          </Box>
        )}
      </Stack>

      {/* Progress bar */}
      {!isOpen && (
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

      {/* Footer: target or why the value is missing; trend + drill icons */}
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        spacing={1}
        sx={{ mt: 0.5, minHeight: 22 }}
      >
        {hasTrend ? (
          <Stack
            direction="row"
            alignItems="center"
            spacing={0.5}
            sx={{ minWidth: 0 }}
          >
            {trendPct >= 0 ? (
              <ArrowOutwardIcon sx={{ fontSize: 15, color: trendColor }} />
            ) : (
              <SouthEastIcon sx={{ fontSize: 15, color: trendColor }} />
            )}
            <Typography
              sx={{ fontSize: 13, fontWeight: 700, color: trendColor }}
            >
              {`${trendPct > 0 ? "+" : ""}${trendPct.toFixed(1)}%`}
            </Typography>
            <Typography
              sx={{
                fontSize: 12.5,
                fontWeight: 500,
                color: "text.secondary",
                whiteSpace: "nowrap",
              }}
            >
              {kpi.trendBaseline ?? "vs prev"}
            </Typography>
          </Stack>
        ) : (
          <Typography
            sx={{
              fontSize: 12.5,
              fontWeight: 500,
              color: "text.secondary",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {footnote}
          </Typography>
        )}
        <Stack direction="row" alignItems="center" spacing={0.5}>
          {canTrend && (
            <Tooltip title="View trend" arrow>
              <IconButton
                size="small"
                aria-label={`View ${kpi.n} trend`}
                onClick={(e) => {
                  e.stopPropagation();
                  onTrend(kpi);
                }}
                sx={iconButtonSx}
              >
                <ShowChartIcon sx={{ fontSize: 15 }} />
              </IconButton>
            </Tooltip>
          )}
          {canDrill && (
            <Tooltip
              title={isOpen ? "Close drill-down" : "Open drill-down"}
              arrow
            >
              <IconButton
                size="small"
                aria-label={`${isOpen ? "Close" : "Open"} ${kpi.n} drill-down`}
                onClick={(e) => {
                  e.stopPropagation();
                  onToggle();
                }}
                sx={{
                  ...iconButtonSx,
                  color: isOpen ? "primary.main" : "text.secondary",
                }}
              >
                <TableChartOutlinedIcon sx={{ fontSize: 15 }} />
              </IconButton>
            </Tooltip>
          )}
        </Stack>
      </Stack>
    </Box>
  );
}
