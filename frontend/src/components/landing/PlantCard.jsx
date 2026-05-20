import { Box, Stack, Tooltip, Typography, useTheme } from "@mui/material";

/**
 * Single plant card. Active plants get hover + select interactivity;
 * disabled plants render at reduced opacity with a Tooltip per
 * Q-NAV-01.
 */
function PlantCard({
  plant,
  active,
  hovered,
  selected,
  onHover,
  onLeave,
  onSelect,
  disabledReason,
}) {
  const theme = useTheme();

  const baseBorderColor = selected
    ? theme.palette.primary.main
    : hovered
      ? theme.palette.primary.main
      : theme.palette.divider;

  const card = (
    <Box
      onMouseEnter={active ? onHover : undefined}
      onMouseLeave={active ? onLeave : undefined}
      onClick={active ? onSelect : undefined}
      sx={{
        backgroundColor: "background.paper",
        border: 1,
        borderColor: baseBorderColor,
        borderRadius: 1.25,
        p: 2,
        cursor: active ? "pointer" : "not-allowed",
        opacity: active ? 1 : 0.5,
        transition: "transform 0.15s, box-shadow 0.15s, border-color 0.15s",
        boxShadow: hovered && active ? theme.custom.shadow : "none",
        transform: hovered && active ? "translateY(-2px)" : "none",
        // Stronger ring when selected
        ...(selected && {
          borderWidth: 2,
          boxShadow: `0 0 0 3px ${theme.palette.primary.light}`,
        }),
      }}
    >
      <Stack
        direction="row"
        justifyContent="space-between"
        alignItems="flex-start"
      >
        <Box>
          <Typography sx={{ fontSize: 16, fontWeight: 600 }}>
            {plant.name}
          </Typography>
          <Typography sx={{ fontSize: 12, color: "text.disabled", mt: 0.25 }}>
            {plant.sub}
          </Typography>
        </Box>
        {!active && (
          <Box
            sx={{
              fontSize: 11,
              fontWeight: 600,
              px: 1,
              py: 0.25,
              borderRadius: 999,
              backgroundColor: theme.custom.surface.soft,
              color: "text.secondary",
              textTransform: "uppercase",
              letterSpacing: 0.6,
            }}
          >
            Phase 2
          </Box>
        )}
      </Stack>

      <Stack direction="row" spacing={3} sx={{ mt: 1.5 }}>
        <KpiCell label="OE" value={plant.oe} unit="%" />
        <KpiCell label="OTIF" value={plant.otif} unit="%" />
        <KpiCell label="Yield" value={plant.yield} unit="%" />
      </Stack>
    </Box>
  );

  if (active) return card;
  return (
    <Tooltip
      title={disabledReason ?? "Phase 2 — not yet available"}
      placement="right"
      arrow
    >
      {/* span wrapper so Tooltip receives events even on non-active box */}
      <span style={{ display: "block" }}>{card}</span>
    </Tooltip>
  );
}

function KpiCell({ label, value, unit }) {
  return (
    <Box>
      <Typography sx={{ fontSize: 20, fontWeight: 700, lineHeight: 1.1 }}>
        {value}
        <Typography
          component="span"
          sx={{ fontSize: 12, color: "text.disabled", ml: 0.5 }}
        >
          {unit}
        </Typography>
      </Typography>
      <Typography
        sx={{
          fontSize: 11,
          color: "text.disabled",
          textTransform: "uppercase",
          letterSpacing: 0.6,
          mt: 0.25,
        }}
      >
        {label}
      </Typography>
    </Box>
  );
}

export default PlantCard;
