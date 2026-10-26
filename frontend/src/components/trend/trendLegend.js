/**
 * Pick which plotted values the trend charts colour as Best and Worst.
 *
 * Unlisted KPIs are higher-is-better (max = Best); lower-is-better KPIs such
 * as Scrap / Rework / Downtime flip it, so the month with the MOST scrap is
 * the Worst one. Returns nulls when the series is flat or empty — the same
 * condition under which buildTrendLegend omits the Best / Worst keys.
 *
 * @param {(number|null)[]} values
 * @param {boolean} lowerIsBetter
 * @returns {{best:number|null, worst:number|null}}
 */
export function pickTrendExtremes(values, lowerIsBetter) {
  const numeric = (values ?? []).filter(
    (v) => typeof v === "number" && Number.isFinite(v),
  );
  if (numeric.length === 0) return { best: null, worst: null };
  const max = Math.max(...numeric);
  const min = Math.min(...numeric);
  if (max === min) return { best: null, worst: null };
  return lowerIsBetter ? { best: min, worst: max } : { best: max, worst: min };
}

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
