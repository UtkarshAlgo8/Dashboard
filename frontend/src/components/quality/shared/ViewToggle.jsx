/**
 * "View by" toggle above a drill table. Same MUI pattern as the Production
 * drills (label + small exclusive ToggleButtonGroup).
 * @param {{ options: { value: string, label: string }[], value: string,
 *   onChange: (value: string) => void, label?: string, sx?: object }} props
 */
import {
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";

export function ViewToggle({
  options,
  value,
  onChange,
  label = "View by",
  sx,
}) {
  return (
    <Stack
      direction="row"
      alignItems="center"
      spacing={1}
      useFlexGap
      flexWrap="wrap"
      sx={sx}
    >
      <Typography
        sx={{
          fontSize: 11.5,
          fontWeight: 700,
          color: "text.secondary",
          textTransform: "uppercase",
          letterSpacing: 0.5,
        }}
      >
        {label}
      </Typography>
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
            py: 0.25,
            fontSize: 12,
            textTransform: "none",
            fontWeight: 500,
          },
        }}
      >
        {options.map((opt) => (
          <ToggleButton key={opt.value} value={opt.value}>
            {opt.label}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>
    </Stack>
  );
}
