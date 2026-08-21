import { Box, Typography } from "@mui/material";
import LocationOnRoundedIcon from "@mui/icons-material/LocationOnRounded";

/**
 * React Component for Map Marker
 * Combines MUI LocationOnRounded Icon with a high-contrast Glassmorphic Plant Info Badge
 */
function MapPlantMarker({
  plant,
  isFocused = false,
  onClick,
  onMouseEnter,
}) {
  const isPos = plant.isPositive;
  const changeColor = isPos ? "#4ADE80" : "#F87171";
  const arrow = isPos ? "↗" : "↘";
  const changeText = plant.change ? plant.change.replace(/[+-]/g, "").trim() : "";

  return (
    <Box
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 1,
        cursor: "pointer",
        userSelect: "none",
        pointerEvents: "auto",
        transform: isFocused ? "scale(1.15) translateY(-6px)" : "scale(1)",
        transition: "all 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
        filter: isFocused
          ? "drop-shadow(0 8px 16px rgba(0,0,0,0.7))"
          : "drop-shadow(0 4px 8px rgba(0,0,0,0.5))",
      }}
    >
      {/* Location Pin Icon from MUI Icons */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: isFocused ? "#EF4444" : "#EA4335",
          transition: "color 0.2s ease, transform 0.2s ease",
          "& .MuiSvgIcon-root": {
            fontSize: isFocused ? 42 : 36,
            filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.4))",
          },
        }}
      >
        <LocationOnRoundedIcon />
      </Box>

      {/* Info Badge Card */}
      <Box
        sx={{
          backgroundColor: "rgba(15, 23, 42, 0.88)",
          backdropFilter: "blur(10px)",
          WebkitBackdropFilter: "blur(10px)",
          border: "1px solid",
          borderColor: isFocused ? "rgba(239, 68, 68, 0.6)" : "rgba(255, 255, 255, 0.15)",
          borderRadius: "8px",
          px: 1.25,
          py: 0.75,
          display: "flex",
          flexDirection: "column",
          gap: 0.2,
          minWidth: "120px",
          boxShadow: isFocused
            ? "0 0 16px rgba(239, 68, 68, 0.3)"
            : "0 4px 12px rgba(0,0,0,0.3)",
          transition: "border-color 0.2s ease, box-shadow 0.2s ease",
        }}
      >
        {/* Plant Code Header */}
        <Typography
          sx={{
            fontSize: 13,
            fontWeight: 800,
            color: "#FFFFFF",
            letterSpacing: "0.5px",
            lineHeight: 1.2,
          }}
        >
          {plant.code || plant.id.toUpperCase()}
        </Typography>

        {/* Tyres Today */}
        <Typography
          sx={{
            fontSize: 11,
            fontWeight: 500,
            color: "#CBD5E1",
            lineHeight: 1.2,
            whiteSpace: "nowrap",
          }}
        >
          {plant.prodToday || ""}
        </Typography>

        {/* Revenue & Trend */}
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 0.5,
            fontSize: 11,
            fontWeight: 600,
            color: "#E2E8F0",
            lineHeight: 1.2,
          }}
        >
          <span>{plant.revenue || ""}</span>
          <Typography
            component="span"
            sx={{
              color: changeColor,
              fontWeight: 700,
              fontSize: 11,
              display: "inline-flex",
              alignItems: "center",
            }}
          >
            {arrow} {changeText}
          </Typography>
        </Box>
      </Box>
    </Box>
  );
}

export default MapPlantMarker;
