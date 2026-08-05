/**
 * Build the legend items for a trend LineChart / BarChart from its data.
 *
 * The charts colour the single series' extremes (best green, worst red) and
 * draw a dashed target line; the legend must name exactly the encodings that
 * are actually on screen — no more, no less:
 *   - "Actual": always (the series itself).
 *   - "Best" / "Worst": only when the values vary (min !== max), which is the
 *     same condition under which the charts apply the green/red point colours.
 *   - "Target": only when a target is provided.
 *
 * @param {object} args
 * @param {(number|null)[]} args.values     the plotted series
 * @param {number|null|undefined} args.target
 * @param {string|null|undefined} args.unit
 * @param {{actual:string,best:string,worst:string,target:string}} args.colors
 * @param {string} [args.actualLabel="Actual"]
 * @returns {{label:string,color:string,variant:"fill"|"dash"}[]}
 */
export function buildTrendLegend({
  values,
  target,
  unit,
  colors,
  actualLabel = "Actual",
}) {
  const numeric = (values ?? []).filter(
    (v) => typeof v === "number" && Number.isFinite(v),
  );
  const hasExtremes =
    numeric.length > 1 && Math.min(...numeric) !== Math.max(...numeric);

  const items = [{ label: actualLabel, color: colors.actual, variant: "fill" }];
  if (hasExtremes) {
    items.push({ label: "Best", color: colors.best, variant: "fill" });
    items.push({ label: "Worst", color: colors.worst, variant: "fill" });
  }
  if (target != null) {
    items.push({
      label: `Target${unit ? ` (${unit})` : ""}`,
      color: colors.target,
      variant: "dash",
    });
  }
  return items;
}
