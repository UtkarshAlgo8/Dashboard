import { Box, Stack, Typography, useTheme } from "@mui/material";

/**
 * Multi-select pill row for the Trend modal's COMPARE / OVERLAY rows.
 *
 * Mirrors the screenshot look (rounded outlined chips, selected items
 * get a coloured ring) without leaning on `ToggleButtonGroup`, because
 * ToggleButtonGroup flips its own background on click and reads as a
 * "filled" pill — the Trend row wants the ring style. Kept local to
 * `trend/` until a second consumer appears (per conventions.md, new
 * primitives go to `frontend-common-components/` upstream).
 *
 * Props:
 *   label   - row caption (uppercase, muted)
 *   options - [{ value, label }]
 *   value   - string[] of selected values
 *   onChange(next: string[])
 *
 * `disabled` is computed from `options` (empty options → row hidden)
 * so the caller doesn't need to wire that.
 */
function MultiSelectPills({ label, options, value, onChange }) {
  const theme = useTheme();
  const selected = new Set(value ?? []);

  if (!Array.isArray(options) || options.length === 0) return null;

  const toggle = (v) => {
    const next = new Set(selected);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    onChange([...next]);
  };

  return (
    <Stack
      direction="row"
      alignItems="center"
      spacing={1.5}
      sx={{ flexWrap: "wrap" }}
    >
      <Typography
        sx={{
          fontSize: 11,
          fontWeight: 700,
          color: "text.disabled",
          textTransform: "uppercase",
          letterSpacing: 0.6,
          minWidth: 76,
        }}
      >
        {label}
      </Typography>
      <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap" }}>
        {options.map((opt) => {
          const isOn = selected.has(opt.value);
          const ring = isOn ? theme.custom.brand.green : theme.palette.divider;
          const text = isOn
            ? theme.palette.text.primary
            : theme.palette.text.secondary;
          return (
            <Box
              key={opt.value}
              component="button"
              type="button"
              onClick={() => toggle(opt.value)}
              sx={{
                border: 1.25,
                borderColor: ring,
                borderRadius: 1,
                px: 1.25,
                py: 0.4,
                fontSize: 12,
                fontWeight: 600,
                color: text,
                background: "transparent",
                cursor: "pointer",
                fontFamily: "inherit",
                // No layout shift on focus ring.
                "&:hover": {
                  borderColor: isOn
                    ? theme.custom.brand.green
                    : theme.custom.brand.orange,
                },
                "&:focus-visible": {
                  outline: `2px solid ${theme.custom.brand.orange}`,
                  outlineOffset: 1,
                },
              }}
            >
              {opt.label}
            </Box>
          );
        })}
      </Stack>
    </Stack>
  );
}

export default MultiSelectPills;
