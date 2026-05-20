import { Box, Tooltip, Typography, useTheme } from "@mui/material";

/**
 * Single function tile. Active tiles are clickable; disabled tiles
 * render at reduced opacity with a tooltip per BRD FR-L16 and
 * Q-NAV-01.
 */
function FunctionTile({ fn, active, onClick, disabledReason }) {
  const theme = useTheme();

  const tile = (
    <Box
      onClick={active ? onClick : undefined}
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 0.5,
        minWidth: 96,
        height: 80,
        px: 2,
        py: 1.5,
        borderRadius: 1.25,
        border: 1,
        borderColor: active ? "primary.main" : "divider",
        backgroundColor: active ? "primary.light" : theme.custom.surface.soft,
        color: active ? "primary.main" : "text.disabled",
        opacity: active ? 1 : 0.55,
        cursor: active ? "pointer" : "not-allowed",
        transition: "transform 0.15s, box-shadow 0.15s",
        ...(active && {
          "&:hover": {
            boxShadow: theme.custom.shadow,
            transform: "translateY(-2px)",
          },
        }),
      }}
    >
      <Typography sx={{ fontSize: 24, lineHeight: 1 }}>{fn.icon}</Typography>
      <Typography
        sx={{
          fontSize: 12,
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: 0.4,
        }}
      >
        {fn.name}
      </Typography>
    </Box>
  );

  if (active) return tile;
  return (
    <Tooltip
      title={disabledReason ?? "Phase 2 — not yet available"}
      placement="top"
      arrow
    >
      <span style={{ display: "inline-block" }}>{tile}</span>
    </Tooltip>
  );
}

export default FunctionTile;
