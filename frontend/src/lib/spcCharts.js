/** SVG paths must preserve missing ranges and production-run boundaries. */
export function spcLinePath(points, x, y) {
  let drawing = false;
  return points
    .map((p, i) => {
      if (!Number.isFinite(p.value)) {
        drawing = false;
        return "";
      }
      const move =
        !drawing ||
        p.break_before ||
        (i > 0 && p.segment != null && p.segment !== points[i - 1].segment);
      drawing = true;
      return `${move ? "M" : "L"}${x(i)},${y(p.value)}`;
    })
    .join(" ");
}

export function spcChartGuides(chart) {
  return [
    { key: "ucl", label: "UCL", value: chart.ucl, kind: "control" },
    { key: "usl", label: "USL", value: chart.usl, kind: "spec" },
    { key: "cl", label: "CL", value: chart.cl, kind: "centre" },
    { key: "lsl", label: "LSL", value: chart.lsl, kind: "spec" },
    { key: "lcl", label: "LCL", value: chart.lcl, kind: "control" },
    ...(chart.zones || []).map((zone, i) => ({
      ...zone,
      key: `sigma-${i}`,
      kind: "zone",
    })),
  ].filter((g) => Number.isFinite(g.value));
}
