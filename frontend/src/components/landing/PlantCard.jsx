import { Box, Stack, Tooltip, Typography, useTheme } from "@mui/material";

/**
 * Single plant card. Active plants get hover-lift + select
 * interactivity; disabled plants render dimmed with a Tooltip
 * (Q-NAV-01). A left stripe + KPI pills are colour-coded by OE health.
 */
function statusColor(theme, v) {
  if (typeof v !== "number") return theme.custom.text.muted;
  if (v >= 90) return theme.custom.brand.green;
  if (v >= 80) return theme.custom.brand.amber;
  return theme.custom.brand.red;
}

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
  const highlighted = active && (hovered || selected);
  const accent = statusColor(theme, plant.oe);
  const initial = (plant.name || "?").trim().charAt(0).toUpperCase();

  const card = (
    <Box
      onMouseEnter={active ? onHover : undefined}
      onMouseLeave={active ? onLeave : undefined}
      onClick={active ? onSelect : undefined}
      sx={{
        position: "relative",
        overflow: "hidden",
        backgroundColor: "background.paper",
        border: 1,
        borderColor: highlighted ? "primary.main" : "divider",
        borderRadius: 2,
        p: 2,
        pl: 2.5,
        cursor: active ? "pointer" : "not-allowed",
        opacity: active ? 1 : 0.6,
        boxShadow: highlighted ? theme.custom.shadow : "none",
        transform: highlighted ? "translateY(-2px)" : "none",
        transition: "transform 0.15s, box-shadow 0.15s, border-color 0.15s",
        "&:hover": active ? { boxShadow: theme.custom.shadow } : undefined,
      }}
    >
      {/* Left accent stripe — coloured by OE health. */}
      <Box
        sx={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: 4,
          backgroundColor: accent,
        }}
      />

      <Stack direction="row" spacing={1.5} alignItems="center">
        {/* Initial avatar */}
        <Box
          sx={{
            width: 40,
            height: 40,
            flexShrink: 0,
            borderRadius: "50%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 16,
            fontWeight: 700,
            border: 1,
            color: active ? "primary.main" : "text.secondary",
            backgroundColor: active ? "primary.light" : theme.custom.surface.soft,
            borderColor: active ? "primary.main" : "divider",
          }}
        >
          {initial}
        </Box>

        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography sx={{ fontSize: 16, fontWeight: 700, lineHeight: 1.2 }}>
            {plant.name}
          </Typography>
          <Typography sx={{ fontSize: 12, color: "text.disabled" }}>
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

      <Stack direction="row" spacing={1} sx={{ mt: 1.5 }}>
        <KpiCell label="OE" value={plant.oe} color={statusColor(theme, plant.oe)} />
        <KpiCell
          label="OTIF"
          value={plant.otif}
          color={statusColor(theme, plant.otif)}
        />
        <KpiCell
          label="Yield"
          value={plant.yield}
          color={statusColor(theme, plant.yield)}
        />
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

function KpiCell({ label, value, color }) {
  // Missing live DB value: show NA, never a fabricated number.
  const hasValue = typeof value === "number" && Number.isFinite(value);
  return (
    <Box
      sx={{
        flex: 1,
        textAlign: "center",
        py: 0.75,
        borderRadius: 1.25,
        backgroundColor: "action.hover",
      }}
    >
      <Typography
        sx={{
          fontSize: 18,
          fontWeight: 700,
          lineHeight: 1,
          color: hasValue ? color : "text.disabled",
        }}
      >
        {hasValue ? value : "NA"}
        {hasValue && (
          <Typography
            component="span"
            sx={{ fontSize: 11, color: "text.disabled", ml: 0.25 }}
          >
            %
          </Typography>
        )}
      </Typography>
      <Typography
        sx={{
          fontSize: 10,
          color: "text.disabled",
          textTransform: "uppercase",
          letterSpacing: 0.6,
          mt: 0.5,
        }}
      >
        {label}
      </Typography>
    </Box>
  );
}

export default PlantCard;
