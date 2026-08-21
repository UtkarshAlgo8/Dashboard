import { useState } from "react";
import { Box, Stack, Tooltip, Typography, useTheme } from "@mui/material";
import { formatIndianNumber } from "@/lib/numberFormat.js";

/**
 * Single plant card. Active plants get hover-lift + select
 * interactivity; disabled plants render dimmed with a Tooltip
 * (Q-NAV-01). A left stripe + KPI pills are colour-coded by OEE health.
 *
 * CR-10: 5 KPI tiles (was 3). Top row keeps OEE / OTIF / Yield
 * (current-snapshot). Bottom row adds Cured Tire Production (with a
 * NOS / MT toggle mirroring the production dashboard's BATCH / MT
 * pattern) and Scrap Percentage (computed from total Scrap /
 * Cured Tire Production × 100 — see Q-LP-02 for the MT derivation).
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

// CR-10 / Q-LP-02: average mass per cured tire (kg). Mirrors the
// backend placeholder; revisit when gold carries a true mass field.
const AVG_MASS_PER_TIRE_KG = 10;

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

// CR-10: Cured Tire Production tile. NOS is the raw sum from the
// backend; MT is derived client-side (NOS * AVG_MASS_PER_TIRE_KG /
// 1000). Small NOS / MT pill toggle mirrors the production dashboard's
// BATCH / MT pattern. State lives inside the cell so the toggle
// doesn't disturb sibling tiles.
function KpiCellCuredTyre({ nos }) {
  const [unit, setUnit] = useState("nos");
  const hasValue = typeof nos === "number" && Number.isFinite(nos) && nos >= 0;
  const mt = hasValue ? (nos * AVG_MASS_PER_TIRE_KG) / 1000 : null;
  const displayValue = unit === "nos" ? nos : mt;
  const unitLabel = unit === "nos" ? "NOS" : "MT";
  return (
    <Box
      sx={{
        flex: 1,
        textAlign: "center",
        py: 0.75,
        borderRadius: 1.25,
        backgroundColor: "action.hover",
        position: "relative",
      }}
    >
      <Box
        sx={{
          position: "absolute",
          top: 4,
          right: 4,
          display: "flex",
          border: 1,
          borderColor: "divider",
          borderRadius: 1,
          overflow: "hidden",
          backgroundColor: "background.paper",
        }}
      >
        {[
          { id: "nos", label: "NOS" },
          { id: "mt", label: "MT" },
        ].map((opt) => {
          const active = unit === opt.id;
          return (
            <Box
              key={opt.id}
              component="button"
              type="button"
              onClick={() => setUnit(opt.id)}
              sx={{
                fontSize: 9,
                fontWeight: 700,
                px: 0.5,
                py: 0.1,
                color: active ? "primary.main" : "text.disabled",
                backgroundColor: active ? "primary.light" : "transparent",
                border: "none",
                cursor: "pointer",
                fontFamily: "inherit",
                letterSpacing: 0.4,
              }}
            >
              {opt.label}
            </Box>
          );
        })}
      </Box>
      <Typography
        sx={{
          fontSize: 18,
          fontWeight: 700,
          lineHeight: 1,
          color: hasValue ? "text.primary" : "text.disabled",
        }}
      >
        {hasValue && displayValue != null
          ? formatIndianNumber(Math.round(displayValue))
          : "NA"}
        {hasValue && (
          <Typography
            component="span"
            sx={{ fontSize: 11, color: "text.disabled", ml: 0.25 }}
          >
            {unitLabel}
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
