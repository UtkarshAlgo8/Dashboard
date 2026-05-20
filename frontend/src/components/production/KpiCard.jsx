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
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ShowChartIcon from "@mui/icons-material/ShowChart";
import Sparkline from "./Sparkline.jsx";

/**
 * KPI card per BRD FR-P19 through FR-P24.
 *
 * - Header: name (uppercase) + Trend Icon + chevron (if drillable).
 * - Body: value (large) + unit (subdued) + sparkline (right edge).
 * - Footer: trend % with up/down arrow, coloured by trendFavourable.
 *
 * Clicking the card body toggles the drill (calls `onDrillToggle`).
 * Clicking the Trend Icon stops propagation and calls `onTrendOpen`.
 */
function KpiCard({ kpi, isOpen, onDrillToggle, onTrendOpen }) {
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
      onClick={kpi.drillable ? () => onDrillToggle(kpi.id) : undefined}
      sx={{
        backgroundColor: "background.paper",
        border: 1,
        borderColor: isOpen ? "primary.main" : "divider",
        borderRadius: 1.25,
        p: 1.5,
        cursor: kpi.drillable ? "pointer" : "default",
        transition: "border-color 0.15s, box-shadow 0.15s",
        boxShadow: isOpen ? theme.custom.shadow : "none",
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
          {kpi.drillable && (
            <ExpandMoreIcon
              sx={{
                fontSize: 18,
                color: "text.disabled",
                transition: "transform 0.2s",
                transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
              }}
            />
          )}
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
