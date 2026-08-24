import { Box, Stack, Typography, useTheme } from "@mui/material";
import { SP, MAP_W, MAP_H } from "@/lib/indiaMap.js";

/**
 * India SVG map with plant markers (BRD FR-L4 through FR-L8).
 * State paths come from src/lib/indiaMap.js (ported verbatim from
 * docs/artifact.jsx — GeoJSON-derived).
 *
 * Hover / select reciprocity with the plant cards: hovering a marker
 * calls `onHover(plantId)`; the parent uses the same `hov`/`sel`
 * state to highlight both the card and the marker.
 */
function IndiaMap({
  plants,
  activePlantIds,
  hov,
  sel,
  onHover,
  onLeave,
  onSelect,
}) {
  const theme = useTheme();
  const accent = theme.palette.primary.main;
  const muted = theme.palette.divider;
  const outline = theme.palette.common.black;
  const fill = theme.custom.surface.soft;

  // The focused plant drives the zoom + info card: the HOVERED plant
  // takes priority, otherwise the SELECTED one — so the map stays zoomed
  // into a city while its card is selected, even after the mouse leaves.
  const find = (id) =>
    id && plants ? (plants.find((p) => p.id === id) ?? null) : null;
  const focusPlant = find(hov) ?? find(sel);
  const focusActive = focusPlant ? activePlantIds.has(focusPlant.id) : false;
  const zoomed = Boolean(focusPlant && focusActive);

  // Enlarge the map AROUND the focused city, keeping that point FIXED in
  // place (it does not move to the centre). Keeping the hovered marker
  // under the cursor avoids the hover→move→unhover flicker loop. The
  // enlarged content extends beyond the fixed box (SVG doesn't clip) up to
  // the parent panel, which clips it so it never spills onto the page.
  const ZOOM = 2.8;
  const zoomTransform = zoomed
    ? `translate(${focusPlant.sx * (1 - ZOOM)} ${
        focusPlant.sy * (1 - ZOOM)
      }) scale(${ZOOM})`
    : undefined;

  // Project a map point to its on-screen position under the current zoom
  // (scaling about the focused city, which stays put). Markers are rendered
  // OUTSIDE the zoomed group at a CONSTANT size so they don't balloon.
  const project = (px, py) =>
    zoomed
      ? {
          x: focusPlant.sx + ZOOM * (px - focusPlant.sx),
          y: focusPlant.sy + ZOOM * (py - focusPlant.sy),
        }
      : { x: px, y: py };

  return (
    <Box
      sx={{
        width: "100%",
        maxWidth: 540,
        mx: "auto",
        position: "relative",
        borderRadius: 1.25,
      }}
    >
      <svg
        viewBox={`0 0 ${MAP_W} ${MAP_H}`}
        preserveAspectRatio="xMidYMid meet"
        // overflow visible: the enlarged (zoomed) map isn't cropped at the
        // box edges — it extends outward instead of being cut.
        style={{
          width: "100%",
          height: "auto",
          display: "block",
          overflow: "visible",
        }}
      >
        <defs>
          <filter id="india-outline" x="-5%" y="-5%" width="110%" height="110%">
            <feMorphology
              in="SourceAlpha"
              operator="dilate"
              radius="0.8"
              result="expanded"
            />
            <feComposite
              in="expanded"
              in2="SourceAlpha"
              operator="out"
              result="ring"
            />
            <feFlood floodColor={outline} floodOpacity="0.7" result="color" />
            <feComposite in="color" in2="ring" operator="in" />
          </filter>
        </defs>

        {/* Zoomable content — zooms into the hovered city, resets on leave. */}
        <g
          transform={zoomTransform}
          style={{ transition: "transform 0.45s ease" }}
        >
          {/* Fill layer (light surface fill inside the country) */}
          <g>
            {SP.map((s, i) => (
              <path
                key={`f-${i}`}
                d={s.d}
                fill={fill}
                stroke={muted}
                strokeWidth="0.3"
              />
            ))}
          </g>

          {/* Outline layer (black, visible country border) */}
          <g filter="url(#india-outline)">
            {SP.map((s, i) => (
              <path key={`o-${i}`} d={s.d} fill={outline} stroke="none" />
            ))}
          </g>
        </g>

        {/* Plant markers — OUTSIDE the zoom group, positioned at projected
            coordinates and at a constant size (no scaling when zoomed). */}
        {plants.map((p) => {
          const active = activePlantIds.has(p.id);
          const isH = hov === p.id;
          const isS = sel === p.id;
          const highlight = isH || isS;
          const markerColor = active ? accent : muted;
          const { x, y } = project(p.sx, p.sy);

          return (
            <g
              key={p.id}
              transform={`translate(${x} ${y})`}
              style={{
                cursor: active ? "pointer" : "default",
                transition: "transform 0.45s ease",
              }}
              onMouseEnter={active ? () => onHover(p.id) : undefined}
              onMouseLeave={active ? () => onLeave(p.id) : undefined}
              onClick={
                active
                  ? (e) => {
                      e.stopPropagation();
                      onSelect(p.id);
                    }
                  : undefined
              }
            >
              {/* Fixed transparent hit target — keeps the hover area a
                  CONSTANT size. The pulse rings animate and the dot grows on
                  hover, which would otherwise make the active radius
                  fluctuate. All visuals below ignore pointer events. */}
              <circle cx={0} cy={0} r={16} fill="transparent" />
              <g style={{ pointerEvents: "none" }}>
                {/* Animated pulse rings — only for active plants */}
                {active && (
                  <>
                    <circle
                      cx={0}
                      cy={0}
                      r="14"
                      fill="none"
                      stroke={accent}
                      strokeWidth="1.2"
                      opacity="0.35"
                    >
                      <animate
                        attributeName="r"
                        values="8;18;8"
                        dur="2.5s"
                        repeatCount="indefinite"
                      />
                      <animate
                        attributeName="opacity"
                        values="0.5;0;0.5"
                        dur="2.5s"
                        repeatCount="indefinite"
                      />
                    </circle>
                    <circle
                      cx={0}
                      cy={0}
                      r="10"
                      fill="none"
                      stroke={accent}
                      strokeWidth="0.8"
                      opacity="0.25"
                    >
                      <animate
                        attributeName="r"
                        values="6;14;6"
                        dur="2.5s"
                        repeatCount="indefinite"
                        begin="0.5s"
                      />
                      <animate
                        attributeName="opacity"
                        values="0.4;0;0.4"
                        dur="2.5s"
                        repeatCount="indefinite"
                        begin="0.5s"
                      />
                    </circle>
                  </>
                )}

                {/* Core dot */}
                <circle
                  cx={0}
                  cy={0}
                  r={highlight ? 7 : 5}
                  fill={markerColor}
                  stroke="white"
                  strokeWidth="2"
                  style={{ transition: "r 0.15s" }}
                />

                {/* Label */}
                <text
                  x={10}
                  y={4}
                  fill={active ? theme.palette.text.primary : muted}
                  fontSize="11"
                  fontWeight={highlight ? 700 : 500}
                  style={{
                    pointerEvents: "none",
                    userSelect: "none",
                  }}
                >
                  {p.name.replace(" Plant", "")}
                </text>
              </g>
            </g>
          );
        })}
      </svg>

      {zoomed && (
        <Box
          sx={{
            position: "absolute",
            // The focused city stays fixed at its own position, so anchor
            // the card there and float it just above the marker.
            left: `${(focusPlant.sx / MAP_W) * 100}%`,
            top: `${(focusPlant.sy / MAP_H) * 100}%`,
            transform: "translate(-50%, calc(-100% - 30px))",
            backgroundColor: "background.paper",
            border: 1,
            borderColor: "divider",
            borderRadius: 1.25,
            boxShadow: theme.custom.shadow,
            px: 2,
            py: 1.5,
            minWidth: 220,
            pointerEvents: "none",
            zIndex: 2,
          }}
        >
          <Typography
            sx={{
              fontSize: 14,
              fontWeight: 700,
              color: "primary.main",
              mb: 0.25,
            }}
          >
            {focusPlant.name}
          </Typography>
          <Typography sx={{ fontSize: 12, color: "text.disabled", mb: 1 }}>
            {focusPlant.sub}
          </Typography>
          <Stack direction="row" spacing={2} justifyContent="space-between">
            <KpiMini label="OEE" value={focusPlant.oee} />
            <KpiMini label="OTIF" value={focusPlant.otif} />
            <KpiMini label="YIELD" value={focusPlant.yield} />
          </Stack>
        </Box>
      )}
    </Box>
  );
}

function KpiMini({ label, value }) {
  const displayValue = numericPercent(value);
  const hasValue = displayValue != null;
  return (
    <Box sx={{ textAlign: "center" }}>
      <Typography
        sx={{
          fontSize: 9,
          color: "text.disabled",
          textTransform: "uppercase",
          letterSpacing: 0.6,
          fontWeight: 700,
        }}
      >
        {label}
      </Typography>
      <Typography
        sx={{
          fontSize: 16,
          fontWeight: 700,
          color: hasValue ? "success.main" : "text.disabled",
          lineHeight: 1,
        }}
      >
        {hasValue ? displayValue : "NA"}
        {hasValue && (
          <Typography
            component="span"
            sx={{ fontSize: 10, color: "success.main" }}
          >
            %
          </Typography>
        )}
      </Typography>
    </Box>
  );
}

function numericPercent(value) {
  const n = typeof value === "number" ? value : Number.parseFloat(value);
  return Number.isFinite(n) ? n : null;
}

export default IndiaMap;
