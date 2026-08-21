import { Box, Stack, Typography, useTheme } from "@mui/material";

/**
 * Modern Glassmorphic Plant Card matching the inspiration design
 * Displays:
 * - Plant code badge (e.g. CTP, BTP, LTP, RTP)
 * - Plant location & state
 * - Live status badge with pulsing beacon
 * - 4 Key KPI metrics (OEE, OTIF, YIELD, PQR) with sparkline trends
 */
function ModernPlantCard({
  plant,
  active,
  hovered,
  selected,
  onHover,
  onLeave,
  onSelect,
}) {
  const theme = useTheme();
  const highlighted = active && (hovered || selected);

  return (
    <Box
      onMouseEnter={active ? onHover : undefined}
      onMouseLeave={active ? onLeave : undefined}
      onClick={active ? onSelect : undefined}
      sx={{
        position: "relative",
        borderRadius: "14px",
        p: 2.2,
        backgroundColor: highlighted
          ? "rgba(255, 255, 255, 0.92)"
          : "rgba(255, 255, 255, 0.82)",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
        border: "1px solid",
        borderColor: highlighted
          ? "rgba(0, 150, 255, 0.6)"
          : "rgba(255, 255, 255, 0.8)",
        boxShadow: highlighted
          ? "0 12px 32px rgba(0, 30, 80, 0.18), 0 0 0 1px rgba(0, 150, 255, 0.3)"
          : "0 6px 20px rgba(0, 0, 0, 0.06)",
        cursor: active ? "pointer" : "default",
        opacity: active ? 1 : 0.7,
        transform: highlighted ? "translateY(-3px) scale(1.01)" : "translateY(0)",
        transition: "all 0.28s cubic-bezier(0.4, 0, 0.2, 1)",
        "&:hover": active
          ? {
              backgroundColor: "rgba(255, 255, 255, 0.95)",
              boxShadow: "0 12px 32px rgba(0, 30, 80, 0.18)",
            }
          : undefined,
      }}
    >
      {/* Top Header Row */}
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        sx={{ mb: 1.5 }}
      >
        {/* Plant Code Badge + Location */}
        <Stack direction="row" alignItems="center" spacing={1.2}>
          <Box
            sx={{
              px: 1.2,
              py: 0.35,
              borderRadius: "6px",
              backgroundColor: "#FFF2EC",
              border: "1px solid #FFE0D1",
              color: "#E65100",
              fontSize: 12,
              fontWeight: 800,
              letterSpacing: 0.5,
            }}
          >
            {plant.code || plant.id.toUpperCase()}
          </Box>
          <Typography
            sx={{
              fontSize: 15,
              fontWeight: 700,
              color: "#1E293B",
              display: "flex",
              alignItems: "baseline",
              gap: "6px",
            }}
          >
            {plant.name.replace(" Tyre Plant", "").replace(" Plant", "")}
            <Typography
              component="span"
              sx={{ fontSize: 13, fontWeight: 400, color: "#64748B" }}
            >
              {plant.sub}
            </Typography>
          </Typography>
        </Stack>

        {/* Live Indicator + Arrow */}
        <Stack direction="row" alignItems="center" spacing={1}>
          {active ? (
            <Stack direction="row" alignItems="center" spacing={0.6}>
              <Box
                sx={{
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  backgroundColor: "#EF4444",
                  boxShadow: "0 0 8px #EF4444",
                  animation: "livePulse 1.8s infinite",
                  "@keyframes livePulse": {
                    "0%": { opacity: 1, transform: "scale(1)" },
                    "50%": { opacity: 0.4, transform: "scale(0.85)" },
                    "100%": { opacity: 1, transform: "scale(1)" },
                  },
                }}
              />
              <Typography
                sx={{
                  fontSize: 10,
                  fontWeight: 800,
                  color: "#EF4444",
                  letterSpacing: 0.8,
                }}
              >
                LIVE
              </Typography>
            </Stack>
          ) : (
            <Box
              sx={{
                fontSize: 10,
                fontWeight: 700,
                px: 0.8,
                py: 0.2,
                borderRadius: "4px",
                backgroundColor: "#F1F5F9",
                color: "#64748B",
                textTransform: "uppercase",
              }}
            >
              Phase 2
            </Box>
          )}
          <Typography
            sx={{
              color: highlighted ? "#0284C7" : "#94A3B8",
              fontSize: 16,
              lineHeight: 1,
              transition: "transform 0.2s ease, color 0.2s ease",
              transform: highlighted ? "translateX(3px)" : "none",
            }}
          >
            →
          </Typography>
        </Stack>
      </Stack>

      {/* KPI Metrics Grid (4 columns) */}
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 1.2,
        }}
      >
        <KpiBlock
          label="OEE"
          value={plant.oee}
          isPositive={plant.oee >= 90}
        />
        <KpiBlock
          label="OTIF"
          value={plant.otif}
          isPositive={plant.otif >= 95}
        />
        <KpiBlock
          label="YIELD"
          value={plant.yield}
          isPositive={plant.yield >= 97}
        />
        <KpiBlock
          label="PQR"
          value={plant.pqr || 95.0}
          isPositive={plant.pqr ? plant.pqr >= 95 : true}
        />
      </Box>
    </Box>
  );
}

function KpiBlock({ label, value, isPositive = true }) {
  const displayVal = typeof value === "number" ? value.toFixed(1) : value;

  return (
    <Box
      sx={{
        backgroundColor: "rgba(255, 255, 255, 0.7)",
        border: "1px solid rgba(226, 232, 240, 0.8)",
        borderRadius: "10px",
        p: 1.2,
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
      }}
    >
      <Typography
        sx={{
          fontSize: 10,
          fontWeight: 700,
          color: "#94A3B8",
          letterSpacing: 0.6,
          textTransform: "uppercase",
          mb: 0.5,
        }}
      >
        {label}
      </Typography>

      <Typography
        sx={{
          fontSize: 19,
          fontWeight: 800,
          color: isPositive ? "#16A34A" : "#DC2626",
          lineHeight: 1.1,
          display: "flex",
          alignItems: "baseline",
        }}
      >
        {displayVal || "NA"}
        <Typography
          component="span"
          sx={{
            fontSize: 11,
            fontWeight: 700,
            color: isPositive ? "#16A34A" : "#DC2626",
            ml: 0.3,
          }}
        >
          %
        </Typography>
      </Typography>

      {/* Sparkline curve under metric */}
      <Box sx={{ mt: 0.8, height: 12, width: "100%" }}>
        <svg
          viewBox="0 0 60 12"
          style={{ width: "100%", height: "100%", overflow: "visible" }}
        >
          <path
            d={
              isPositive
                ? "M 0,8 Q 15,12 30,5 T 60,3"
                : "M 0,3 Q 15,2 30,7 T 60,10"
            }
            fill="none"
            stroke={isPositive ? "#22C55E" : "#EF4444"}
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      </Box>
    </Box>
  );
}

export default ModernPlantCard;
