import { Box, IconButton, Tooltip } from "@mui/material";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import { numericKpiValue } from "@/components/quality/shared/qualityKpi.js";
import { formatIndianNumber } from "@/lib/numberFormat.js";
import { C, ChevronIcon, TrendIcon } from "./reliabilityShared.jsx";

// Decorative accents distinguish cards; they do not indicate KPI status.
const ACCENTS = {
  calibration: C.bl,
  "stock-cost": C.pp,
  pm: C.cy,
  daily: C.am,
  safety: C.gn,
};

/** Link cards keep the Maintenance grid's accent and scale without implying a KPI value. */
export function MaintenanceLinkCard({ name, accent, description, href }) {
  return (
    <Box
      component="a"
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`${name} — open maintenance app in a new tab`}
      sx={{
        background: C.cd,
        borderRadius: "10px",
        border: `1px solid ${C.bd}`,
        borderLeft: `4px solid ${accent}`,
        boxShadow: C.sh,
        padding: "14px 16px",
        display: "flex",
        flexDirection: "column",
        gap: 1,
        minWidth: 0,
        minHeight: 140,
        textDecoration: "none",
        color: "inherit",
        transition: "box-shadow 160ms ease, border-color 160ms ease",
        "&:hover": { borderColor: accent, boxShadow: 3 },
        "&:focus-visible": { outline: `2px solid ${C.bl}`, outlineOffset: 2 },
        "@media (prefers-reduced-motion: reduce)": { transition: "none" },
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 1,
        }}
      >
        <Box
          sx={{
            fontSize: 11.5,
            fontWeight: 700,
            letterSpacing: ".05em",
            textTransform: "uppercase",
            color: C.mu,
            lineHeight: 1.4,
          }}
        >
          {name}
        </Box>
        <OpenInNewIcon
          aria-hidden="true"
          sx={{ fontSize: 17, color: accent, flexShrink: 0 }}
        />
      </Box>
      <Box
        sx={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          gap: 0.5,
        }}
      >
        <Box
          sx={{ color: C.tx, fontSize: 17, fontWeight: 700, lineHeight: 1.25 }}
        >
          Open maintenance app
        </Box>
        <Box sx={{ color: C.md, fontSize: 12, lineHeight: 1.4 }}>
          {description}
        </Box>
      </Box>
      <Box sx={{ color: accent, fontSize: 11, fontWeight: 700 }}>
        Opens in a new tab
      </Box>
    </Box>
  );
}

/** Temporary Maintenance presentation matching the Engineering summary cards. */
export default function MaintenanceSummaryCard({
  kpi,
  isOpen,
  onToggle,
  onTrend,
}) {
  const number = numericKpiValue(kpi.v);
  const hasValue = number != null;
  const canDrill = Boolean(kpi.drill) && !kpi.isLoading;
  const canTrend = Boolean(
    kpi.trendApi && !kpi.na && !kpi.isLoading && onTrend,
  );
  const caption = [kpi.metricLabel, kpi.periodLabel]
    .filter(Boolean)
    .join(" · ");
  const actionStyle = {
    border: `1px solid ${C.bd}`,
    background: C.c2,
    borderRadius: "4px",
    width: 22,
    height: 22,
    padding: 0,
    color: C.bl,
    flexShrink: 0,
  };

  return (
    <Box
      role={canDrill ? "button" : undefined}
      tabIndex={canDrill ? 0 : undefined}
      aria-expanded={canDrill ? isOpen : undefined}
      aria-busy={kpi.isLoading || kpi.isRefreshing || undefined}
      onClick={canDrill ? onToggle : undefined}
      onKeyDown={
        canDrill
          ? (event) => {
              if (
                event.target === event.currentTarget &&
                (event.key === "Enter" || event.key === " ")
              ) {
                event.preventDefault();
                onToggle();
              }
            }
          : undefined
      }
      sx={{
        background: C.cd,
        borderRadius: "10px",
        border: `1px solid ${C.bd}`,
        borderLeft: `4px solid ${ACCENTS[kpi.id] ?? C.bl}`,
        boxShadow: C.sh,
        padding: "14px 16px",
        display: "flex",
        flexDirection: "column",
        gap: "6px",
        minWidth: 0,
        minHeight: 140,
        cursor: canDrill ? "pointer" : "default",
        "&:focus-visible": { outline: `2px solid ${C.bl}`, outlineOffset: 2 },
      }}
    >
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 1,
        }}
      >
        <Box
          sx={{
            fontSize: 11.5,
            fontWeight: 700,
            letterSpacing: ".05em",
            textTransform: "uppercase",
            color: C.mu,
            lineHeight: 1.4,
            minWidth: 0,
          }}
        >
          {kpi.n}
        </Box>
        <Box
          sx={{
            display: "flex",
            gap: "6px",
            alignItems: "center",
            flexShrink: 0,
          }}
        >
          {kpi.ragInfo?.length > 0 && (
            <Tooltip
              arrow
              title={
                <Box>
                  {kpi.ragInfo.map((line) => (
                    <Box key={line}>{line}</Box>
                  ))}
                </Box>
              }
            >
              <IconButton
                aria-label={`About ${kpi.n}`}
                size="small"
                onClick={(event) => event.stopPropagation()}
                sx={actionStyle}
              >
                <InfoOutlinedIcon sx={{ fontSize: 14 }} />
              </IconButton>
            </Tooltip>
          )}
          {canTrend && (
            <Tooltip title="View trend" arrow>
              <IconButton
                aria-label={`View ${kpi.n} trend`}
                size="small"
                onClick={(event) => {
                  event.stopPropagation();
                  onTrend(kpi);
                }}
                sx={actionStyle}
              >
                <TrendIcon />
              </IconButton>
            </Tooltip>
          )}
          {canDrill && (
            <Box component="span" sx={{ color: C.mu, display: "flex" }}>
              <ChevronIcon open={isOpen} />
            </Box>
          )}
        </Box>
      </Box>
      <Box
        sx={{
          fontSize: 24,
          lineHeight: 1.2,
          fontWeight: 700,
          color: C.tx,
          overflowWrap: "anywhere",
        }}
      >
        {hasValue
          ? `${kpi.valuePrefix ?? ""}${formatIndianNumber(number)}`
          : "—"}
        {hasValue && kpi.u && (
          <Box
            component="span"
            sx={{
              fontSize: 13,
              fontWeight: 600,
              color: C.mu,
              ml: kpi.u === "%" ? 0 : 0.5,
            }}
          >
            {kpi.u}
          </Box>
        )}
      </Box>
      {caption && (
        <Box
          sx={{ fontSize: 11, fontWeight: 500, lineHeight: 1.4, color: C.md }}
        >
          {caption}
        </Box>
      )}
      {kpi.subLine?.text && (
        <Box
          sx={{
            fontSize: 11.5,
            fontWeight: 600,
            color: kpi.subLine.alert ? C.rd : C.md,
          }}
        >
          {kpi.subLine.text}
        </Box>
      )}
      {hasValue && Number.isFinite(kpi.trendPct) && (
        <Box sx={{ fontSize: 11.5, fontWeight: 600, color: C.md }}>
          {`${kpi.trendPct > 0 ? "+" : ""}${kpi.trendPct.toFixed(1)}% ${kpi.trendBaseline ?? "vs prev"}`}
        </Box>
      )}
      {!hasValue && (
        <Box sx={{ fontSize: 11.5, color: C.md, lineHeight: 1.4 }}>
          {kpi.emptyReason}
        </Box>
      )}
    </Box>
  );
}
