import {
  Box,
  LinearProgress,
  Stack,
  Typography,
  useTheme,
} from "@mui/material";

/**
 * Progress-bar variant for counter KPIs (Days Without Reportable
 * Incident, Safe Days). Shows current value, target, and a
 * horizontal bar. No time axis — counter is point-in-time. Phase 1
 * has no counter KPIs in Mixing/Productivity, but the component is
 * here so specs 11/12/14 plug in without modifying pickChartType
 * consumers.
 */
function ProgressChart({ value, unit, target }) {
  const theme = useTheme();
  const pct =
    target != null && target > 0 ? Math.min((value / target) * 100, 100) : 0;
  const color =
    pct >= 100
      ? theme.custom.brand.green
      : pct >= 75
        ? theme.custom.brand.amber
        : theme.custom.brand.red;

  return (
    <Box sx={{ py: 4 }}>
      <Stack direction="row" alignItems="baseline" spacing={1.5}>
        <Typography sx={{ fontSize: 56, fontWeight: 700, lineHeight: 1 }}>
          {value}
        </Typography>
        <Typography sx={{ fontSize: 18, color: "text.disabled" }}>
          {unit}
        </Typography>
      </Stack>
      {target != null && (
        <>
          <Typography
            sx={{ fontSize: 12, color: "text.disabled", mt: 1.5, mb: 0.75 }}
          >
            Target: {target} {unit}
          </Typography>
          <LinearProgress
            variant="determinate"
            value={pct}
            sx={{
              height: 12,
              borderRadius: 6,
              backgroundColor: theme.custom.surface.soft,
              "& .MuiLinearProgress-bar": { backgroundColor: color },
            }}
          />
          <Typography sx={{ fontSize: 11, color, fontWeight: 600, mt: 0.5 }}>
            {pct.toFixed(0)}% of target
          </Typography>
        </>
      )}
    </Box>
  );
}

export default ProgressChart;
