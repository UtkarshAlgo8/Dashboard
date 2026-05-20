/**
 * Inline SVG sparkline. Minimal — no axes, no tooltips, no
 * interaction. Used inside KpiCard.
 *
 * @param {object} props
 * @param {number[]} props.data - At least 2 points.
 * @param {number} [props.width=70]
 * @param {number} [props.height=20]
 * @param {string} [props.color] - CSS color (theme palette ref OK).
 */
function Sparkline({ data, width = 70, height = 20, color = "currentColor" }) {
  if (!Array.isArray(data) || data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const points = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * width;
      const y = height - 2 - ((v - min) / range) * (height - 4);
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg width={width} height={height} style={{ display: "block" }}>
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
        opacity={0.85}
      />
    </svg>
  );
}

export default Sparkline;
