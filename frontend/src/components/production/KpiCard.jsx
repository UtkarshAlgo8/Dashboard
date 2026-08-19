import { useRef } from "react";
import {
  Box,
  IconButton,
  Stack,
  Tooltip,
  Typography,
  useTheme,
} from "@mui/material";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import KeyboardArrowUpIcon from "@mui/icons-material/KeyboardArrowUp";
import ShowChartIcon from "@mui/icons-material/ShowChart";
import Sparkline from "./Sparkline.jsx";
import CardDownloadButton from "@/components/CardDownloadButton.jsx";

/**
 * KPI card — CR-08 update.
 *
 * New interface (replaces FR-P19/FR-P20 toggle-based drill):
 *   onClick(kpi)  — fires on card body click; parent decides whether
 *                   to trigger drill based on kpi.drillable + drillDown.
 *   isDrilling     — styled open state for the drill root card.
 *   onCloseDrill   — called when the close icon is clicked; resets drill.
 */
function KpiCard({ kpi, isDrilling, onClick, onTrendOpen, onCloseDrill }) {
  const theme = useTheme();
  const cardRef = useRef(null);
  const sparkColor = kpi.trendFavourable
    ? theme.custom.brand.green
    : theme.custom.brand.red;
  const trendColor = kpi.trendFavourable
    ? theme.custom.brand.green
    : theme.custom.brand.red;
  const trendUp = kpi.trend > 0;

  return (
    <Box
      ref={cardRef}
      onClick={() => onClick(kpi)}
      sx={{
        position: "relative",
        backgroundColor: "background.paper",
        border: 1,
        borderColor: isDrilling ? "primary.main" : "divider",
        borderRadius: 1.25,
        p: 1.5,
        // Fixed height so cards don't change size based on whether the
        // trend footer is present, and so the skeleton ↔ card swap doesn't
        // jump. Must match KpiCardSkeleton's minHeight.
        minHeight: 104,
        cursor: kpi.drillable ? "pointer" : "default",
        transition: "border-color 0.15s, box-shadow 0.15s",
        boxShadow: isDrilling ? theme.custom.shadow : "none",
        // Allow the card to shrink past its content's intrinsic width
        // when in a grid track — otherwise a sparkline or long label
        // can keep the column wider than the grid's 1fr share, pushing
        // the 4th card to the next row.
        minWidth: 0,
        "&:hover": kpi.drillable
          ? { boxShadow: theme.custom.shadow }
          : undefined,
      }}
    >
      {/* Header row */}
      <Stack direction="row" alignItems="center" justifyContent="space-between">
        <Stack direction="row" spacing={0.75} alignItems="center">
          {/* Top-left download — captures the card visually as PDF. */}
          <CardDownloadButton
            cardRef={cardRef}
            filename={`kpi-${(kpi.name ?? "card").toLowerCase().replace(/\s+/g, "-")}`}
            sx={{ position: "absolute", top: 4, left: 4 }}
          />
          <Typography
            sx={{
              fontSize: 11,
              fontWeight: 700,
              color: "text.disabled",
              textTransform: "uppercase",
              letterSpacing: 0.6,
              pl: 3, // leave room for the absolute download icon
            }}
          >
            {kpi.name}
          </Typography>
        </Stack>
        <Stack direction="row" spacing={0.75} alignItems="center">
          <Tooltip title="Trend" arrow>
            <IconButton
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                onTrendOpen(kpi.id);
              }}
              sx={{
                width: 22,
                height: 22,
                border: 1,
                borderColor: "divider",
                borderRadius: 1,
                color: "text.secondary",
                "&:hover": {
                  borderColor: "primary.main",
                  color: "primary.main",
                  backgroundColor: theme.custom.surface.soft,
                },
              }}
            >
              <ShowChartIcon sx={{ fontSize: 14 }} />
            </IconButton>
          </Tooltip>
          {isDrilling ? (
            <Tooltip title="Close drill" arrow>
              {/* Same 22×22 footprint as the expand button so toggling the
                  drill never resizes the header (no UI jump). */}
              <Box
                onClick={(e) => {
                  e.stopPropagation();
                  onCloseDrill();
                }}
                sx={{
                  width: 22,
                  height: 22,
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  backgroundColor: `${theme.custom.brand.orange}1f`,
                  color: "primary.main",
                }}
              >
                {/* Drill is open — the chevron points UP (collapse). */}
                <KeyboardArrowUpIcon sx={{ fontSize: 18 }} />
              </Box>
            </Tooltip>
          ) : kpi.drillable ? (
            <Tooltip title="Drill down" arrow>
              <Box
                sx={{
                  width: 22,
                  height: 22,
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  backgroundColor: `${theme.custom.brand.orange}1f`,
                  color: "primary.main",
                }}
              >
                {/* Closed — the chevron points DOWN (drill down). */}
                <KeyboardArrowUpIcon
                  sx={{ fontSize: 18, transform: "rotate(180deg)" }}
                />
              </Box>
            </Tooltip>
          ) : null}
        </Stack>
      </Stack>

      {/* Body row */}
      <Stack
        direction="row"
        alignItems="flex-end"
        justifyContent="space-between"
        sx={{ mt: 0.5 }}
      >
        <Stack direction="row" alignItems="baseline" spacing={0.5}>
          <Typography sx={{ fontSize: 28, fontWeight: 700, lineHeight: 1 }}>
            {kpi.value}
          </Typography>
          <Typography
            sx={{ fontSize: 12, color: "text.disabled", fontWeight: 500 }}
          >
            {kpi.unit}
          </Typography>
        </Stack>
        <Sparkline data={kpi.spark} color={sparkColor} />
      </Stack>

      {/* Footer row: spike %. new_change.md C18 display rules — a missing
          or zero baseline renders NOTHING here (the transformer sends
          trend = null), never "0 %", "∞" or "−100 %". The baseline period
          is named in the row and repeated on hover so the comparison is
          auditable. */}
      {kpi.trend !== null && kpi.trend !== undefined && (
        <Tooltip title={kpi.trendBaseline ?? "vs the previous period"} arrow>
          <Stack
            direction="row"
            alignItems="center"
            spacing={0.25}
            sx={{ mt: 0.75 }}
          >
            {trendUp ? (
              <ArrowUpwardIcon sx={{ fontSize: 12, color: trendColor }} />
            ) : (
              <ArrowDownwardIcon sx={{ fontSize: 12, color: trendColor }} />
            )}
            <Typography
              sx={{ fontSize: 12, fontWeight: 600, color: trendColor }}
            >
              {Math.abs(kpi.trend).toFixed(1)}%
            </Typography>
            <Typography sx={{ fontSize: 11, color: "text.disabled" }}>
              {kpi.trendBaseline ?? "vs prev"}
            </Typography>
          </Stack>
        </Tooltip>
      )}

      {/* new_change.md C14 / spike defect S-3: the day is still running, so
          the spike is suppressed rather than showing the ~−75 % artefact a
          part-day-vs-full-day comparison produces. */}
      {kpi.partialDay && (
        <Tooltip
          title="This day is still in progress — one or more shifts have no row yet, so a comparison against the previous full day would be an artefact."
          arrow
        >
          <Typography
            sx={{
              mt: 0.75,
              fontSize: 11,
              fontWeight: 600,
              color: "warning.main",
            }}
          >
            in progress · partial day
          </Typography>
        </Tooltip>
      )}

      {/* new_change.md C10: the row cap was hit, so this total is INCOMPLETE
          — never present it as if it were final. */}
      {kpi.truncated && (
        <Tooltip
          title="The row cap was reached for this window, so the oldest days are missing from this total. Narrow the date range for a complete figure."
          arrow
        >
          <Typography
            sx={{
              mt: 0.75,
              fontSize: 11,
              fontWeight: 600,
              color: "error.main",
            }}
          >
            partial data — range too wide
          </Typography>
        </Tooltip>
      )}
    </Box>
  );
}

export default KpiCard;
