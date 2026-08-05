import { Box, Stack, Tooltip, Typography, useTheme } from "@mui/material";
import { motion } from "framer-motion";
import JKLoader from "@/components/JKLoader.jsx";

/**
 * Left vertical section sidebar (BRD FR-P4). Each row shows an OEE
 * donut ring with the section's stable OVERALL OEE centered + section name.
 * Hovering a row reveals the Availability / Performance / Quality breakdown.
 * Down-chevrons between rows denote the process flow (Mixing → Stock
 * → TBM → Curing), per docs/artifact.jsx. While the section OEE refetches
 * (e.g. a month change) the rings are replaced by a loader.
 */
function SectionSidebar({
  sections,
  activeSectionId,
  onSelect,
  statsBySectionId,
  loading = false,
}) {
  return (
    <Stack spacing={0}>
      <Typography
        sx={{
          // Big heading matching the render-box header, with a full-width
          // border-bottom (negative mx cancels the sidebar card's padding).
          fontSize: 17,
          fontWeight: 700,
          color: "text.primary",
          mx: -1,
          px: 2,
          py: 1.25,
          mb: 1,
          borderBottom: 1,
          borderColor: "divider",
        }}
      >
        Sections
      </Typography>
      {loading ? (
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            minHeight: 260,
          }}
        >
          <JKLoader />
        </Box>
      ) : (
        sections.map((s, i) => (
          <Box key={s.id}>
            <SidebarRow
              section={s}
              stats={statsBySectionId?.[s.id] ?? null}
              active={s.id === activeSectionId}
              onClick={() => onSelect(s.id)}
            />
            {i < sections.length - 1 && <FlowArrow />}
          </Box>
        ))
      )}
    </Stack>
  );
}

function SidebarRow({ section, stats, active, onClick }) {
  const theme = useTheme();
  const oee = typeof stats?.oee === "number" ? stats.oee : null;
  const ringColor = oeeColor(theme, oee);
  const row = (
    <Box
      onClick={onClick}
      sx={{
        position: "relative",
        display: "flex",
        alignItems: "center",
        gap: 1.25,
        px: 1.25,
        py: 1,
        borderRadius: 1,
        cursor: "pointer",
        transition: "background-color 0.15s",
        "&:hover": {
          backgroundColor: active ? "transparent" : theme.custom.surface.soft,
        },
      }}
    >
      {/* Active highlight slides between sections (shared layout), with a
          left accent bar — same animated treatment as the nav tabs. */}
      {active && (
        <motion.div
          layoutId="sectionActiveFill"
          transition={{ type: "spring", stiffness: 520, damping: 19, mass: 0.7 }}
          style={{
            position: "absolute",
            inset: 0,
            backgroundColor: theme.palette.primary.light,
            borderRadius: 8,
            borderLeft: `3px solid ${theme.palette.primary.main}`,
            zIndex: 0,
          }}
        />
      )}
      <Box sx={{ position: "relative", zIndex: 1, flexShrink: 0 }}>
        <Ring value={oee} color={ringColor} />
      </Box>
      <Stack spacing={0.1} sx={{ minWidth: 0, position: "relative", zIndex: 1 }}>
        <Typography
          sx={{
            fontSize: 16,
            fontWeight: active ? 700 : 500,
            color: "text.primary",
            lineHeight: 1.1,
          }}
        >
          {section.name}{" "}
          <Typography
            component="span"
            sx={{ fontSize: 11, fontWeight: 500, color: "text.disabled" }}
          >
            (OEE)
          </Typography>
        </Typography>
      </Stack>
    </Box>
  );

  return (
    <Tooltip
      arrow
      placement="right"
      enterDelay={120}
      title={<SectionTooltip name={section.name} oee={oee} stats={stats} />}
      slotProps={{
        tooltip: {
          sx: {
            bgcolor: "background.paper",
            color: "text.primary",
            p: 0,
            maxWidth: "none",
            borderRadius: 2,
            border: 1,
            borderColor: "divider",
            boxShadow: 6,
          },
        },
        arrow: { sx: { color: "background.paper" } },
      }}
    >
      {row}
    </Tooltip>
  );
}

const METRICS = [
  { key: "availability", label: "Availability", caption: "Up-time" },
  { key: "performance", label: "Performance", caption: "Speed" },
  { key: "quality", label: "Quality", caption: "Yield" },
];

/** Formats an OEE-family metric: 100 → "100", 96.2 → "96.2". */
function fmtPct(v) {
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

/** Rich hover card: overall OEE + Availability / Performance / Quality bars. */
function SectionTooltip({ name, oee, stats }) {
  const theme = useTheme();
  const rows = METRICS.map((m) => ({ ...m, value: stats?.[m.key] })).filter(
    (m) => typeof m.value === "number",
  );
  return (
    <Box sx={{ p: 1.5, width: 244 }}>
      <Typography
        sx={{
          fontSize: 13,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: 0.4,
          color: "text.primary",
        }}
      >
        {name}
      </Typography>
      <Stack direction="row" alignItems="center" spacing={0.75} sx={{ mb: 1.5 }}>
        <Box
          sx={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            bgcolor: oeeColor(theme, oee),
          }}
        />
        <Typography sx={{ fontSize: 12, color: "text.secondary" }}>
          OEE: {oee == null ? "–" : fmtPct(oee)}
        </Typography>
      </Stack>
      {rows.length === 0 ? (
        <Typography sx={{ fontSize: 11.5, color: "text.disabled" }}>
          No breakdown available for this section.
        </Typography>
      ) : (
        <Stack spacing={1.25}>
          {rows.map((m) => (
            <MetricBar
              key={m.key}
              label={m.label}
              caption={m.caption}
              value={m.value}
            />
          ))}
        </Stack>
      )}
    </Box>
  );
}

function MetricBar({ label, caption, value }) {
  const theme = useTheme();
  const color = oeeColor(theme, value);
  const pct = Math.max(0, Math.min(100, value));
  return (
    <Box>
      <Stack
        direction="row"
        alignItems="flex-end"
        justifyContent="space-between"
        sx={{ mb: 0.5 }}
      >
        <Box>
          <Typography
            sx={{
              fontSize: 11,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: 0.4,
              color: "text.primary",
              lineHeight: 1.2,
            }}
          >
            {label}
          </Typography>
          <Typography sx={{ fontSize: 11, color: "text.disabled", lineHeight: 1.2 }}>
            {caption}
          </Typography>
        </Box>
        <Typography sx={{ fontSize: 15, fontWeight: 700, color: "text.primary" }}>
          {fmtPct(value)}%
        </Typography>
      </Stack>
      <Box
        sx={{
          height: 6,
          borderRadius: 3,
          bgcolor: theme.palette.action.disabledBackground,
          overflow: "hidden",
        }}
      >
        <Box sx={{ width: `${pct}%`, height: "100%", bgcolor: color }} />
      </Box>
    </Box>
  );
}

function Ring({ value, color, size = 44, stroke = 4 }) {
  const theme = useTheme();
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = value == null ? 0 : Math.max(0, Math.min(100, value));
  const dash = (pct / 100) * c;
  const trackColor = theme.palette.action.disabledBackground;
  return (
    <Box
      sx={{ position: "relative", width: size, height: size, flexShrink: 0 }}
    >
      <svg width={size} height={size}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={trackColor}
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeDasharray={`${dash} ${c}`}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <Box
        sx={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 10.5,
          fontWeight: 700,
          color,
        }}
      >
        {value == null ? "–" : value.toFixed(1)}
      </Box>
    </Box>
  );
}

function FlowArrow() {
  const theme = useTheme();
  const stroke = theme.palette.divider;
  return (
    <Box
      sx={{
        display: "flex",
        justifyContent: "center",
        py: 0.25,
      }}
    >
      <svg width="8" height="12" viewBox="0 0 12 16">
        <path
          d="M6 3v10M4 10l2 3 2-3"
          stroke={stroke}
          strokeWidth="1.5"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </Box>
  );
}

function oeeColor(theme, value) {
  // Thresholds match the section header chip: ≥90 green, ≥80 amber, else red.
  if (value == null) return theme.custom.text.muted;
  if (value >= 90) return theme.custom.brand.green;
  if (value >= 80) return theme.custom.brand.amber;
  return theme.custom.brand.red;
}

export default SectionSidebar;
