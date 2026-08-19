import { useRef } from "react";
import { Box, Stack, Typography, useTheme } from "@mui/material";
import CardDownloadButton from "@/components/CardDownloadButton.jsx";

const H = 130;
const PAD = { top: 20, bottom: 40 };

/**
 * Single inventory chart card. Renders one Today/Yesterday bar pair
 * per bar group. Selected bar is highlighted (background +
 * accent label) per BRD FR-P64.
 */
function InventoryBarChart({ title, bars, selectedBarId, onBarClick }) {
  const theme = useTheme();
  const cardRef = useRef(null);
  const maxValue = Math.max(...bars.flatMap((b) => [b.today, b.yesterday]));

  return (
    <Box
      ref={cardRef}
      sx={{
        position: "relative",
        backgroundColor: "background.paper",
        border: 1,
        borderColor: "divider",
        borderRadius: 1.25,
        p: 2,
        boxShadow: theme.custom.shadow,
        display: "flex",
        flexDirection: "column",
        gap: 1.5,
      }}
    >
      <Stack direction="row" alignItems="center" justifyContent="space-between">
        <Typography sx={{ fontSize: 13, fontWeight: 700 }}>{title}</Typography>
        <Stack direction="row" alignItems="center" spacing={1.5}>
          <Stack direction="row" spacing={1.5} alignItems="center">
            <LegendDot color={theme.palette.primary.main} label="Today" />
            <LegendDot color={theme.palette.text.disabled} label="Yesterday" />
          </Stack>
          {/* Top-right download — menu offers PDF (visual) + Excel (bar values). */}
          <CardDownloadButton
            cardRef={cardRef}
            rows={bars.map((b) => ({
              Item: b.label,
              Today: b.today,
              Yesterday: b.yesterday,
              "Max (today/yesterday)": maxValue,
            }))}
            headers={["Item", "Today", "Yesterday", "Max (today/yesterday)"]}
            filename={`inventory-bar-${(title ?? "chart").toLowerCase().replace(/\s+/g, "-")}`}
            sheetName="InventoryBar"
          />
        </Stack>
      </Stack>

      <Box sx={{ overflowX: "auto" }}>
        <Box
          sx={{
            display: "flex",
            gap: 1,
            alignItems: "flex-end",
            height: H,
            minWidth: bars.length * 64,
          }}
        >
          {bars.map((bar) => (
            <BarGroup
              key={bar.id}
              bar={bar}
              max={maxValue}
              selected={selectedBarId === bar.id}
              onClick={() => onBarClick(bar.id)}
            />
          ))}
        </Box>
      </Box>
    </Box>
  );
}

function BarGroup({ bar, max, selected, onClick }) {
  const theme = useTheme();
  const innerH = H - PAD.top - PAD.bottom;
  const todayH = max ? (bar.today / max) * innerH : 0;
  const yesterdayH = max ? (bar.yesterday / max) * innerH : 0;
  const accent = theme.palette.primary.main;
  const muted = theme.palette.text.disabled;

  return (
    <Box
      onClick={onClick}
      sx={{
        flex: 1,
        minWidth: 56,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        cursor: "pointer",
        backgroundColor: selected
          ? theme.custom.brand.orangeSoft
          : "transparent",
        borderRadius: 1,
        py: 0.5,
        transition: "background-color 0.15s",
        "&:hover": {
          backgroundColor: selected
            ? theme.custom.brand.orangeSoft
            : theme.custom.surface.soft,
        },
      }}
    >
      <Typography
        sx={{
          fontSize: 11,
          fontWeight: 600,
          color: selected ? accent : "text.primary",
          mb: 0.25,
        }}
      >
        {bar.today}
      </Typography>
      <Stack
        direction="row"
        spacing={0.5}
        alignItems="flex-end"
        sx={{ height: innerH }}
      >
        <Box
          sx={{
            width: 14,
            height: Math.max(todayH, 2),
            backgroundColor: accent,
            borderRadius: "2px 2px 0 0",
            opacity: 0.95,
          }}
        />
        <Box
          sx={{
            width: 14,
            height: Math.max(yesterdayH, 2),
            backgroundColor: muted,
            opacity: 0.4,
            borderRadius: "2px 2px 0 0",
          }}
        />
      </Stack>
      <Typography
        sx={{
          fontSize: 11,
          fontWeight: selected ? 700 : 500,
          color: selected ? accent : "text.secondary",
          mt: 0.75,
          textAlign: "center",
          lineHeight: 1.1,
        }}
      >
        {bar.label}
      </Typography>
    </Box>
  );
}

function LegendDot({ color, label }) {
  return (
    <Stack direction="row" spacing={0.5} alignItems="center">
      <Box
        sx={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          backgroundColor: color,
          opacity: label === "Yesterday" ? 0.4 : 1,
        }}
      />
      <Typography sx={{ fontSize: 11, color: "text.disabled" }}>
        {label}
      </Typography>
    </Stack>
  );
}

export default InventoryBarChart;
