import { Box, Stack, Typography } from "@mui/material";

/**
 * Legend / colour key for the trend LineChart and BarChart.
 *
 * These charts are a SINGLE series, so a series legend alone would read
 * "Actual" and explain nothing. What actually needs a key is the encoding
 * the marks carry: the best point (green), the worst point (red) and the
 * dashed target line (amber). Per the dataviz rules, a status colour is never
 * shown colour-alone — this labels each one. Text stays in ink tokens; only
 * the swatch carries the hue.
 *
 * @param {{ label: string, color: string, variant?: "fill"|"dash" }[]} items
 */
function ChartLegend({ items }) {
  if (!Array.isArray(items) || items.length === 0) return null;
  return (
    <Stack
      direction="row"
      spacing={2}
      useFlexGap
      flexWrap="wrap"
      justifyContent="center"
      sx={{ mt: 1, rowGap: 0.5 }}
    >
      {items.map((it) => (
        <Stack
          key={it.label}
          direction="row"
          spacing={0.75}
          alignItems="center"
        >
          <Swatch color={it.color} variant={it.variant ?? "fill"} />
          <Typography sx={{ fontSize: 11, color: "text.secondary" }}>
            {it.label}
          </Typography>
        </Stack>
      ))}
    </Stack>
  );
}

function Swatch({ color, variant }) {
  if (variant === "dash") {
    // A short dashed rule — mirrors the dashed target plot line.
    return (
      <Box
        sx={{
          width: 16,
          height: 0,
          borderTop: `2px dashed ${color}`,
        }}
      />
    );
  }
  return (
    <Box
      sx={{
        width: 10,
        height: 10,
        borderRadius: "2px",
        backgroundColor: color,
      }}
    />
  );
}

export default ChartLegend;
