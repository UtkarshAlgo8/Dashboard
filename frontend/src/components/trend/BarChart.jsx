import { Box, useTheme } from "@mui/material";

const W = 760;
const H = 280;
const PAD = { top: 24, right: 24, bottom: 36, left: 44 };

/**
 * Minimal SVG bar chart for the Trend modal. Same target line +
 * BEST / WORST markers as LineChart per BRD FR-X14.
 */
function BarChart({ labels, values, unit, target }) {
  const theme = useTheme();
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;

  if (!values.length) return null;

  const max = Math.max(...values, target ?? -Infinity);
  const min = Math.min(0, ...values);
  const range = max - min || 1;
  const slot = innerW / values.length;
  const barW = Math.max(slot * 0.55, 4);
  const xCenter = (i) => PAD.left + slot * i + slot / 2;
  const y = (v) => PAD.top + innerH - ((v - min) / range) * innerH;
  const baseY = y(0);

  const bestIdx = values.indexOf(Math.max(...values));
  const worstIdx = values.indexOf(Math.min(...values));

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
                {gv.toFixed(0)}
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

        {/* Bars */}
        {values.map((v, i) => {
          const isBest = i === bestIdx;
          const isWorst = i === worstIdx;
          const fill = isBest
            ? theme.custom.brand.green
            : isWorst
              ? theme.custom.brand.red
              : theme.palette.primary.main;
          return (
            <rect
              key={i}
              x={xCenter(i) - barW / 2}
              y={Math.min(y(v), baseY)}
              width={barW}
              height={Math.abs(baseY - y(v))}
              fill={fill}
              rx={2}
              opacity={0.9}
            />
          );
        })}

        {/* Best / Worst labels */}
        <text
          x={xCenter(bestIdx)}
          y={y(values[bestIdx]) - 6}
          textAnchor="middle"
          fontSize="9"
          fontWeight={700}
          fill={theme.custom.brand.green}
        >
          BEST {values[bestIdx]}
          {unit ?? ""}
        </text>
        <text
          x={xCenter(worstIdx)}
          y={y(values[worstIdx]) - 6}
          textAnchor="middle"
          fontSize="9"
          fontWeight={700}
          fill={theme.custom.brand.red}
        >
          WORST {values[worstIdx]}
          {unit ?? ""}
        </text>

        {/* X axis labels */}
        {labels.map((label, i) => (
          <text
            key={i}
            x={xCenter(i)}
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

export default BarChart;
