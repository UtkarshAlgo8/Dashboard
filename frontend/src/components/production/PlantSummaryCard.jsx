import { Box, Stack, Typography, useTheme } from "@mui/material";

/**
 * Plant card pinned at the bottom of the section sidebar (BRD
 * FR-P6). Large OEE value + two pill chips (Prod %, Scrap %).
 */
function PlantSummaryCard({ plant, summary }) {
  const theme = useTheme();
  if (!plant || !summary) return null;

  const prodPct = summary.prodPct;
  const scrapPct = summary.scrapPct;
  const prodColor =
    prodPct >= 90 ? theme.custom.brand.green : theme.custom.brand.amber;
  const scrapColor = theme.custom.brand.red;

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
        <Typography sx={{ fontSize: 28, fontWeight: 700, lineHeight: 1 }}>
          {plant.oe}
        </Typography>
        <Typography
          sx={{ fontSize: 12, color: "text.disabled", fontWeight: 500 }}
        >
          % OEE
        </Typography>
      </Stack>
      <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
        <Pill color={prodColor} label={`Prod: ${prodPct}%`} />
        <Pill color={scrapColor} label={`Scrap: ${scrapPct}%`} />
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
        border: 1,
        borderColor: color,
        backgroundColor: "transparent",
        px: 0.75,
        py: 0.25,
        borderRadius: 999,
      }}
    >
      {label}
    </Box>
  );
}

export default PlantSummaryCard;
