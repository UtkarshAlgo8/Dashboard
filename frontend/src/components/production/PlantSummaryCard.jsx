import { Box, Stack, Typography, useTheme } from "@mui/material";

/**
 * Plant card pinned at the bottom of the section sidebar (BRD FR-P6).
 * Shows the rolled-up plant OEE plus FTQ / Scrap / Safe pills.
 */
function PlantSummaryCard({ plant, summary }) {
  const theme = useTheme();
  if (!plant || !summary) return null;

  const oee = plant.oe;
  const oeeColor =
    oee >= 90
      ? theme.custom.brand.green
      : oee >= 85
        ? theme.custom.brand.amber
        : theme.custom.brand.red;

  const ftqColor =
    summary.ftqPct >= 95 ? theme.custom.brand.green : theme.custom.brand.amber;
  const scrapColor = theme.custom.brand.red;
  const safeColor = theme.custom.brand.green;

  return (
    <Box
      sx={{
        backgroundColor: "background.paper",
        border: 1,
        borderColor: "divider",
        borderRadius: 1.25,
        p: 1.5,
        boxShadow: theme.custom.shadow,
      }}
    >
      <Typography
        sx={{
          fontSize: 10,
          color: "text.disabled",
          textTransform: "uppercase",
          letterSpacing: 0.7,
          fontWeight: 700,
          mb: 0.25,
        }}
      >
        {plant.name}
      </Typography>
      <Stack direction="row" alignItems="baseline" spacing={0.5} sx={{ mb: 1 }}>
        <Typography
          sx={{ fontSize: 28, fontWeight: 700, lineHeight: 1, color: oeeColor }}
        >
          {oee}%
        </Typography>
        <Typography
          sx={{ fontSize: 12, color: "text.disabled", fontWeight: 500 }}
        >
          OEE
        </Typography>
      </Stack>
      <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
        {typeof summary.ftqPct === "number" && (
          <Pill color={ftqColor} label={`FTQ: ${summary.ftqPct}%`} />
        )}
        {typeof summary.scrapPct === "number" && (
          <Pill color={scrapColor} label={`Scrap: ${summary.scrapPct}%`} />
        )}
        {typeof summary.safeDays === "number" && (
          <Pill color={safeColor} label={`Safe: ${summary.safeDays}d`} />
        )}
      </Stack>
    </Box>
  );
}

function Pill({ color, label }) {
  return (
    <Box
      sx={{
        fontSize: 11,
        fontWeight: 700,
        color,
        backgroundColor: `${color}18`,
        px: 0.75,
        py: 0.25,
        borderRadius: 0.5,
      }}
    >
      {label}
    </Box>
  );
}

export default PlantSummaryCard;
