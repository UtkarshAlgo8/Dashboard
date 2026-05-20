import { ToggleButton, ToggleButtonGroup } from "@mui/material";

/**
 * Mixing > Productivity sub-selector. Two-pill toggle: Master /
 * Final. Default Final per BRD FR-P11.
 */
function CompoundSubSelector({ value, onChange }) {
  return (
    <ToggleButtonGroup
      size="small"
      value={value}
      exclusive
      onChange={(_, next) => {
        if (next) onChange(next);
      }}
      sx={{
        "& .MuiToggleButton-root": {
          px: 2,
          py: 0.5,
          fontSize: 12,
          textTransform: "none",
          fontWeight: 600,
        },
      }}
    >
      <ToggleButton value="master">Master Compound</ToggleButton>
      <ToggleButton value="final">Final Compound</ToggleButton>
    </ToggleButtonGroup>
  );
}

export default CompoundSubSelector;
