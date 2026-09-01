import { Box, Stack, Typography, useTheme } from "@mui/material";
import SettingsIcon from "@mui/icons-material/Settings";
import JKLoader from "@/components/JKLoader.jsx";

/**
 * Adobe XD Plant OEE card pinned at the bottom of the left sidebar.
 * Soft amber card background with gear icon and bold 92.0% metric.
 */
function PlantSummaryCard({ plant, summary, loading = false }) {
  const theme = useTheme();
  if (!plant && !summary && !loading) return null;

  if (loading) {
    return (
      <Box
        sx={{
          backgroundColor: theme.custom.cards.amber,
          borderRadius: 2,
          p: 1.75,
          border: 1,
          borderColor: "divider",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: 88,
        }}
      >
        <JKLoader />
      </Box>
    );
  }

  const oeeNum = toNum(
    summary?.oeeP?.value ?? plant?.oee ?? summary?.oee?.value,
  );
  const oee = oeeNum == null ? null : Math.round(oeeNum * 10) / 10;
  const ftq = toNum(summary?.ftqPct);
  const scrap = toNum(summary?.scrapPct);
  const safeDays = toNum(summary?.safeDays);
  const ftqColor =
    ftq == null || ftq >= 95
      ? theme.custom.status.green
      : theme.custom.status.amber;
  const scrapColor = theme.custom.status.red;
  const safeColor = theme.custom.status.green;

  return (
    <Box
      sx={{
        backgroundColor: theme.custom.cards.amber,
        border: 1,
        borderColor: `${theme.custom.status.amber}30`,
        borderRadius: 2.5,
        p: 2.5,
        boxShadow: theme.custom.floatingShadow,
      }}
    >
      {/* Header: Amber Gear Icon + Plant OEE title */}
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1.5 }}>
        <SettingsIcon
          sx={{ fontSize: 22, color: theme.custom.status.amber }}
        />
        <Typography
          sx={{
            fontSize: 15,
            fontWeight: 700,
            color: "text.primary",
            textTransform: "uppercase",
            letterSpacing: 0.5,
          }}
        >
          Plant OEE
        </Typography>
      </Stack>

      {/* Main Metric */}
      <Typography
        sx={{
          fontSize: 34,
          fontWeight: 800,
          color: theme.custom.status.amber,
          lineHeight: 1,
        }}
      >
        {oee == null ? "–" : `${oee.toFixed(1)}%`}
      </Typography>
      <Stack
        direction="row"
        spacing={0.75}
        flexWrap="wrap"
        useFlexGap
        sx={{ mt: 1.5 }}
      >
        {ftq != null && <Pill color={ftqColor} label={`FTQ: ${ftq}%`} />}
        {scrap != null && (
          <Pill color={scrapColor} label={`Scrap: ${scrap}%`} />
        )}
        {safeDays != null && (
          <Pill color={safeColor} label={`Safe: ${safeDays}d`} />
        )}
      </Stack>
    </Box>
  );
}

function toNum(v) {
  if (v == null || v === "" || v === "nan" || v === "null") return null;
  const n = typeof v === "number" ? v : Number.parseFloat(v);
  return Number.isFinite(n) ? n : null;
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
