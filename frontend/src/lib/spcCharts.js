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

/** Space reference labels without moving their actual chart-line anchors. */
export function spcGuideLabelLayout(guides, y, { top, bottom, gap = 16 }) {
  const labels = guides
    .map((guide) => ({ ...guide, anchorY: y(guide.value) }))
    .filter((guide) => Number.isFinite(guide.anchorY))
    .sort((a, b) => a.anchorY - b.anchorY);
  const spacing =
    labels.length > 1 ? Math.min(gap, (bottom - top) / (labels.length - 1)) : 0;
  for (let i = 0; i < labels.length; i++) {
    labels[i].labelY = Math.max(
      top,
      Math.min(bottom, labels[i].anchorY),
      i > 0 ? labels[i - 1].labelY + spacing : top,
    );
  }
  if (labels.length && labels[labels.length - 1].labelY > bottom) {
    labels[labels.length - 1].labelY = bottom;
    for (let i = labels.length - 2; i >= 0; i--) {
      labels[i].labelY = Math.min(
        labels[i].labelY,
        labels[i + 1].labelY - spacing,
      );
    }
  }
  return labels;
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
