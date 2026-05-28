import { Box, Stack, Typography, useTheme } from "@mui/material";
import { thresholdColor } from "./thresholds.js";

/**
 * Availability / Performance / Quality sub-cards rendered as a
 * secondary band directly under the main 4 Productivity KPI cards
 * whenever the OEE drill is open.
 *
 * Visually distinct from the main KPI row:
 *   - softer (surface.soft) background so they don't compete for
 *     attention with the primary cards
 *   - 3-px coloured top stripe (per-component threshold colour)
 *   - smaller number than the main cards (28-px vs 32-px), to read
 *     as a sub-tier inside the OEE breakdown
 *
 * Captions per the artifact:
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
    <Box>
      <Typography
        sx={{
          fontSize: 11,
          fontWeight: 700,
          color: "text.disabled",
          textTransform: "uppercase",
          letterSpacing: 0.6,
          mb: 1,
        }}
      >
        OEE components
      </Typography>
      <Box
        sx={{
          display: "grid",
          gap: 2,
          gridTemplateColumns: { xs: "1fr", sm: "repeat(3, 1fr)" },
        }}
      >
        {COMPONENTS.map((c) => (
          <Tile
            key={c.id}
            component={c}
            value={overall[c.id]}
            sectionName={sectionName}
            machineCount={machineCount}
          />
        ))}
      </Box>
    </Box>
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
        backgroundColor: theme.custom.surface.soft,
        border: 1,
        borderColor: "divider",
        borderTop: `3px solid ${color}`,
        borderRadius: 1.25,
        p: 1.75,
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
          sx={{ fontSize: 28, fontWeight: 700, color, lineHeight: 1 }}
        >
          {value.toFixed(1)}
        </Typography>
        <Typography sx={{ fontSize: 13, color: "text.disabled" }}>%</Typography>
      </Stack>
      <Typography sx={{ fontSize: 12, color: "text.disabled", mt: 0.75 }}>
        {captionFor(component.id, sectionName, machineCount)}
      </Typography>
    </Box>
  );
}

export default OverallTiles;
