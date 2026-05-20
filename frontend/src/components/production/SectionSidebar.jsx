import { Box, Stack, Typography, useTheme } from "@mui/material";

/**
 * Left vertical section sidebar (BRD FR-P4). Each row shows an OEE
 * donut ring with the score centered + section name + OEE % subtitle.
 * Down-chevrons between rows denote the process flow (Mixing → Stock
 * → TBM → Curing), per docs/artifact.jsx.
 */
function SectionSidebar({ sections, activeSectionId, onSelect }) {
  return (
    <Stack spacing={0}>
      <Typography
        sx={{
          fontSize: 10,
          color: "primary.main",
          textTransform: "uppercase",
          letterSpacing: 1.5,
          fontWeight: 700,
          px: 1.5,
          py: 1,
        }}
      >
        Sections
      </Typography>
      {sections.map((s, i) => (
        <Box key={s.id}>
          <SidebarRow
            section={s}
            active={s.id === activeSectionId}
            onClick={() => onSelect(s.id)}
          />
          {i < sections.length - 1 && <FlowArrow />}
        </Box>
      ))}
    </Stack>
  );
}

function SidebarRow({ section, active, onClick }) {
  const theme = useTheme();
  const oee = typeof section.oee === "number" ? section.oee : null;
  const ringColor = oeeColor(theme, oee);
  return (
    <Box
      onClick={onClick}
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 1.25,
        px: 1.25,
        py: 1,
        borderRadius: 1,
        cursor: "pointer",
        backgroundColor: active ? "primary.light" : "transparent",
        borderLeft: 3,
        borderColor: active ? "primary.main" : "transparent",
        transition: "background-color 0.15s, border-color 0.15s",
        "&:hover": {
          backgroundColor: active ? "primary.light" : theme.custom.surface.soft,
        },
      }}
    >
      <Ring value={oee} color={ringColor} />
      <Stack spacing={0.1} sx={{ minWidth: 0 }}>
        <Typography
          sx={{
            fontSize: 14,
            fontWeight: active ? 700 : 500,
            color: active ? "primary.main" : "text.primary",
            lineHeight: 1.1,
          }}
        >
          {section.name}
        </Typography>
        {oee !== null && (
          <Typography sx={{ fontSize: 11, color: "text.disabled" }}>
            OEE: {oee}%
          </Typography>
        )}
      </Stack>
    </Box>
  );
}

function Ring({ value, color, size = 36, stroke = 3.5 }) {
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
          fontSize: 11,
          fontWeight: 700,
          color,
        }}
      >
        {value == null ? "–" : Math.round(value)}
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
  if (value == null) return theme.custom.text.muted;
  if (value >= 90) return theme.custom.brand.green;
  if (value >= 85) return theme.custom.brand.amber;
  return theme.custom.brand.red;
}

export default SectionSidebar;
