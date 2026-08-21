import { Box, Stack, Typography } from "@mui/material";
import LocationOnRoundedIcon from "@mui/icons-material/LocationOnRounded";

/**
 * High-Tech Map Marker with Radar Pulses & Floating HUD Glass Label
 * Features:
 * - Concentric glowing radar waves rippling from the plant GPS base
 * - Aerospace-style Heads Up Display (HUD) glassmorphic card with cyan/red accents
 * - Live mini beacon indicator & authentic KPI metrics (OEE, OTIF, YIELD)
 * - Smooth hover micro-interactions and depth shadows
 */
function MapPlantMarker({
  plant,
  isFocused = false,
  onClick,
  onMouseEnter,
}) {
  const isLeft = plant.badgeSide === "left";
  const hasOee = plant.oee != null && Number.isFinite(Number(plant.oee));
  const isLive = plant.id === "banmore" || plant.id === "chennai";

  return (
    <Box
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      sx={{
        display: "flex",
        flexDirection: isLeft ? "row-reverse" : "row",
        alignItems: "center",
        gap: 1.2,
        cursor: "pointer",
        userSelect: "none",
        pointerEvents: "auto",
        transform: isFocused ? "scale(1.12) translateY(-6px)" : "scale(1)",
        transition: "all 0.28s cubic-bezier(0.34, 1.56, 0.64, 1)",
      }}
    >
      {/* Pin with Concentric Radar Wave Rings */}
      <Box
        sx={{
          position: "relative",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 40,
          height: 40,
        }}
      >
        {/* Radar Wave 1 */}
        <Box
          sx={{
            position: "absolute",
            bottom: "4px",
            left: "50%",
            width: isFocused ? 44 : 32,
            height: isFocused ? 44 : 32,
            borderRadius: "50%",
            border: `1.5px solid ${isFocused ? "rgba(239, 68, 68, 0.9)" : "rgba(0, 210, 255, 0.75)"}`,
            background: isFocused
              ? "rgba(239, 68, 68, 0.18)"
              : "rgba(0, 210, 255, 0.12)",
            transform: "translate(-50%, 50%)",
            animation: "radarPing 2.4s cubic-bezier(0, 0.2, 0.8, 1) infinite",
            pointerEvents: "none",
            "@keyframes radarPing": {
              "0%": {
                transform: "translate(-50%, 50%) scale(0.3)",
                opacity: 1,
              },
              "75%": {
                transform: "translate(-50%, 50%) scale(1.6)",
                opacity: 0.15,
              },
              "100%": {
                transform: "translate(-50%, 50%) scale(2.0)",
                opacity: 0,
              },
            },
          }}
        />

        {/* Radar Wave 2 (delayed phase) */}
        <Box
          sx={{
            position: "absolute",
            bottom: "4px",
            left: "50%",
            width: isFocused ? 44 : 32,
            height: isFocused ? 44 : 32,
            borderRadius: "50%",
            border: `1.5px solid ${isFocused ? "rgba(239, 68, 68, 0.6)" : "rgba(0, 210, 255, 0.5)"}`,
            transform: "translate(-50%, 50%)",
            animation: "radarPing 2.4s cubic-bezier(0, 0.2, 0.8, 1) infinite 1.2s",
            pointerEvents: "none",
          }}
        />

        {/* Main Location Pin Icon */}
        <Box
          sx={{
            position: "relative",
            zIndex: 2,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: isFocused ? "#EF4444" : "#EA4335",
            transition: "all 0.25s ease",
            "& .MuiSvgIcon-root": {
              fontSize: isFocused ? 44 : 38,
              filter: isFocused
                ? "drop-shadow(0 0 14px rgba(239, 68, 68, 0.85)) drop-shadow(0 4px 6px rgba(0,0,0,0.7))"
                : "drop-shadow(0 0 8px rgba(0, 200, 255, 0.4)) drop-shadow(0 2px 5px rgba(0,0,0,0.6))",
            },
          }}
        >
          <LocationOnRoundedIcon />
        </Box>
      </Box>

      {/* Floating HUD Glass Info Badge */}
      <Box
        sx={{
          backgroundColor: isFocused
            ? "rgba(10, 18, 38, 0.94)"
            : "rgba(15, 23, 42, 0.88)",
          backdropFilter: "blur(14px)",
          WebkitBackdropFilter: "blur(14px)",
          border: "1px solid",
          borderColor: isFocused
            ? "rgba(239, 68, 68, 0.75)"
            : "rgba(0, 180, 255, 0.38)",
          borderRadius: "10px",
          px: 1.4,
          py: 0.85,
          display: "flex",
          flexDirection: "column",
          gap: 0.4,
          minWidth: "135px",
          boxShadow: isFocused
            ? "0 0 24px rgba(239, 68, 68, 0.35), 0 8px 24px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.15)"
            : "0 0 16px rgba(0, 160, 255, 0.18), 0 6px 18px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.1)",
          transition: "all 0.25s ease",
          position: "relative",
          overflow: "hidden",
          /* Specular HUD top border tick */
          "&::before": {
            content: '""',
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: "1.5px",
            background: isFocused
              ? "linear-gradient(90deg, transparent 0%, #EF4444 50%, transparent 100%)"
              : "linear-gradient(90deg, transparent 0%, #38BDF8 50%, transparent 100%)",
          },
        }}
      >
        {/* Header Row: Plant Code + Live Beacon */}
        <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
          <Typography
            sx={{
              fontSize: 13,
              fontWeight: 800,
              color: isFocused ? "#FF6B6B" : "#38BDF8",
              letterSpacing: "0.6px",
              lineHeight: 1.2,
            }}
          >
            {plant.code || plant.id.toUpperCase()}
          </Typography>

          {/* Live Mini Beacon / Phase 2 */}
          {isLive ? (
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 0.5,
              }}
            >
              <Box
                sx={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  backgroundColor: "#22C55E",
                  boxShadow: "0 0 6px #22C55E",
                  animation: "pulseBeacon 1.8s infinite",
                  "@keyframes pulseBeacon": {
                    "0%": { opacity: 1, transform: "scale(1)" },
                    "50%": { opacity: 0.4, transform: "scale(0.8)" },
                    "100%": { opacity: 1, transform: "scale(1)" },
                  },
                }}
              />
              <Typography
                sx={{
                  fontSize: 9,
                  fontWeight: 800,
                  color: "#22C55E",
                  letterSpacing: "0.5px",
                }}
              >
                LIVE
              </Typography>
            </Box>
          ) : (
            <Typography
              sx={{
                fontSize: 9,
                fontWeight: 700,
                color: "#94A3B8",
                letterSpacing: "0.4px",
                textTransform: "uppercase",
              }}
            >
              Phase 2
            </Typography>
          )}
        </Stack>

        {/* Subtitle / Location */}
        <Typography
          sx={{
            fontSize: 11,
            fontWeight: 500,
            color: "#CBD5E1",
            lineHeight: 1.2,
            whiteSpace: "nowrap",
          }}
        >
          {plant.sub || plant.name}
        </Typography>

        {/* Real KPI Strip: OEE / OTIF / YIELD */}
        <Stack
          direction="row"
          alignItems="center"
          justifyContent="space-between"
          sx={{
            mt: 0.2,
            pt: 0.4,
            borderTop: "1px solid rgba(255, 255, 255, 0.08)",
            fontSize: 10,
          }}
        >
          <Box sx={{ textAlign: "center" }}>
            <Typography sx={{ fontSize: 8, fontWeight: 700, color: "#64748B", textTransform: "uppercase" }}>
              OEE
            </Typography>
            <Typography sx={{ fontSize: 11, fontWeight: 800, color: hasOee ? "#22C55E" : "#94A3B8" }}>
              {plant.oee != null ? `${plant.oee}%` : "—"}
            </Typography>
          </Box>
          <Box sx={{ textAlign: "center" }}>
            <Typography sx={{ fontSize: 8, fontWeight: 700, color: "#64748B", textTransform: "uppercase" }}>
              OTIF
            </Typography>
            <Typography sx={{ fontSize: 11, fontWeight: 800, color: plant.otif != null ? "#38BDF8" : "#94A3B8" }}>
              {plant.otif != null ? `${plant.otif}%` : "—"}
            </Typography>
          </Box>
          <Box sx={{ textAlign: "center" }}>
            <Typography sx={{ fontSize: 8, fontWeight: 700, color: "#64748B", textTransform: "uppercase" }}>
              YIELD
            </Typography>
            <Typography sx={{ fontSize: 11, fontWeight: 800, color: plant.yield != null ? "#38BDF8" : "#94A3B8" }}>
              {plant.yield != null ? `${plant.yield}%` : "—"}
            </Typography>
          </Box>
        </Stack>
      </Box>
    </Box>
  );
}

export default MapPlantMarker;
