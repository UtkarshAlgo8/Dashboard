import { Box, Tooltip, useTheme } from "@mui/material";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import { BANBURY_PARAM_RANGES } from "@/lib/mockData.js";

/**
 * Banbury process-parameter chip rendered inside each Production ID
 * row. Per BRD FR-P54 / FR-P55:
 *   - Always shows label + value + unit.
 *   - Out-of-range chips: red outline + warning icon.
 *   - Hover → tooltip with the normal range.
 */
function ParamChip({ paramKey, value }) {
  const theme = useTheme();
  const range = BANBURY_PARAM_RANGES[paramKey];
  if (!range) return null;

  const outOfRange = value < range.min || value > range.max;
  const color = outOfRange ? theme.custom.brand.red : theme.custom.text.medium;

  return (
    <Tooltip
      title={`Normal: ${range.min}–${range.max} ${range.unit}`}
      arrow
      placement="top"
    >
      <Box
        sx={{
          display: "inline-flex",
          alignItems: "center",
          gap: 0.25,
          fontSize: 11,
          fontWeight: 500,
          px: 0.75,
          py: 0.25,
          borderRadius: 1,
          border: 1,
          borderColor: outOfRange ? color : "divider",
          backgroundColor: outOfRange ? `${color}11` : "transparent",
          color,
          whiteSpace: "nowrap",
        }}
      >
        {outOfRange && <WarningAmberIcon sx={{ fontSize: 12, color }} />}
        <Box component="span" sx={{ fontWeight: 600 }}>
          {range.label}:
        </Box>
        <Box component="span">
          {value} {range.unit}
        </Box>
      </Box>
    </Tooltip>
  );
}

export default ParamChip;
