import { Box, Stack, Typography, useTheme } from "@mui/material";
import { thresholdColor } from "./thresholds.js";

const COMPONENTS = [
  { id: "availability", name: "Availability" },
  { id: "performance", name: "Performance" },
  { id: "quality", name: "Quality" },
];

/**
 * Three A/P/Q tiles at the top of the OEE drill (BRD FR-P25, FR-P26).
 * Overall OEE is intentionally NOT shown as a fourth tile (FR-P27).
 */
function OverallTiles({ overall }) {
  if (!overall) return null;
  return (
    <Stack direction="row" spacing={1.5}>
      {COMPONENTS.map((c) => (
        <Tile key={c.id} component={c} value={overall[c.id]} />
      ))}
    </Stack>
  );
}

function Tile({ component, value }) {
  const theme = useTheme();
  const color = thresholdColor(theme, component.id, value);

  return (
    <Box
      sx={{
        flex: 1,
        border: 1,
        borderColor: color,
        borderRadius: 1.25,
        backgroundColor: theme.custom.surface.soft,
        p: 1.5,
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
        sx={{ mt: 0.25 }}
      >
        <Typography
          sx={{ fontSize: 28, fontWeight: 700, color, lineHeight: 1 }}
        >
          {value.toFixed(1)}
        </Typography>
        <Typography sx={{ fontSize: 12, color: "text.disabled" }}>%</Typography>
      </Stack>
      <Typography sx={{ fontSize: 11, color: "text.disabled", mt: 0.5 }}>
        Plant average across machines
      </Typography>
    </Box>
  );
}

export default OverallTiles;
