import { ToggleButton, ToggleButtonGroup } from "@mui/material";

/**
 * Stock-section sub-selector (BRD §13.2). Five pills:
 * 4 Roll / Extruder / 3 Roll / Cutter / Slitter. Selecting one filters
 * every KPI tab to that sub-section. The `value`/`onChange` use the gold
 * `sub_section` values verbatim so they pass straight into the query
 * context with no id↔value mapping.
 */
const SUB_SELECTORS = [
  { id: "4 Roll", label: "4 Roll" },
  { id: "Extruder", label: "Extruder" },
  { id: "3 Roll", label: "3 Roll" },
  { id: "Cutter", label: "Cutter" },
  { id: "Slitter", label: "Slitter" },
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
