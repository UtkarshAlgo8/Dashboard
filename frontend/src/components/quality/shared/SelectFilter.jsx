/**
 * Single-choice filter with an "All" entry (value "All"). Same MUI style as
 * the BTP SPC alerts severity filter.
 * @param {{ options: string[], value: string, onChange: (v: string) => void,
 *   allLabel?: string, label?: string, ariaLabel?: string, sx?: object }} props
 */
import { MenuItem, Select, Stack, Typography } from "@mui/material";

export function SelectFilter({
  options,
  value,
  onChange,
  allLabel = "All",
  label,
  ariaLabel,
  sx,
}) {
  return (
    <Stack direction="row" spacing={1} alignItems="center" sx={sx}>
      {label && (
        <Typography
          sx={{ fontSize: 12, fontWeight: 600, color: "text.secondary" }}
        >
          {label}
        </Typography>
      )}
      <Select
        size="small"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        inputProps={{ "aria-label": ariaLabel ?? label }}
        sx={{ minWidth: 150, height: 36, fontSize: 13 }}
      >
        <MenuItem value="All">{allLabel}</MenuItem>
        {options.map((o) => (
          <MenuItem key={o} value={o}>
            {o}
          </MenuItem>
        ))}
      </Select>
    </Stack>
  );
}
