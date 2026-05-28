import {
  Box,
  IconButton,
  Stack,
  Tooltip,
  Typography,
  useTheme,
} from "@mui/material";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import KeyboardArrowUpIcon from "@mui/icons-material/KeyboardArrowUp";
import ShowChartIcon from "@mui/icons-material/ShowChart";
import Sparkline from "./Sparkline.jsx";

/**
 * KPI card — CR-08 update.
 *
 * New interface (replaces FR-P19/FR-P20 toggle-based drill):
 *   onClick(kpi)  — fires on card body click; parent decides whether
 *                   to trigger drill based on kpi.drillable + drillDown.
 *   isDrilling     — styled open state for the drill root card.
 *   onCloseDrill   — called when the close icon is clicked; resets drill.
 */
function KpiCard({ kpi, isDrilling, onClick, onTrendOpen, onCloseDrill }) {
  const theme = useTheme();
  const sparkColor = kpi.trendFavourable
    ? theme.custom.brand.green
    : theme.custom.brand.red;
  const trendColor = kpi.trendFavourable
    ? theme.custom.brand.green
    : theme.custom.brand.red;
  const trendUp = kpi.trend > 0;

  return (
    <Box
      onClick={() => onClick(kpi)}
      sx={{
        backgroundColor: "background.paper",
        border: 1,
        borderColor: isDrilling ? "primary.main" : "divider",
        borderRadius: 1.25,
        p: 1.5,
        cursor: kpi.drillable ? "pointer" : "default",
        transition: "border-color 0.15s, box-shadow 0.15s",
        boxShadow: isDrilling ? theme.custom.shadow : "none",
        "&:hover": kpi.drillable
          ? { boxShadow: theme.custom.shadow }
          : undefined,
      }}
    >
      {/* Header row */}
      <Stack direction="row" alignItems="center" justifyContent="space-between">
        <Typography
          sx={{
            fontSize: 11,
            fontWeight: 700,
            color: "text.disabled",
            textTransform: "uppercase",
            letterSpacing: 0.6,
          }}
        >
          {kpi.name}
        </Typography>
        <Stack direction="row" spacing={0.25} alignItems="center">
          <Tooltip title="Trend" arrow>
            <IconButton
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                onTrendOpen(kpi.id);
              }}
            >
              <ShowChartIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Tooltip>
          {isDrilling ? (
            <Tooltip title="Close drill" arrow>
              <IconButton
                size="small"
                onClick={(e) => {
                  e.stopPropagation();
                  onCloseDrill();
                }}
              >
                <KeyboardArrowUpIcon
                  sx={{ fontSize: 18, transform: "rotate(180deg)" }}
                />
              </IconButton>
            </Tooltip>
          ) : kpi.drillable ? (
            <Tooltip title="Drill down" arrow>
              <Box
                sx={{
                  width: 22,
                  height: 22,
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: `${theme.custom.brand.orange}1f`,
                  color: "primary.main",
                }}
              >
                <KeyboardArrowUpIcon sx={{ fontSize: 18 }} />
              </Box>
            </Tooltip>
          ) : null}
        </Stack>
      </Stack>

      {/* Body row */}
      <Stack
        direction="row"
        alignItems="flex-end"
        justifyContent="space-between"
        sx={{ mt: 0.5 }}
      >
        <Stack direction="row" alignItems="baseline" spacing={0.5}>
          <Typography sx={{ fontSize: 28, fontWeight: 700, lineHeight: 1 }}>
            {kpi.value}
          </Typography>
          <Typography
            sx={{ fontSize: 12, color: "text.disabled", fontWeight: 500 }}
          >
            {kpi.unit}
          </Typography>
        </Stack>
        <Sparkline data={kpi.spark} color={sparkColor} />
      </Stack>

      {/* Footer row: trend % */}
      {kpi.trend !== null && kpi.trend !== undefined && (
        <Stack
          direction="row"
          alignItems="center"
          spacing={0.25}
          sx={{ mt: 0.75 }}
        >
          {trendUp ? (
            <ArrowUpwardIcon sx={{ fontSize: 12, color: trendColor }} />
          ) : (
            <ArrowDownwardIcon sx={{ fontSize: 12, color: trendColor }} />
          )}
          <Typography sx={{ fontSize: 12, fontWeight: 600, color: trendColor }}>
            {Math.abs(kpi.trend).toFixed(1)}%
          </Typography>
          <Typography sx={{ fontSize: 11, color: "text.disabled" }}>
            vs prev
          </Typography>
        </Stack>
      )}
    </Box>
  );
}

export default KpiCard;
