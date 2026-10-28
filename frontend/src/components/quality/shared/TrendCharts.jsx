/** Trend charts behind the Quality KPI trend panels. */
import { C } from "./theme.js";

// At most this many x-axis labels, so long daily ranges stay readable.
const MAX_AXIS_LABELS = 8;

/** Indexes of the x-axis labels to draw: evenly spaced, first and last kept. */
function axisLabelIndexes(n) {
  if (n <= MAX_AXIS_LABELS) return new Set([...Array(n).keys()]);
  const step = Math.ceil((n - 1) / (MAX_AXIS_LABELS - 1));
  const keep = new Set();
  for (let i = 0; i < n - 1; i += step) keep.add(i);
  // Drop the label just before the last one if the two would collide.
  const prev = Math.max(...keep);
  if (prev !== 0 && n - 1 - prev <= step / 2) keep.delete(prev);
  keep.add(n - 1);
  return keep;
}

export function TrendChart({
  labels,
  axisLabels = labels,
  series,
  target,
  color,
  bestIdx,
  worstIdx,
}) {
  const w = 620,
    h = 200,
    padL = 44,
    padR = 16,
    padT = 14,
    padB = 30;
  const hasTarget = Number.isFinite(target);
  const allVals = hasTarget ? [...series, target] : [...series];
  const min = Math.min(...allVals),
    max = Math.max(...allVals);
  const rng = max - min || Math.abs(max) * 0.1 || 1;
  const yMin = min - rng * 0.15,
    yMax = max + rng * 0.2,
    yR = yMax - yMin;
  const cw = w - padL - padR,
    ch = h - padT - padB;
  const xStep = cw / Math.max(labels.length - 1, 1);
  const x = (i) => padL + i * xStep;
  const y = (v) => padT + ch - ((v - yMin) / yR) * ch;
  const pts = series.map((v, i) => x(i) + "," + y(v)).join(" ");
  const area = `${x(0)},${padT + ch} ${pts} ${x(series.length - 1)},${padT + ch}`;
  const fmt2 = (v) =>
    Math.abs(v) < 10 ? v.toFixed(1) : Math.round(v).toString();
  const shownLabels = axisLabelIndexes(axisLabels.length);
  return (
    <svg
      width="100%"
      viewBox={"0 0 " + w + " " + h}
      style={{ display: "block", maxHeight: 240 }}
    >
      {[0, 0.25, 0.5, 0.75, 1].map((p, i) => (
        <line
          key={i}
          x1={padL}
          y1={padT + ch * p}
          x2={padL + cw}
          y2={padT + ch * p}
          stroke={C.bd}
          strokeWidth="0.5"
          strokeDasharray={i === 0 || i === 1 ? "" : "2,3"}
        />
      ))}
      {[0, 0.5, 1].map((p, i) => {
        const v = yMax - (yMax - yMin) * p;
        return (
          <text
            key={i}
            x={padL - 6}
            y={padT + ch * p + 3}
            fontSize="9"
            fill={C.mu}
            textAnchor="end"
          >
            {fmt2(v)}
          </text>
        );
      })}
      <polygon points={area} fill={color} opacity="0.08" />
      {hasTarget && (
        <>
          <line
            x1={padL}
            y1={y(target)}
            x2={padL + cw}
            y2={y(target)}
            stroke={C.am}
            strokeWidth="1.5"
            strokeDasharray="5,4"
          />
          <text
            x={padL + cw - 4}
            y={y(target) - 5}
            fontSize="9"
            fill={C.am}
            fontWeight="700"
            textAnchor="end"
          >
            Target {fmt2(target)}
          </text>
        </>
      )}
      <polyline
        points={pts}
        fill="none"
        stroke={color}
        strokeWidth="2.2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {series.map((v, i) => {
        const isBest = i === bestIdx,
          isWorst = i === worstIdx;
        return (
          <g key={i}>
            <circle
              cx={x(i)}
              cy={y(v)}
              r={isBest || isWorst ? 4.5 : 3}
              fill={isBest ? C.gn : isWorst ? C.rd : color}
              stroke="#fff"
              strokeWidth="1.5"
            >
              <title>{`${labels[i] || "Point " + (i + 1)}: ${fmt2(v)}`}</title>
            </circle>
            {(isBest || isWorst) && (
              <text
                x={x(i)}
                y={y(v) - 9}
                fontSize="8"
                fill={isBest ? C.gn : C.rd}
                fontWeight="700"
                textAnchor="middle"
              >
                {isBest ? "BEST" : "WORST"}
              </text>
            )}
          </g>
        );
      })}
      {axisLabels.map((l, i) =>
        shownLabels.has(i) ? (
          <text
            key={i}
            x={x(i)}
            y={h - padB + 14}
            fontSize="9"
            fill={C.mu}
            textAnchor={
              i === 0 && axisLabels.length > 1
                ? "start"
                : i === axisLabels.length - 1 && axisLabels.length > 1
                  ? "end"
                  : "middle"
            }
          >
            {l}
          </text>
        ) : null,
      )}
    </svg>
  );
}

export function TrendBar({ labels, series, target, color, bestIdx, worstIdx }) {
  const w = 620,
    h = 200,
    padL = 44,
    padR = 16,
    padT = 20,
    padB = 30;
  const allVals = [...series, target];
  const dataMax = Math.max(...allVals);
  const yMin = 0,
    yMax = dataMax * 1.2 || 1,
    yR = yMax - yMin;
  const cw = w - padL - padR,
    ch = h - padT - padB;
  const xStep = cw / series.length;
  const barW = Math.min(48, xStep * 0.62);
  const xPos = (i) => padL + i * xStep + (xStep - barW) / 2;
  const yPos = (v) => padT + ch - ((v - yMin) / yR) * ch;
  const fmt2 = (v) =>
    Math.abs(v) < 10
      ? (Math.round(v * 10) / 10).toString()
      : Math.round(v).toString();
  return (
    <svg
      width="100%"
      viewBox={"0 0 " + w + " " + h}
      style={{ display: "block", maxHeight: 240 }}
    >
      {[0, 0.25, 0.5, 0.75, 1].map((p, i) => (
        <line
          key={i}
          x1={padL}
          y1={padT + ch * p}
          x2={padL + cw}
          y2={padT + ch * p}
          stroke={C.bd}
          strokeWidth="0.5"
          strokeDasharray={p === 1 ? "" : "2,3"}
        />
      ))}
      {[0, 0.5, 1].map((p, i) => {
        const v = yMax - (yMax - yMin) * p;
        return (
          <text
            key={i}
            x={padL - 6}
            y={padT + ch * p + 3}
            fontSize="9"
            fill={C.mu}
            textAnchor="end"
          >
            {fmt2(v)}
          </text>
        );
      })}
      <line
        x1={padL}
        y1={yPos(target)}
        x2={padL + cw}
        y2={yPos(target)}
        stroke={C.am}
        strokeWidth="1.5"
        strokeDasharray="5,4"
      />
      <text
        x={padL + cw - 4}
        y={yPos(target) - 5}
        fontSize="9"
        fill={C.am}
        fontWeight="700"
        textAnchor="end"
      >
        Target {fmt2(target)}
      </text>
      {series.map((v, i) => {
        const isBest = i === bestIdx,
          isWorst = i === worstIdx;
        const bh = Math.max(0, padT + ch - yPos(v));
        const fill = isBest ? C.gn : isWorst ? C.rd : color;
        return (
          <g key={i}>
            <rect
              x={xPos(i)}
              y={yPos(v)}
              width={barW}
              height={bh}
              fill={fill}
              opacity={isBest || isWorst ? 1 : 0.85}
              rx="2.5"
            >
              <title>{`${labels[i] || "Period " + (i + 1)}: ${fmt2(v)}`}</title>
            </rect>
            <text
              x={xPos(i) + barW / 2}
              y={yPos(v) - 4}
              fontSize="8"
              fill={isBest ? C.gn : isWorst ? C.rd : C.tx}
              fontWeight="700"
              textAnchor="middle"
            >
              {fmt2(v)}
            </text>
          </g>
        );
      })}
      {labels.map((l, i) => (
        <text
          key={i}
          x={xPos(i) + barW / 2}
          y={h - padB + 14}
          fontSize="9"
          fill={C.mu}
          textAnchor="middle"
        >
          {l}
        </text>
      ))}
    </svg>
  );
}

export function TrendProgress({
  current,
  target,
  unit,
  color,
  series,
  labels,
}) {
  const pct = target ? Math.min(150, Math.max(0, (current / target) * 100)) : 0;
  const onTarget = pct >= 100;
  const barW = Math.min(100, pct);
  const w = 620,
    h = 70,
    padL = 44,
    padR = 16,
    padT = 8,
    padB = 18;
  const mn = Math.min(...series),
    mx = Math.max(...series),
    rn = mx - mn || 1;
  const cw = w - padL - padR,
    ch = h - padT - padB;
  const xStep = cw / Math.max(series.length - 1, 1);
  const pts = series
    .map((v, i) => padL + i * xStep + "," + (padT + ch - ((v - mn) / rn) * ch))
    .join(" ");
  return (
    <div style={{ padding: "6px 4px" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          fontSize: 13,
          color: C.mu,
          marginBottom: 8,
        }}
      >
        <span style={{ fontWeight: 600 }}>0</span>
        <span style={{ fontWeight: 700, color: C.am }}>
          Target: {target} {unit || ""}
        </span>
      </div>
      <div
        style={{
          position: "relative",
          height: 36,
          background: C.c2,
          borderRadius: 18,
          border: "1px solid " + C.bd,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: barW + "%",
            height: "100%",
            background: onTarget ? C.gn : color,
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            paddingRight: 14,
            transition: "width .4s",
          }}
        >
          <span
            style={{
              fontSize: 15,
              fontWeight: 700,
              color: "#fff",
              whiteSpace: "nowrap",
            }}
          >
            {current} {unit || ""}
          </span>
        </div>
        <div
          style={{
            position: "absolute",
            left:
              Math.min(100, (target / Math.max(current, target)) * 100) + "%",
            top: -3,
            bottom: -3,
            width: 2,
            background: C.am,
            transform: "translateX(-1px)",
          }}
        />
      </div>
      <div
        style={{
          textAlign: "center",
          marginTop: 12,
          fontSize: 16,
          fontWeight: 700,
          color: onTarget ? C.gn : C.tx,
        }}
      >
        {Math.round(pct)}% of target{" "}
        {onTarget && (
          <span
            style={{
              fontSize: 13,
              marginLeft: 6,
              padding: "2px 7px",
              borderRadius: 4,
              background: C.gn + "18",
              color: C.gn,
            }}
          >
            ON TRACK
          </span>
        )}
      </div>
      <div
        style={{
          fontSize: 12,
          color: C.mu,
          fontWeight: 600,
          textTransform: "uppercase",
          marginTop: 14,
          marginBottom: 2,
        }}
      >
        Trajectory
      </div>
      <svg
        width="100%"
        viewBox={"0 0 " + w + " " + h}
        style={{ display: "block", maxHeight: 90 }}
      >
        <polyline
          points={pts}
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeLinejoin="round"
        />
        {series.map((v, i) => (
          <circle
            key={i}
            cx={padL + i * xStep}
            cy={padT + ch - ((v - mn) / rn) * ch}
            r="2.5"
            fill={color}
          >
            <title>{`${labels[i] || "Point " + (i + 1)}: ${v} ${unit || ""}`}</title>
          </circle>
        ))}
        {labels.map((l, i) => (
          <text
            key={i}
            x={padL + i * xStep}
            y={h - padB + 13}
            fontSize="9"
            fill={C.mu}
            textAnchor="middle"
          >
            {l}
          </text>
        ))}
      </svg>
    </div>
  );
}
