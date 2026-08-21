import { useEffect, useState } from "react";
import { Box, Stack, Typography, useTheme } from "@mui/material";
import { motion } from "framer-motion";

/**
 * Animated Number component that smoothly counts up to target value
 */
function AnimatedNumber({ value, decimals = 1, suffix = "%" }) {
  const [displayValue, setDisplayValue] = useState(0);
  const target = typeof value === "number" ? value : parseFloat(value);

  useEffect(() => {
    if (isNaN(target) || target === null || target === undefined) return;

    let startTimestamp = null;
    const duration = 2200; // ms (2.2 seconds)

    const step = (timestamp) => {
      if (!startTimestamp) startTimestamp = timestamp;
      const progress = Math.min((timestamp - startTimestamp) / duration, 1);
      // Ease out cubic
      const easeOut = 1 - Math.pow(1 - progress, 3);
      const current = progress === 1 ? target : target * easeOut;
      setDisplayValue(current);

      if (progress < 1) {
        window.requestAnimationFrame(step);
      }
    };

    const animFrame = window.requestAnimationFrame(step);
    return () => window.cancelAnimationFrame(animFrame);
  }, [target]);

  if (value === null || value === undefined || isNaN(target)) {
    return <span>NA</span>;
  }

  return (
    <>
      {displayValue.toFixed(decimals)}
      <Typography
        component="span"
        sx={{
          fontSize: 11,
          fontWeight: 700,
          ml: 0.3,
          color: "inherit",
        }}
      >
        {suffix}
      </Typography>
    </>
  );
}

/**
 * Modern Glassmorphic Plant Card with Micro-Animations & Data Viz
 * Features:
 * - Animated counting-up KPI percentages
 * - Dynamic SVG sparklines that draw themselves from left to right on load
 * - True Glassmorphism with 24px blur & specular glass top-edge reflection
 * - Ambient neon glow & smooth hover micro-interactions
 */
function ModernPlantCard({
  plant,
  active,
  hovered,
  selected,
  onHover,
  onLeave,
  onSelect,
  index = 0,
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
        borderRadius: "16px",
        p: 2.2,
        background: highlighted
          ? "linear-gradient(135deg, rgba(255, 255, 255, 0.96) 0%, rgba(240, 246, 255, 0.92) 100%)"
          : "linear-gradient(135deg, rgba(255, 255, 255, 0.86) 0%, rgba(245, 248, 255, 0.78) 100%)",
        backdropFilter: "blur(24px) saturate(190%)",
        WebkitBackdropFilter: "blur(24px) saturate(190%)",
        border: "1px solid",
        borderColor: highlighted
          ? "rgba(0, 150, 255, 0.7)"
          : "rgba(255, 255, 255, 0.75)",
        boxShadow: highlighted
          ? "0 20px 45px -10px rgba(0, 100, 255, 0.28), 0 0 25px rgba(0, 180, 255, 0.2), inset 0 1px 1px rgba(255, 255, 255, 0.9)"
          : "0 10px 30px -10px rgba(0, 15, 45, 0.12), 0 2px 6px rgba(0, 0, 0, 0.04), inset 0 1px 1px rgba(255, 255, 255, 0.8)",
        cursor: active ? "pointer" : "default",
        opacity: active ? 1 : 0.65,
        transform: highlighted ? "translateY(-4px) scale(1.015)" : "translateY(0)",
        transition: "all 0.28s cubic-bezier(0.34, 1.56, 0.64, 1)",
        overflow: "hidden",
        /* Specular Glass Top-Edge Shine */
        "&::before": {
          content: '""',
          position: "absolute",
          top: 0,
          left: "5%",
          right: "5%",
          height: "1px",
          background: highlighted
            ? "linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(0,180,255,0.8) 50%, rgba(255,255,255,0) 100%)"
            : "linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.9) 50%, rgba(255,255,255,0) 100%)",
          pointerEvents: "none",
        },
        "&:hover": active
          ? {
              boxShadow:
                "0 20px 45px -10px rgba(0, 100, 255, 0.28), 0 0 25px rgba(0, 180, 255, 0.2)",
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
              px: 1.25,
              py: 0.35,
              borderRadius: "7px",
              background: "linear-gradient(135deg, #FFF2EC 0%, #FFE5D6 100%)",
              border: "1px solid #FFD0B8",
              color: "#E65100",
              fontSize: 12,
              fontWeight: 800,
              letterSpacing: 0.5,
              boxShadow: "0 2px 6px rgba(230, 81, 0, 0.12)",
            }}
          >
            {plant.code || plant.id.toUpperCase()}
          </Box>
          <Typography
            sx={{
              fontSize: 15,
              fontWeight: 700,
              color: "#0F172A",
              display: "flex",
              alignItems: "baseline",
              gap: "6px",
            }}
          >
            {plant.name.replace(" Tyre Plant", "").replace(" Plant", "")}
            <Typography
              component="span"
              sx={{ fontSize: 13, fontWeight: 500, color: "#64748B" }}
            >
              {plant.sub}
            </Typography>
          </Typography>
        </Stack>

        {/* Live Indicator + Arrow */}
        <Stack direction="row" alignItems="center" spacing={1}>
          {active ? (
            <Stack
              direction="row"
              alignItems="center"
              spacing={0.7}
              sx={{
                px: 1,
                py: 0.3,
                borderRadius: "20px",
                background: "rgba(239, 68, 68, 0.08)",
                border: "1px solid rgba(239, 68, 68, 0.2)",
              }}
            >
              <Box
                sx={{
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  backgroundColor: "#EF4444",
                  boxShadow: "0 0 10px #EF4444",
                  animation: "livePulse 1.8s infinite",
                  "@keyframes livePulse": {
                    "0%": { opacity: 1, transform: "scale(1)" },
                    "50%": { opacity: 0.3, transform: "scale(0.8)" },
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
                px: 0.9,
                py: 0.3,
                borderRadius: "5px",
                backgroundColor: "#F1F5F9",
                border: "1px solid #E2E8F0",
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
              fontWeight: 700,
              transition: "transform 0.2s ease, color 0.2s ease",
              transform: highlighted ? "translateX(3px)" : "none",
            }}
          >
            →
          </Typography>
        </Stack>
      </Stack>

      {/* KPI Metrics Grid (3 columns) */}
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 1.2,
        }}
      >
        <KpiBlock
          label="OEE"
          value={plant.oee}
          isPositive={plant.oee >= 90}
          highlighted={highlighted}
          delay={0.1 + index * 0.08}
        />
        <KpiBlock
          label="OTIF"
          value={plant.otif}
          isPositive={plant.otif >= 95}
          highlighted={highlighted}
          delay={0.18 + index * 0.08}
        />
        <KpiBlock
          label="YIELD"
          value={plant.yield}
          isPositive={plant.yield >= 97}
          highlighted={highlighted}
          delay={0.26 + index * 0.08}
        />
      </Box>
    </Box>
  );
}

function KpiBlock({
  label,
  value,
  isPositive = true,
  highlighted = false,
  delay = 0.1,
}) {
  const strokeColor = isPositive ? "#22C55E" : "#EF4444";
  const pathData = isPositive
    ? "M 2,9 Q 16,12 30,5 T 58,3"
    : "M 2,3 Q 16,2 30,7 T 58,10";

  return (
    <Box
      sx={{
        backgroundColor: highlighted
          ? "rgba(255, 255, 255, 0.85)"
          : "rgba(255, 255, 255, 0.65)",
        backdropFilter: "blur(12px)",
        border: "1px solid",
        borderColor: highlighted
          ? "rgba(0, 160, 255, 0.2)"
          : "rgba(226, 232, 240, 0.8)",
        borderRadius: "11px",
        p: 1.2,
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        boxShadow:
          "0 2px 6px rgba(0, 0, 0, 0.02), inset 0 1px 0 rgba(255, 255, 255, 0.9)",
        transition: "all 0.2s ease",
      }}
    >
      <Typography
        sx={{
          fontSize: 10,
          fontWeight: 700,
          color: "#64748B",
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
        <AnimatedNumber value={value} decimals={1} suffix="%" />
      </Typography>

      {/* Animated Drawing Sparkline Curve */}
      <Box sx={{ mt: 0.8, height: 12, width: "100%", overflow: "visible" }}>
        <svg
          viewBox="0 0 60 12"
          style={{ width: "100%", height: "100%", overflow: "visible" }}
        >
          <motion.path
            d={pathData}
            fill="none"
            stroke={strokeColor}
            strokeWidth="2"
            strokeLinecap="round"
            initial={{ pathLength: 0, opacity: 0.2 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{
              duration: 2.2,
              ease: [0.16, 1, 0.3, 1],
              delay: 0.3 + delay,
            }}
          />
        </svg>
      </Box>
    </Box>
  );
}

export default ModernPlantCard;
