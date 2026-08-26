import { Box, Stack, Typography } from "@mui/material";
import LocationOnRoundedIcon from "@mui/icons-material/LocationOnRounded";

/**
 * Format numeric percentages or return null for 'NA' fallback
 */
function parseNumeric(val) {
  const n = typeof val === "number" ? val : Number.parseFloat(val);
  return Number.isFinite(n) ? n : null;
}

/**
 * High-Tech Map Marker with Radar Pulses & Floating HUD Glass Label
 * Features:
 * - Full plant name & clean subtitle matching reference design
 * - Large high-legibility KPI typography (OEE, OTIF, YIELD) with green % and NA
 * - Concentric glowing radar waves rippling from the plant GPS base
 * - Aerospace-style Heads Up Display (HUD) glassmorphic card
 */
function MapPlantMarker({ plant, isFocused = false, onClick, onMouseEnter }) {
  const isLeft = plant.badgeSide === "left";
  const isLive = plant.id === "banmore" || plant.id === "chennai";

  // Clean full plant name (e.g. "Banmore Plant", "Chennai Plant")
  const displayName = plant.name
    ? plant.name.replace(" Tyre Plant", " Plant")
    : `${plant.id.toUpperCase()} Plant`;

  const oeeVal = parseNumeric(plant.oee);
  const otifVal = parseNumeric(plant.otif);
  const yieldVal = parseNumeric(plant.yield);

  return (
    <Box
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      sx={{
        display: "flex",
        flexDirection: isLeft ? "row-reverse" : "row",
        alignItems: "center",
        gap: 1.4,
        cursor: "pointer",
        userSelect: "none",
        pointerEvents: "auto",
        transform: isFocused ? "scale(1.1) translateY(-6px)" : "scale(1)",
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
          width: 42,
          height: 42,
        }}
      >
        {/* Radar Wave 1 */}
        <Box
          sx={{
            position: "absolute",
            bottom: "4px",
            left: "50%",
            width: isFocused ? 46 : 34,
            height: isFocused ? 46 : 34,
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
            width: isFocused ? 46 : 34,
            height: isFocused ? 46 : 34,
            borderRadius: "50%",
            border: `1.5px solid ${isFocused ? "rgba(239, 68, 68, 0.6)" : "rgba(0, 210, 255, 0.5)"}`,
            transform: "translate(-50%, 50%)",
            animation:
              "radarPing 2.4s cubic-bezier(0, 0.2, 0.8, 1) infinite 1.2s",
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
              fontSize: isFocused ? 46 : 40,
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
            ? "rgba(10, 18, 38, 0.95)"
            : "rgba(15, 23, 42, 0.90)",
          backdropFilter: "blur(18px) saturate(180%)",
          WebkitBackdropFilter: "blur(18px) saturate(180%)",
          border: "1px solid",
          borderColor: isFocused
            ? "rgba(239, 68, 68, 0.8)"
            : "rgba(0, 180, 255, 0.42)",
          borderRadius: "14px",
          px: 2.2,
          py: 1.6,
          display: "flex",
          flexDirection: "column",
          minWidth: "210px",
          boxShadow: isFocused
            ? "0 0 30px rgba(239, 68, 68, 0.4), 0 12px 32px rgba(0,0,0,0.65), inset 0 1px 0 rgba(255,255,255,0.2)"
            : "0 0 20px rgba(0, 160, 255, 0.22), 0 8px 24px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.15)",
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
            height: "2px",
            background: isFocused
              ? "linear-gradient(90deg, transparent 0%, #EF4444 50%, transparent 100%)"
              : "linear-gradient(90deg, transparent 0%, #38BDF8 50%, transparent 100%)",
          },
        }}
      >
        {/* Header Row: Full Plant Name + Live / Phase 2 Pill */}
        <Stack
          direction="row"
          alignItems="center"
          justifyContent="space-between"
          spacing={1.5}
          sx={{ mb: 0.4 }}
        >
          <Typography
            sx={{
              fontSize: 16,
              fontWeight: 700,
              color: isFocused ? "#FFFFFF" : "#38BDF8",
              letterSpacing: "0.2px",
              lineHeight: 1.2,
            }}
          >
            {displayName}
          </Typography>

          {/* Live Mini Beacon / Phase 2 */}
          {isLive ? (
            <Stack
              direction="row"
              alignItems="center"
              spacing={0.5}
              sx={{
                px: 0.9,
                py: 0.25,
                borderRadius: "12px",
                backgroundColor: "rgba(34, 197, 94, 0.12)",
                border: "1px solid rgba(34, 197, 94, 0.3)",
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
            </Stack>
          ) : (
            <Typography
              sx={{
                fontSize: 10,
                fontWeight: 700,
                color: "#94A3B8",
                letterSpacing: "0.4px",
                textTransform: "uppercase",
                px: 0.8,
                py: 0.2,
                borderRadius: "6px",
                backgroundColor: "rgba(255, 255, 255, 0.06)",
                border: "1px solid rgba(255, 255, 255, 0.1)",
              }}
            >
              Phase 2
            </Typography>
          )}
        </Stack>

        {/* Subtitle / Location */}
        <Typography
          sx={{
            fontSize: 13,
            fontWeight: 500,
            color: "#94A3B8",
            lineHeight: 1.2,
            mb: 1.2,
          }}
        >
          {plant.sub}
        </Typography>

        {/* KPI Strip: OEE / OTIF / YIELD (Larger, High-Legibility) */}
        <Stack
          direction="row"
          alignItems="center"
          justifyContent="space-between"
          sx={{
            pt: 1.2,
            borderTop: "1px solid rgba(255, 255, 255, 0.1)",
          }}
        >
          <KpiMetric label="OEE" value={oeeVal} />
          <KpiMetric label="OTIF" value={otifVal} />
          <KpiMetric label="YIELD" value={yieldVal} />
        </Stack>
      </Box>
    </Box>
  );
}

function KpiMetric({ label, value }) {
  const hasValue = value !== null && value !== undefined;
  return (
    <Box sx={{ textAlign: "center", flex: 1 }}>
      <Typography
        sx={{
          fontSize: 11,
          fontWeight: 700,
          color: "#94A3B8",
          letterSpacing: 0.6,
          textTransform: "uppercase",
          mb: 0.3,
        }}
      >
        {label}
      </Typography>
      <Stack
        direction="row"
        alignItems="baseline"
        justifyContent="center"
        spacing={0.2}
      >
        <Typography
          sx={{
            fontSize: 20,
            fontWeight: 800,
            color: hasValue ? "#22C55E" : "#94A3B8",
            lineHeight: 1,
          }}
        >
          {hasValue ? value : "NA"}
        </Typography>
        {hasValue && (
          <Typography
            sx={{
              fontSize: 12,
              fontWeight: 700,
              color: "#22C55E",
            }}
          >
            %
          </Typography>
        )}
      </Stack>
    </Box>
  );
}

export default MapPlantMarker;
