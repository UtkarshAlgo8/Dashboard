import { Stack, Typography } from "@mui/material";
import FunctionTile from "./FunctionTile.jsx";

/**
 * Horizontal strip of function tiles. Appears beneath the plant
 * cards once a plant is selected (BRD FR-L13). Only the
 * Production tile is active in Phase 1 (Q-NAV-01).
 */
function FunctionTileStrip({
  functions,
  selectedPlant,
  activeFunctionIds,
  onSelect,
}) {
  return (
    <Stack spacing={1.5}>
      <Typography
        sx={{
          fontSize: 11,
          color: "text.disabled",
          textTransform: "uppercase",
          letterSpacing: 0.8,
          fontWeight: 600,
        }}
      >
        {selectedPlant.name} — choose a function
      </Typography>
      <Stack direction="row" spacing={1.25} flexWrap="wrap" useFlexGap>
        {functions.map((fn) => (
          <FunctionTile
            key={fn.id}
            fn={fn}
            active={activeFunctionIds.has(fn.id)}
            onClick={() => onSelect(fn)}
          />
        ))}
      </Stack>
    </Stack>
  );
}

export default FunctionTileStrip;
