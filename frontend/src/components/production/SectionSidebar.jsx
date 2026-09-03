import {
  Box,
  Divider,
  Stack,
  SvgIcon,
  Tooltip,
  Typography,
  useTheme,
} from "@mui/material";
import JKLoader from "@/components/JKLoader.jsx";

/**
 * 3/4 Solid Circular Pie Icon (270° solid wedge with top-right quadrant open)
 * Matching the Adobe XD design system spec.
 */
function SectionPieIcon(props) {
  return (
    <SvgIcon viewBox="0 0 24 24" {...props}>
      <path d="M 12 12 L 12 4 A 8 8 0 1 0 20 12 Z" fill="currentColor" />
    </SvgIcon>
  );
}

const SECTION_DISPLAY_NAMES = {
  cur: "Curing",
  tbm: "Tyre Building",
  stk: "Stock",
  mix: "Mixing",
};

const SECTION_ORDER = ["cur", "tbm", "stk", "mix"];

/**
 * Adobe XD Section Sidebar
 *
 * Each row displays:
 * - Section Name (Mixing, Stock, Tyre Building, Curing)
 * - Donut/Pie status icon + colored OEE label (e.g. OEE: 82.5%)
 * - Active row gets a soft light blue fill
 */
function SectionSidebar({
  sections = [],
  activeSectionId,
  onSelect,
  statsBySectionId = {},
  loading = false,
}) {
  const theme = useTheme();

  // Normalize sections list to adhere to canonical order and names
  const sectionList = [...sections].sort((a, b) => {
    const idxA = SECTION_ORDER.indexOf(a.id);
    const idxB = SECTION_ORDER.indexOf(b.id);
    if (idxA !== -1 && idxB !== -1) return idxA - idxB;
    return 0;
  });

  return (
    <Box
      sx={{
        backgroundColor: "background.paper",
        border: 1,
        borderColor: "rgba(0,0,0,0.06)",
        borderRadius: 2.5,
        p: 2,
        height: "100%",
        display: "flex",
        flexDirection: "column",
        boxShadow: theme.custom.shadow,
      }}
    >
      <Typography
        sx={{
          fontSize: 17,
          fontWeight: 700,
          color: "text.primary",
          px: 0.5,
          pb: 1.5,
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
            minHeight: 220,
          }}
        >
          <JKLoader />
        </Box>
      ) : (
        <Stack spacing={0}>
          {sectionList.map((s, idx) => {
            const stats = statsBySectionId?.[s.id] ?? null;
            const oee = typeof stats?.oee === "number" ? stats.oee : null;
            const active = s.id === activeSectionId;
            const displayName = SECTION_DISPLAY_NAMES[s.id] || s.name;
            return (
              <Box key={s.id}>
                {idx > 0 && (
                  <Divider
                    sx={{ my: 0.5, borderColor: "divider", opacity: 0.6 }}
                  />
                )}
                <SidebarRow
                  section={{ ...s, name: displayName }}
                  oee={oee}
                  stats={stats}
                  active={active}
                  onClick={() => onSelect(s.id)}
                />
              </Box>
            );
          })}
        </Stack>
      )}
    </Box>
  );
}

function SidebarRow({ section, oee, stats, active, onClick }) {
  const theme = useTheme();
  const color = getOeeColor(theme, oee);

  return (
    <Tooltip
      arrow
      placement="right"
      enterDelay={150}
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
            borderColor: "rgba(0,0,0,0.06)",
            boxShadow: theme.custom.shadow,
          },
        },
        arrow: { sx: { color: "background.paper" } },
      }}
    >
      <Box
        onClick={onClick}
        sx={{
          position: "relative",
          display: "flex",
          flexDirection: "column",
          gap: 0.5,
          px: 2,
          py: 1.5,
          borderRadius: 2,
          cursor: "pointer",
          backgroundColor: active ? theme.custom.pills.activeBg : "transparent",
          transition: "all 0.15s ease",
          "&:hover": {
            backgroundColor: active
              ? theme.custom.pills.activeBg
              : theme.custom.surface.soft,
          },
        }}
      >
        {/* Row Title */}
        <Typography
          sx={{
            fontSize: 16,
            fontWeight: active ? 700 : 600,
            color: "text.primary",
            lineHeight: 1.2,
          }}
        >
          {section.name}
        </Typography>

        {/* Status Line: Small Solid 3/4 Pie Icon + OEE label */}
        <Stack
          direction="row"
          alignItems="center"
          spacing={0.75}
          sx={{ mt: 0.5 }}
        >
          <SectionPieIcon sx={{ fontSize: 17, color }} />
          <Typography
            sx={{
              fontSize: 14,
              fontWeight: 600,
              color,
              lineHeight: 1,
            }}
          >
            OEE: {oee == null ? "–" : `${oee.toFixed(1)}%`}
          </Typography>
        </Stack>
      </Box>
    </Tooltip>
  );
}

function getOeeColor(theme, value) {
  if (value == null) return theme.palette.text.disabled;
  if (value >= 90) return theme.custom.status.green;
  if (value >= 80) return theme.custom.status.amber;
  return theme.custom.status.red;
}

const METRICS = [
  { key: "availability", label: "Availability", caption: "Up-time" },
  { key: "performance", label: "Performance", caption: "Speed" },
  { key: "quality", label: "Quality", caption: "Yield" },
];

function fmtPct(v) {
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

function SectionTooltip({ name, oee, stats }) {
  const theme = useTheme();
  const rows = METRICS.map((m) => ({ ...m, value: stats?.[m.key] })).filter(
    (m) => typeof m.value === "number",
  );
  return (
    <Box sx={{ p: 1.5, width: 230 }}>
      <Typography
        sx={{
          fontSize: 13,
          fontWeight: 700,
          color: "text.primary",
          mb: 0.5,
        }}
      >
        {name}
      </Typography>
      <Stack
        direction="row"
        alignItems="center"
        spacing={0.75}
        sx={{ mb: 1.25 }}
      >
        <SectionPieIcon sx={{ fontSize: 14, color: getOeeColor(theme, oee) }} />
        <Typography
          sx={{ fontSize: 12, color: "text.secondary", fontWeight: 500 }}
        >
          OEE: {oee == null ? "–" : `${fmtPct(oee)}%`}
        </Typography>
      </Stack>
      {rows.length === 0 ? (
        <Typography sx={{ fontSize: 11, color: "text.secondary" }}>
          Breakdown available on drilldown.
        </Typography>
      ) : (
        <Stack spacing={1}>
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
  const pct = Math.max(0, Math.min(100, value ?? 0));
  return (
    <Box>
      <Stack
        direction="row"
        alignItems="baseline"
        justifyContent="space-between"
      >
        <Stack direction="row" spacing={0.5} alignItems="baseline">
          <Typography sx={{ fontSize: 11, fontWeight: 600 }}>
            {label}
          </Typography>
          <Typography sx={{ fontSize: 9.5, color: "text.secondary" }}>
            ({caption})
          </Typography>
        </Stack>
        <Typography sx={{ fontSize: 11, fontWeight: 700 }}>
          {value == null ? "–" : `${fmtPct(value)}%`}
        </Typography>
      </Stack>
      <Box
        sx={{
          mt: 0.25,
          height: 4,
          borderRadius: 2,
          bgcolor: theme.custom.surface.soft,
          overflow: "hidden",
        }}
      >
        <Box
          sx={{
            height: "100%",
            width: `${pct}%`,
            bgcolor: getOeeColor(theme, pct),
          }}
        />
      </Box>
    </Box>
  );
}

export default SectionSidebar;
