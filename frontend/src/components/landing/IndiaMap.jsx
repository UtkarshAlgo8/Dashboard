import { Box, useTheme } from "@mui/material";
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
  const fill = theme.custom.surface.soft;

  return (
    <Box sx={{ width: "100%", maxWidth: 540, mx: "auto" }}>
      <svg
        viewBox={`0 0 ${MAP_W} ${MAP_H}`}
        style={{ width: "100%", height: "auto", display: "block" }}
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
            <feFlood floodColor={muted} floodOpacity="1" result="color" />
            <feComposite in="color" in2="ring" operator="in" />
          </filter>
        </defs>

        {/* Fill layer */}
        <g>
          {SP.map((s, i) => (
            <path key={`f-${i}`} d={s.d} fill={fill} stroke="none" />
          ))}
        </g>

        {/* Outline layer */}
        <g filter="url(#india-outline)">
          {SP.map((s, i) => (
            <path key={`o-${i}`} d={s.d} fill="black" stroke="none" />
          ))}
        </g>

        {/* Plant markers */}
        {plants.map((p) => {
          const active = activePlantIds.has(p.id);
          const isH = hov === p.id;
          const isS = sel === p.id;
          const highlight = isH || isS;
          const markerColor = active ? accent : muted;

          return (
            <g
              key={p.id}
              style={{ cursor: active ? "pointer" : "default" }}
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
              {/* Animated pulse rings — only for active plants */}
              {active && (
                <>
                  <circle
                    cx={p.sx}
                    cy={p.sy}
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
                    cx={p.sx}
                    cy={p.sy}
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
                cx={p.sx}
                cy={p.sy}
                r={highlight ? 7 : 5}
                fill={markerColor}
                stroke="white"
                strokeWidth="2"
                style={{ transition: "r 0.15s" }}
              />

              {/* Label */}
              <text
                x={p.sx + 10}
                y={p.sy + 4}
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
          );
        })}
      </svg>
    </Box>
  );
}

export default IndiaMap;
