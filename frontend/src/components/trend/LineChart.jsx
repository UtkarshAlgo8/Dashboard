import { Box, useTheme } from "@mui/material";

const W = 760;
const H = 280;
const PAD = { top: 24, right: 24, bottom: 36, left: 44 };

/**
 * Minimal SVG line chart for the Trend modal. Plots a polyline +
 * optional dashed amber target line + BEST (green) / WORST (red)
 * markers with labels per BRD FR-X14.
 *
 * Pure SVG, no library. Width is responsive via viewBox.
 */
function LineChart({ labels, values, unit, target }) {
  const theme = useTheme();
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;

  if (!values.length) return null;

  const min = Math.min(...values, target ?? Infinity);
  const max = Math.max(...values, target ?? -Infinity);
  const range = max - min || 1;
  const x = (i) => PAD.left + (i / Math.max(values.length - 1, 1)) * innerW;
  const y = (v) => PAD.top + innerH - ((v - min) / range) * innerH;

  const points = values.map((v, i) => `${x(i)},${y(v)}`).join(" ");
  const bestIdx = values.indexOf(max);
  const worstIdx = values.indexOf(min);

  return (
    <Box sx={{ width: "100%", overflow: "hidden" }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto" }}>
        {/* Y axis grid */}
        {[0, 0.25, 0.5, 0.75, 1].map((t) => {
          const gy = PAD.top + innerH * (1 - t);
          const gv = min + range * t;
          return (
            <g key={t}>
              <line
                x1={PAD.left}
                x2={W - PAD.right}
                y1={gy}
                y2={gy}
                stroke={theme.palette.divider}
                strokeWidth="1"
                strokeDasharray={t === 0 ? "0" : "2 4"}
              />
              <text
                x={PAD.left - 6}
                y={gy + 3}
                textAnchor="end"
                fontSize="10"
                fill={theme.palette.text.disabled}
              >
                {gv.toFixed(1)}
              </text>
            </g>
          );
        })}

        {/* Target line */}
        {target != null && (
          <>
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={y(target)}
              y2={y(target)}
              stroke={theme.custom.brand.amber}
              strokeWidth="1.5"
              strokeDasharray="6 4"
            />
            <text
              x={W - PAD.right}
              y={y(target) - 4}
              textAnchor="end"
              fontSize="10"
              fill={theme.custom.brand.amber}
              fontWeight={700}
            >
              Target {target}
              {unit}
            </text>
          </>
        )}

        {/* Polyline */}
        <polyline
          points={points}
          fill="none"
          stroke={theme.palette.primary.main}
          strokeWidth="2.5"
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {/* Best / Worst markers */}
        <Marker
          x={x(bestIdx)}
          y={y(values[bestIdx])}
          color={theme.custom.brand.green}
          label={`BEST ${values[bestIdx]}${unit ?? ""}`}
        />
        <Marker
          x={x(worstIdx)}
          y={y(values[worstIdx])}
          color={theme.custom.brand.red}
          label={`WORST ${values[worstIdx]}${unit ?? ""}`}
        />

        {/* X axis labels */}
        {labels.map((label, i) => (
          <text
            key={i}
            x={x(i)}
            y={H - PAD.bottom + 16}
            textAnchor="middle"
            fontSize="10"
            fill={theme.palette.text.disabled}
          >
            {label}
          </text>
        ))}
      </svg>
    </Box>
  );
}

function Marker({ x, y, color, label }) {
  return (
    <g>
      <circle
        cx={x}
        cy={y}
        r="5"
        fill={color}
        stroke="white"
        strokeWidth="1.5"
      />
      <text
        x={x}
        y={y - 10}
        textAnchor="middle"
        fontSize="9"
        fontWeight={700}
        fill={color}
      >
        {label}
      </text>
    </g>
  );
}

export default LineChart;
