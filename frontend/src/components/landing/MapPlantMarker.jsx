import { Box, Stack, Typography } from "@mui/material";
import SettingsRoundedIcon from "@mui/icons-material/SettingsRounded";
import TrackChangesRoundedIcon from "@mui/icons-material/TrackChangesRounded";
import StarsRoundedIcon from "@mui/icons-material/StarsRounded";
import theme from "@/theme.js";

// MapLibre mounts markers in separate React roots, outside App's ThemeProvider.
const colors = theme.custom.landing;

/**
 * Format numeric percentage or return 'NA' fallback
 */
function parseNumeric(val) {
  const n = typeof val === "number" ? val : Number.parseFloat(val);
  return Number.isFinite(n) ? `${n.toFixed(1)}%` : "NA";
}

/**
 * Redesigned Map Marker matching the reference design:
 * - Always visible compact target pin: '⊙ BTP' (blue dot with white border + text)
 * - Zoom/Focus visible white card popup with 3 color-coded KPI chips:
 *   - OEE: pastel green background + ⚙ icon + green percentage
 *   - OTIF: pastel orange background + 🎯 icon + orange percentage
 *   - Yield: pastel red/pink background + ⭐ icon + red percentage
 */
function MapPlantMarker({
  plant,
  isFocused = false,
  isCardVisible = false,
  onClick,
  onMouseEnter,
}) {
  const isLive =
    plant.enabled || plant.id === "banmore" || plant.id === "chennai";
  const displayName = plant.name || `${plant.id.toUpperCase()} Tyre Plant`;

  const oeeVal = parseNumeric(plant.oee);
  const otifVal = parseNumeric(plant.otif);
  const yieldVal = parseNumeric(plant.yield);

  return (
    <Box
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        cursor: "pointer",
        userSelect: "none",
        pointerEvents: "auto",
        position: "relative",
      }}
    >
      {/* 1. Zoomed-In / Focused Metric Card Popup (Smooth Animated Entry) */}
      <Box
        sx={{
          position: "absolute",
          bottom: "100%",
          left: "50%",
          transform: isCardVisible
            ? "translateX(-50%) translateY(-8px) scale(1)"
            : "translateX(-50%) translateY(6px) scale(0.85)",
          opacity: isCardVisible ? 1 : 0,
          visibility: isCardVisible ? "visible" : "hidden",
          pointerEvents: isCardVisible ? "auto" : "none",
          transition:
            "transform 0.28s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.22s ease, visibility 0.22s",
          transformOrigin: "bottom center",
          backgroundColor: theme.palette.background.paper,
          borderRadius: "16px",
          p: "11px 14px",
          width: "270px",
          boxShadow: isFocused
            ? "0 12px 30px rgba(0, 0, 0, 0.35), 0 2px 8px rgba(0, 0, 0, 0.12)"
            : "0 6px 20px rgba(0, 0, 0, 0.22), 0 2px 6px rgba(0, 0, 0, 0.08)",
          border: "1px solid rgba(226, 232, 240, 0.8)",
          zIndex: isFocused ? 50 : 10,
        }}
      >
        {/* Header: Plant Name + Live / Phase 2 */}
        <Stack
          direction="row"
          alignItems="center"
          justifyContent="space-between"
          sx={{ mb: 1 }}
        >
          <Typography
            sx={{
              fontSize: 13.5,
              fontWeight: 600,
              color: colors.text,
              lineHeight: 1.2,
            }}
          >
            {displayName}
          </Typography>

          {isLive ? (
            <Stack direction="row" alignItems="center" spacing={0.5}>
              <Box
                sx={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  backgroundColor: colors.live,
                  boxShadow: "0 0 5px rgba(220, 38, 38, 0.6)",
                }}
              />
              <Typography
                sx={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: colors.live,
                }}
              >
                Live
              </Typography>
            </Stack>
          ) : (
            <Typography
              sx={{
                fontSize: 11,
                fontWeight: 600,
                color: colors.muted,
              }}
            >
              Phase 2
            </Typography>
          )}
        </Stack>

        {/* 3 Metric Chips Row */}
        <Stack direction="row" spacing={1} sx={{ width: "100%" }}>
          {/* OEE Chip (Pastel Green) */}
          <Box
            sx={{
              flex: 1,
              backgroundColor: theme.custom.cards.green,
              border: `1px solid ${colors.greenBorder}`,
              borderRadius: "10px",
              py: 0.75,
              px: 0.85,
              display: "flex",
              flexDirection: "column",
              gap: 0.3,
            }}
          >
            <Stack direction="row" alignItems="center" spacing={0.4}>
              <SettingsRoundedIcon
                sx={{ fontSize: 13.5, color: colors.green }}
              />
              <Typography
                sx={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: colors.body,
                }}
              >
                OEE
              </Typography>
            </Stack>
            <Typography
              sx={{
                fontSize: 13,
                fontWeight: 700,
                color: colors.green,
                lineHeight: 1.2,
              }}
            >
              {oeeVal}
            </Typography>
          </Box>

          {/* OTIF Chip (Pastel Orange) */}
          <Box
            sx={{
              flex: 1,
              backgroundColor: theme.custom.cards.amber,
              border: `1px solid ${colors.orangeBorder}`,
              borderRadius: "10px",
              py: 0.75,
              px: 0.85,
              display: "flex",
              flexDirection: "column",
              gap: 0.3,
            }}
          >
            <Stack direction="row" alignItems="center" spacing={0.4}>
              <TrackChangesRoundedIcon
                sx={{ fontSize: 13.5, color: colors.orange }}
              />
              <Typography
                sx={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: colors.body,
                }}
              >
                OTIF
              </Typography>
            </Stack>
            <Typography
              sx={{
                fontSize: 13,
                fontWeight: 700,
                color: colors.orange,
                lineHeight: 1.2,
              }}
            >
              {otifVal}
            </Typography>
          </Box>

          {/* Yield Chip (Pastel Red/Pink) */}
          <Box
            sx={{
              flex: 1,
              backgroundColor: theme.custom.cards.red,
              border: `1px solid ${colors.yieldBorder}`,
              borderRadius: "10px",
              py: 0.75,
              px: 0.85,
              display: "flex",
              flexDirection: "column",
              gap: 0.3,
            }}
          >
            <Stack direction="row" alignItems="center" spacing={0.4}>
              <StarsRoundedIcon sx={{ fontSize: 13.5, color: colors.yield }} />
              <Typography
                sx={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: colors.body,
                }}
              >
                Yield
              </Typography>
            </Stack>
            <Typography
              sx={{
                fontSize: 13,
                fontWeight: 700,
                color: colors.yield,
                lineHeight: 1.2,
              }}
            >
              {yieldVal}
            </Typography>
          </Box>
        </Stack>
      </Box>

      {/* 2. Target Dot + Label (Always Visible Base Pin) */}
      <Stack
        direction="row"
        alignItems="center"
        spacing={0.6}
        sx={{
          py: 0.2,
          px: 0.6,
          transform: isFocused ? "scale(1.15)" : "scale(1)",
          transition: "transform 0.2s ease",
        }}
      >
        <Box
          sx={{
            width: 10,
            height: 10,
            borderRadius: "50%",
            backgroundColor: colors.blue,
            border: `2px solid ${theme.palette.common.white}`,
            boxShadow: isFocused
              ? `0 0 10px ${colors.pinGlow}, 0 2px 4px rgba(0,0,0,0.8)`
              : "0 1px 4px rgba(0,0,0,0.8)",
          }}
        />
        <Typography
          sx={{
            fontSize: 12,
            fontWeight: 700,
            color: theme.palette.common.white,
            letterSpacing: "0.4px",
            textShadow: `0 1px 3px rgba(0, 0, 0, 0.95), 0 0 2px ${theme.palette.common.black}, 0 0 5px rgba(0,0,0,0.8)`,
          }}
        >
          {plant.code || plant.id.toUpperCase()}
        </Typography>
      </Stack>
    </Box>
  );
}

export default MapPlantMarker;
