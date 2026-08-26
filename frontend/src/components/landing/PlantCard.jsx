import { Box, Stack, Tooltip, Typography, useTheme } from "@mui/material";
import { formatIndianNumber } from "@/lib/numberFormat.js";

/**
 * Single plant card. Active plants get hover-lift + select
 * interactivity; disabled plants render dimmed with a Tooltip
 * (Q-NAV-01). A left stripe + KPI pills are colour-coded by OEE health.
 *
 * CR-10: 5 KPI tiles (was 3). Top row keeps OEE / OTIF / Yield
 * (current-snapshot). Bottom row adds Cured Tire Production (NOS —
 * the only unit gold carries for it) and Scrap Percentage (total
 * Scrap / Cured Tire Production × 100, both NOS tire counts).
 */
function statusColor(theme, v) {
  const value = numericPercent(v);
  if (value == null) return theme.custom.text.muted;
  if (value >= 90) return theme.custom.brand.green;
  if (value >= 80) return theme.custom.brand.amber;
  return theme.custom.brand.red;
}

function numericPercent(value) {
  const n = typeof value === "number" ? value : Number.parseFloat(value);
  return Number.isFinite(n) ? n : null;
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
  const accent = statusColor(theme, plant.oee);
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
      {/* Left accent stripe — coloured by OEE health. */}
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
            backgroundColor: active
              ? "primary.light"
              : theme.custom.surface.soft,
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

      <Stack spacing={1} sx={{ mt: 1.5 }}>
        <Stack direction="row" spacing={1}>
          <KpiCell
            label="OEE"
            value={plant.oee}
            color={statusColor(theme, plant.oee)}
          />
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
        <Stack direction="row" spacing={1}>
          <KpiCellCuredTyre nos={plant.curedTyreProduction} />
          <KpiCellScrapPct pct={plant.scrapPct} />
        </Stack>
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
  const displayValue = numericPercent(value);
  const hasValue = displayValue != null;
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
        {hasValue ? displayValue : "NA"}
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

// Cured Tire Production tile. Gold stores this KPI in NOS only —
// every Curing / "Cured Tyre" row (Production, Production_product,
// Production_m, Scrap, Rework, Curing_Plan) carries
// unit_of_measurement = 'NOS' and there is no mass field to convert
// from, so the tile shows the raw count with no unit toggle.
function KpiCellCuredTyre({ nos }) {
  const hasValue = typeof nos === "number" && Number.isFinite(nos) && nos >= 0;
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
          color: hasValue ? "text.primary" : "text.disabled",
        }}
      >
        {hasValue ? formatIndianNumber(Math.round(nos)) : "NA"}
        {hasValue && (
          <Typography
            component="span"
            sx={{ fontSize: 11, color: "text.disabled", ml: 0.25 }}
          >
            NOS
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
        Cured Tire
      </Typography>
    </Box>
  );
}

// CR-10: Scrap Percentage tile. Shows "—" with an inline tooltip
// when the denominator (Cured Tire Production) is 0 in the selected
// window — the backend sets scrapPct to null in that case.
function KpiCellScrapPct({ pct }) {
  const hasValue = typeof pct === "number" && Number.isFinite(pct) && pct >= 0;
  const body = (
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
          color: hasValue
            ? pct >= 1
              ? "warning.main"
              : "text.primary"
            : "text.disabled",
        }}
      >
        {hasValue ? pct.toFixed(2) : "—"}
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
        Scrap %
      </Typography>
    </Box>
  );
  if (hasValue) return body;
  return (
    <Tooltip
      title="No Cured Tire production in the selected window — Scrap % needs a denominator."
      placement="top"
      arrow
    >
      <Box sx={{ flex: 1 }}>{body}</Box>
    </Tooltip>
  );
}

export default PlantCard;
