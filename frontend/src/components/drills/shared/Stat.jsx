import { Stack, Typography } from "@mui/material";

/**
 * Stat label + value pair — matches artifact budget drill.
 */
export function Stat({ label, value, accent }) {
  return (
    <Stack spacing={0.25}>
      <Typography sx={{ fontSize: 11, color: "text.disabled" }}>
        {label}
      </Typography>
      <Typography
        sx={{
          fontSize: 19,
          fontWeight: 700,
          color: accent === "amber" ? "warning.main" : "text.primary",
        }}
      >
        {value}
      </Typography>
    </Stack>
  );
}
