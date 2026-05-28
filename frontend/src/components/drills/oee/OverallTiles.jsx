import { Box, Stack, Typography, useTheme } from "@mui/material";
import { thresholdColor } from "./thresholds.js";

/**
 * The three Availability / Performance / Quality cards rendered as a
 * secondary KPI row directly under the main 4 Productivity cards
 * whenever the OEE drill is open.
 *
 * Each card is sized to match a KpiCard from the main grid so the
 * two rows read as a single connected band. Captions per the
 * artifact:
 *   Availability  — "Across N <section> machines"
 *   Performance   — "Plant average for <section> section"
 *   Quality       — "FTQ · <section> section"
 *
 * Overall OEE is intentionally NOT shown as a fourth tile (BRD FR-P27).
 */
const COMPONENTS = [
  { id: "availability", name: "Availability" },
  { id: "performance", name: "Performance" },
  { id: "quality", name: "Quality" },
];

const MACHINE_LABEL = {
  Mixing: "Banbury",
  TBM: "TBM",
  Curing: "press",
  Stock: "Stock",
};

function OverallTiles({ overall, sectionName, machineCount }) {
  if (!overall) return null;
  return (
    <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
      {COMPONENTS.map((c) => (
        <Tile
          key={c.id}
          component={c}
          value={overall[c.id]}
          sectionName={sectionName}
          machineCount={machineCount}
        />
      ))}
    </Stack>
  );
}

function captionFor(componentId, sectionName, machineCount) {
  const sec = sectionName ?? "section";
  if (componentId === "availability") {
    if (machineCount != null && machineCount > 0) {
      return `Across ${machineCount} ${MACHINE_LABEL[sec] ?? sec} machines`;
    }
    return `${sec} section`;
  }
  if (componentId === "performance") return `Plant average for ${sec} section`;
  return `FTQ · ${sec} section`;
}

function Tile({ component, value, sectionName, machineCount }) {
  const theme = useTheme();
  const color = thresholdColor(theme, component.id, value);

  return (
    <Box
      sx={{
        flex: 1,
        backgroundColor: "background.paper",
        border: 1,
        borderColor: "divider",
        borderTop: `3px solid ${color}`,
        borderRadius: 1.25,
        boxShadow: theme.custom.shadow,
        p: 2,
        minWidth: 0,
      }}
    >
      <Typography
        sx={{
          fontSize: 11,
          fontWeight: 700,
          color: "text.disabled",
          textTransform: "uppercase",
          letterSpacing: 0.6,
        }}
      >
        {component.name}
      </Typography>
      <Stack
        direction="row"
        alignItems="baseline"
        spacing={0.5}
        sx={{ mt: 0.5 }}
      >
        <Typography
          sx={{ fontSize: 32, fontWeight: 700, color, lineHeight: 1 }}
        >
          {value.toFixed(1)}
        </Typography>
        <Typography sx={{ fontSize: 14, color: "text.disabled" }}>%</Typography>
      </Stack>
      <Typography sx={{ fontSize: 12, color: "text.disabled", mt: 1 }}>
        {captionFor(component.id, sectionName, machineCount)}
      </Typography>
    </Box>
  );
}

export default OverallTiles;
