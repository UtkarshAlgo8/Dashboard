import { Box, Stack, Typography } from "@mui/material";
import GridViewRoundedIcon from "@mui/icons-material/GridViewRounded";
import LayersClearRoundedIcon from "@mui/icons-material/LayersClearRounded";

/**
 * Format numeric tyre count with Indian numbering format (e.g. 7,14,248)
 */
function formatTyreCount(val, isLive) {
  if (val !== null && val !== undefined && !isNaN(Number(val))) {
    const n = Number(val);
    if (n === 0 && !isLive) return "NA";
    return n.toLocaleString("en-IN");
  }
  return isLive ? "0" : "NA";
}

/**
 * Modern Plant Menu Card matching the reference design:
 * - Solid pure white container (#FFFFFF) with 16px radius and clean drop shadow
 * - Full plant name (e.g. "Banmore Tyre Plant") with red "● Live" or "Phase 2" badge
 * - Production Row: 4-square grid icon + "Production : [Value] Tyres"
 * - Scrap Row: Slashed layers icon + "Scrap : [Value] Tyres"
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
  const isLive = Boolean(active);
  const highlighted = active && (hovered || selected);

  const prodValue = formatTyreCount(plant.curedTyreProduction, isLive);
  const scrapValue = formatTyreCount(plant.scrap, isLive);

  const displayName = plant.name || `${plant.id?.toUpperCase()} Tyre Plant`;

  return (
    <Box
      onMouseEnter={active ? onHover : undefined}
      onMouseLeave={active ? onLeave : undefined}
      onClick={active ? onSelect : undefined}
      sx={{
        position: "relative",
        borderRadius: "16px",
        p: { xs: 1.75, md: 2 },
        backgroundColor: "#FFFFFF",
        border: "1px solid",
        borderColor: highlighted
          ? "rgba(37, 99, 235, 0.6)"
          : "rgba(226, 232, 240, 0.85)",
        boxShadow: highlighted
          ? "0 12px 28px rgba(0, 0, 0, 0.16), 0 0 0 1.5px #2563EB"
          : "0 4px 16px rgba(0, 0, 0, 0.08)",
        cursor: active ? "pointer" : "default",
        opacity: active ? 1 : 0.88,
        transform: highlighted
          ? "translateY(-3px) scale(1.01)"
          : "translateY(0)",
        transition: "all 0.24s cubic-bezier(0.34, 1.56, 0.64, 1)",
        userSelect: "none",
      }}
    >
      {/* Top Header Row: Plant Full Name + Status Badge */}
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        spacing={1}
        sx={{ mb: 1.2 }}
      >
        <Typography
          sx={{
            fontSize: { xs: 13, sm: 13.5, md: 14 },
            fontWeight: 600,
            color: "#1E293B",
            lineHeight: 1.2,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {displayName}
        </Typography>

        {isLive ? (
          <Stack
            direction="row"
            alignItems="center"
            spacing={0.5}
            sx={{ flexShrink: 0 }}
          >
            <Box
              sx={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                backgroundColor: "#DC2626",
                boxShadow: "0 0 4px rgba(220, 38, 38, 0.6)",
              }}
            />
            <Typography
              sx={{
                fontSize: 12,
                fontWeight: 600,
                color: "#DC2626",
              }}
            >
              Live
            </Typography>
          </Stack>
        ) : (
          <Typography
            sx={{
              fontSize: 12,
              fontWeight: 500,
              color: "#64748B",
              flexShrink: 0,
            }}
          >
            Phase 2
          </Typography>
        )}
      </Stack>

      {/* Aligned KPI Data Rows (Production & Scrap) */}
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: "auto auto auto 1fr",
          alignItems: "center",
          rowGap: 0.9,
          columnGap: 0.8,
          mt: 1.2,
        }}
      >
        {/* Production Row */}
        <GridViewRoundedIcon sx={{ fontSize: 17, color: "#2563EB" }} />
        <Typography
          sx={{
            fontSize: 13,
            fontWeight: 600,
            color: "#1E293B",
          }}
        >
          Production
        </Typography>
        <Typography
          sx={{
            fontSize: 13,
            fontWeight: 600,
            color: "#1E293B",
          }}
        >
          :
        </Typography>
        <Typography
          sx={{
            fontSize: 13,
            fontWeight: 700,
            color: "#1E293B",
            whiteSpace: "nowrap",
          }}
        >
          {prodValue}
          {prodValue !== "NA" && (
            <Typography
              component="span"
              sx={{
                fontSize: 12.5,
                fontWeight: 400,
                color: "#64748B",
                ml: 0.5,
              }}
            >
              NOS
            </Typography>
          )}
        </Typography>

        {/* Scrap Row */}
        <LayersClearRoundedIcon sx={{ fontSize: 17, color: "#0284C7" }} />
        <Typography
          sx={{
            fontSize: 13,
            fontWeight: 600,
            color: "#1E293B",
          }}
        >
          Scrap
        </Typography>
        <Typography
          sx={{
            fontSize: 13,
            fontWeight: 600,
            color: "#1E293B",
          }}
        >
          :
        </Typography>
        <Typography
          sx={{
            fontSize: 13,
            fontWeight: 700,
            color: "#1E293B",
            whiteSpace: "nowrap",
          }}
        >
          {scrapValue}
          {scrapValue !== "NA" && (
            <Typography
              component="span"
              sx={{
                fontSize: 12.5,
                fontWeight: 400,
                color: "#64748B",
                ml: 0.5,
              }}
            >
              NOS
            </Typography>
          )}
        </Typography>
      </Box>
    </Box>
  );
}

export default ModernPlantCard;
