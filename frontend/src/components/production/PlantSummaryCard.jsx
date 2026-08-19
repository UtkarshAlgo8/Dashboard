import { useRef } from "react";
import { Box, Stack, Typography, useTheme } from "@mui/material";
import JKLoader from "@/components/JKLoader.jsx";
import CardDownloadButton from "@/components/CardDownloadButton.jsx";

/**
 * Plant card pinned at the bottom of the section sidebar (BRD FR-P6).
 * Shows the rolled-up plant OEE plus FTQ / Scrap / Safe pills. While the
 * summary refetches (e.g. a month change) the body is replaced by a loader.
 */
function PlantSummaryCard({ plant, summary, loading = false }) {
  const theme = useTheme();
  const cardRef = useRef(null);
  if (!plant || (!summary && !loading)) return null;

  if (loading) {
    return (
      <Box
        sx={{
          backgroundColor: "background.paper",
          border: 1,
          borderColor: "divider",
          borderRadius: 1.25,
          p: 1.5,
          boxShadow: theme.custom.shadow,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: 96,
        }}
      >
        <JKLoader />
      </Box>
    );
  }

  // Headline is the plant-level OEE_p (real backend), falling back to the
  // mock plant.oee, then the plant-level OEE_o, so the card renders in every
  // data mode. "–" when no plant OEE is available.
  const oeeRaw =
    summary?.oeeP?.value ?? plant.oee ?? summary?.oee?.value ?? null;
  const oeeNum = toNum(oeeRaw);
  const oee = oeeNum == null ? null : Math.round(oeeNum * 10) / 10;
  const oeeColor =
    oee == null
      ? theme.custom.text.muted
      : oee >= 90
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
      ref={cardRef}
      sx={{
        position: "relative",
        backgroundColor: "background.paper",
        border: 1,
        borderColor: "divider",
        borderRadius: 1.25,
        p: 1.5,
        boxShadow: theme.custom.shadow,
      }}
    >
      {/* Top-left download — captures the rolled-up plant card as PDF. */}
      <CardDownloadButton
        cardRef={cardRef}
        filename={`plant-summary-${(plant.name ?? "plant").toLowerCase().replace(/\s+/g, "-")}`}
        sx={{ position: "absolute", top: 4, left: 4 }}
      />
      <Typography
        sx={{
          pl: 3, // leave room for the absolute download icon
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
          {oee == null ? "–" : `${oee}%`}
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

/** Athena serializes measures as strings; coerce to number|null. */
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
