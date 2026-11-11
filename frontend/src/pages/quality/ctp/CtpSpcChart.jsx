import { Box, Tooltip, Typography } from "@mui/material";
import { Card } from "@/components/quality/shared/Card.jsx";
import { C } from "@/components/quality/shared/theme.js";
import {
  spcChartGuides,
  spcGuideLabelLayout,
  spcLinePath,
} from "@/lib/spcCharts.js";

const format = (value) =>
  Number.isFinite(value)
    ? value.toLocaleString("en-IN", { maximumFractionDigits: 4 })
    : "—";

/** CTP chart presentation only; all limits, points and rule hits come from API. */
export default function CtpSpcChart({
  process,
  range = false,
  activeRule = null,
}) {
  const chart = process.chart;
  const title = range ? "Range readings" : "X̄ control chart";
  const points = chart.points.map((p) => ({
    ...p,
    value: range ? p.range : p.value,
  }));
  const guides = range ? [] : spcChartGuides(chart);
  const values = [
    ...points.map((p) => p.value),
    ...guides.map((g) => g.value),
  ].filter(Number.isFinite);
  const W = 960,
    H = 300,
    left = 72,
    right = 160,
    top = 20,
    bottom = 55;
  const width = W - left - right,
    height = H - top - bottom;
  const low = Math.min(...values),
    high = Math.max(...values);
  const pad = values.length
    ? (high - low) * 0.12 || Math.max(Math.abs(low) * 0.02, 0.1)
    : 1;
  const min = low - pad,
    max = high + pad;
  const x = (i) =>
    left + (points.length > 1 ? i / (points.length - 1) : 0.5) * width;
  const y = (v) => top + height - ((v - min) / (max - min)) * height;
  const labels = spcGuideLabelLayout(guides, y, {
    top,
    bottom: top + height,
    gap: 19,
  });
  const tickCount = Math.min(5, points.length);
  const tickIndexes = new Set(
    Array.from({ length: tickCount }, (_, i) =>
      Math.round((i * (points.length - 1)) / Math.max(1, tickCount - 1)),
    ),
  );
  return (
    <Card title={title} accent={C.bl}>
      <Typography variant="body2" sx={{ color: C.md, mb: 1, fontSize: 12 }}>
        {range
          ? "Published subgroup ranges. R-chart control limits are not published; no range-rule assessment is shown."
          : "Published baseline limits stay fixed. Hover or focus a point for its reading and Nelson rules."}
      </Typography>
      {!points.some((point) => Number.isFinite(point.value)) ? (
        <Typography sx={{ py: 4, color: C.md }} role="status">
          No {range ? "range" : "X̄"} readings for this selection.
        </Typography>
      ) : (
        <Box
          role="region"
          aria-label={`Scrollable ${title}`}
          tabIndex={0}
          sx={{
            overflowX: "auto",
            "&:focus-visible": { outline: `2px solid ${C.bl}` },
          }}
        >
          <Box
            component="svg"
            viewBox={`0 0 ${W} ${H}`}
            role="group"
            aria-label={`${title} — ${process.machine}, ${process.parameter}`}
            sx={{ display: "block", width: "100%", minWidth: 960, color: C.md }}
          >
            <desc>
              {process.unit ? `Values in ${process.unit}. ` : ""}Readings
              ordered as published. Missing readings break the line.
            </desc>
            {[0, 1, 2, 3, 4].map((i) => {
              const value = min + ((max - min) * i) / 4;
              return (
                <g key={i}>
                  <line
                    x1={left}
                    x2={W - right}
                    y1={y(value)}
                    y2={y(value)}
                    stroke={C.bd}
                  />
                  <text
                    x={left - 10}
                    y={y(value) + 4}
                    textAnchor="end"
                    fill={C.md}
                    fontSize={12}
                  >
                    {format(value)}
                  </text>
                </g>
              );
            })}
            {labels.map((guide) => {
              const color =
                guide.kind === "control"
                  ? C.rd
                  : guide.kind === "spec"
                    ? C.am
                    : C.gn;
              return (
                <g key={guide.key}>
                  <line
                    x1={left}
                    x2={W - right}
                    y1={guide.anchorY}
                    y2={guide.anchorY}
                    stroke={color}
                    strokeDasharray={
                      guide.kind === "centre" ? undefined : "6 4"
                    }
                    strokeWidth={1.4}
                  />
                  <path
                    d={`M${W - right},${guide.anchorY} L${W - right + 12},${guide.labelY}`}
                    fill="none"
                    stroke={color}
                  />
                  <text
                    x={W - right + 17}
                    y={guide.labelY + 4}
                    fill={color}
                    fontSize={12}
                    fontWeight={600}
                  >
                    {guide.label} {format(guide.value)}
                  </text>
                </g>
              );
            })}
            <path
              d={spcLinePath(points, x, y)}
              fill="none"
              stroke={C.bl}
              strokeWidth={2}
            />
            {points.map((point, i) => {
              if (!Number.isFinite(point.value)) return null;
              const flagged = !range && point.rules?.length > 0;
              const highlighted =
                !range &&
                activeRule !== null &&
                point.rules?.includes(activeRule);
              const color = flagged ? C.rd : C.bl;
              const description = `Point ${point.index}, ${point.time ?? "time unavailable"}, ${format(point.value)}${process.unit ? ` ${process.unit}` : ""}`;
              return (
                <Tooltip
                  key={point.index}
                  arrow
                  placement="top"
                  title={
                    <Box sx={{ p: 0.5 }}>
                      <Typography sx={{ fontSize: 12, fontWeight: 700 }}>
                        {point.time ?? `Point ${point.index}`}
                      </Typography>
                      <Typography sx={{ fontSize: 12 }}>
                        {range ? "Range" : "X̄"}: {format(point.value)}{" "}
                        {process.unit ?? ""}
                      </Typography>
                      <Typography sx={{ fontSize: 12 }}>
                        Shift {point.shift ?? "—"} · Point {point.index}
                      </Typography>
                      {!range && (
                        <Typography sx={{ fontSize: 12 }}>
                          {flagged
                            ? `Nelson rules: ${point.rules.join(", ")}`
                            : chart.rules.some((r) => r.evaluated)
                              ? "No Nelson violation at this point"
                              : "Nelson rules not evaluated"}
                        </Typography>
                      )}
                    </Box>
                  }
                >
                  <Box
                    component="circle"
                    cx={x(i)}
                    cy={y(point.value)}
                    r={highlighted ? 7 : flagged ? 5 : 3.5}
                    fill={color}
                    stroke={highlighted ? C.tx : C.cd}
                    strokeWidth={highlighted ? 2.5 : 1}
                    tabIndex={0}
                    role="img"
                    aria-label={description}
                    sx={{
                      opacity:
                        activeRule !== null && !range && !highlighted
                          ? 0.35
                          : 1,
                      "&:focus-visible": {
                        outline: `2px solid ${C.tx}`,
                        outlineOffset: "3px",
                      },
                    }}
                  />
                </Tooltip>
              );
            })}
            {points.map((point, i) =>
              tickIndexes.has(i) ? (
                <text
                  key={point.index}
                  x={x(i)}
                  y={H - 29}
                  textAnchor="middle"
                  fill={C.md}
                  fontSize={11}
                >
                  {point.time?.slice(5) ?? `#${point.index}`}
                </text>
              ) : null,
            )}
            <text x={left} y={H - 6} fill={C.md} fontSize={11}>
              {process.unit ?? "Unit not published"}
            </text>
            <text
              x={W - right}
              y={H - 6}
              textAnchor="end"
              fill={C.md}
              fontSize={11}
            >
              Published timestamp
            </text>
          </Box>
        </Box>
      )}
      <Typography
        sx={{
          display: { xs: "block", md: "none" },
          mt: 1,
          fontSize: 12,
          color: C.md,
        }}
      >
        Scroll horizontally to see the full chart and limit labels.
      </Typography>
      {!range && (
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 2, mt: 1 }}>
          <Typography sx={{ fontSize: 12, color: C.bl }}>Readings</Typography>
          <Typography sx={{ fontSize: 12, color: C.rd }}>
            UCL / LCL: control limits
          </Typography>
          <Typography sx={{ fontSize: 12, color: C.gn }}>
            CL: baseline centre
          </Typography>
          <Typography sx={{ fontSize: 12, color: C.am }}>
            USL / LSL: specification limits
          </Typography>
        </Box>
      )}
    </Card>
  );
}
