import { ToggleButton, ToggleButtonGroup } from "@mui/material";

/**
 * Stock-section sub-selector (BRD FR-P17, FR-P18). Five pills:
 * 4 Roll / Extruder / 3 Roll / Cutter / Slitter. Default "4roll".
 * Phase 1 only fills 4 Roll with real KPI data; others show the
 * empty state.
 */
const SUB_SELECTORS = [
  { id: "4roll", label: "4 Roll" },
  { id: "extruder", label: "Extruder" },
  { id: "3roll", label: "3 Roll" },
  { id: "cutter", label: "Cutter" },
  { id: "slitter", label: "Slitter" },
];

function StockSubSelector({ value, onChange }) {
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
          px: 1.5,
          py: 0.5,
          fontSize: 12,
          textTransform: "none",
          fontWeight: 600,
        },
      }}
    >
      {SUB_SELECTORS.map((s) => (
        <ToggleButton key={s.id} value={s.id}>
          {s.label}
        </ToggleButton>
      ))}
    </ToggleButtonGroup>
  );
}

export default StockSubSelector;
