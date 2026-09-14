import { Box, Typography, useTheme } from "@mui/material";

/**
 * One-value Engineering KPI tile (spec 16). Deliberately simpler than
 * `production/KpiCard.jsx` — no sparkline, trend button or drilldown icon,
 * since no drill panel exists yet for Engineering (specs 17+).
 */
function EngineeringKpiCard({ kpi }) {
  const theme = useTheme();
  if (!kpi) return null;

  const borderColor = statusColor(theme, kpi.status);
  const formattedValue =
    typeof kpi.value === "number" ? formatValue(kpi.value) : (kpi.value ?? "–");

  return (
    <Box
      sx={{
        backgroundColor: "background.paper",
        borderRadius: 2.5,
        borderLeft: 4,
        borderLeftColor: borderColor,
        boxShadow: theme.custom.shadow,
        px: 2,
        py: 1.75,
        display: "flex",
        flexDirection: "column",
        gap: 0.75,
        minHeight: 96,
      }}
    >
      <Typography
        sx={{
          fontSize: 11.5,
          fontWeight: 700,
          letterSpacing: "0.04em",
          textTransform: "uppercase",
          color: "text.secondary",
        }}
      >
        {kpi.name}
      </Typography>

      <Box sx={{ display: "flex", alignItems: "baseline", gap: 0.75 }}>
        <Typography
          sx={{ fontSize: 26, fontWeight: 700, color: "text.primary" }}
        >
          {formattedValue}
        </Typography>
        {kpi.unit && (
          <Typography
            sx={{ fontSize: 13, fontWeight: 600, color: "text.secondary" }}
          >
            {kpi.unit}
          </Typography>
        )}
      </Box>

      {kpi.target != null && kpi.target !== "" && (
        <Typography sx={{ fontSize: 11.5, color: "text.disabled" }}>
          {`Target: ${typeof kpi.target === "number" ? formatValue(kpi.target) : kpi.target}${kpi.unit ? ` ${kpi.unit}` : ""}`}
        </Typography>
      )}
    </Box>
  );
}

function formatValue(value) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function statusColor(theme, status) {
  switch (status) {
    case "green":
      return theme.custom.status.green;
    case "yellow":
      return theme.custom.status.amber;
    case "red":
      return theme.custom.status.red;
    case "grey":
    default:
      return theme.palette.text.disabled;
  }
}

export default EngineeringKpiCard;
