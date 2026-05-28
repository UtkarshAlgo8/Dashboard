import { useTheme } from "@mui/material";

/**
 * Donut / ring chart — matches artifact budget drill.
 * Shows consumedPct with amber arc color.
 */
export function Donut({ value }) {
  const theme = useTheme();
  const size = 96;
  const stroke = 10;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dash = (value / 100) * c;
  const trackColor = theme.palette.action.disabledBackground;
  const arcColor = theme.custom.brand.amber;
  return (
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
        stroke={arcColor}
        strokeWidth={stroke}
        strokeDasharray={`${dash} ${c}`}
        strokeDashoffset={c / 4}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text
        x="50%"
        y="50%"
        textAnchor="middle"
        dy="0.35em"
        style={{
          fontSize: 18,
          fontWeight: 700,
          fill: "currentColor",
        }}
      >
        {value}%
      </text>
    </svg>
  );
}
