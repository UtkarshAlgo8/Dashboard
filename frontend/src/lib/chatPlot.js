/**
 * Turns a JK Agent `plot_spec` ({ chart_type, x, y, group_by }) plus the
 * chat response's `preview_rows` into Highcharts options. Pure function so
 * it's cheap to memoize in the component and easy to unit-test in
 * isolation from Highcharts itself.
 *
 * Only the 3 chart types the assistant can request are handled: line, bar
 * (rendered as vertical "column" series, matching this app's other trend
 * charts), and pie.
 */

function toNumber(value) {
  const n = typeof value === "number" ? value : parseFloat(value);
  return Number.isFinite(n) ? n : null;
}

function pickPalette(theme) {
  const brand = theme?.custom?.brand ?? {};
  return [
    brand.orange,
    brand.blue,
    brand.green,
    brand.amber,
    brand.red,
    brand.purple,
    brand.teal,
    brand.ocean,
  ].filter(Boolean);
}

function buildPieOptions({ x, y, group_by: groupKey }, rows, theme) {
  const labelKey = groupKey || x;
  const totals = new Map();
  rows.forEach((row) => {
    const label = String(row[labelKey] ?? "Unknown");
    const value = toNumber(row[y]) ?? 0;
    totals.set(label, (totals.get(label) ?? 0) + value);
  });

  return {
    chart: { type: "pie", height: 280, backgroundColor: "transparent" },
    title: { text: null },
    credits: { enabled: false },
    colors: pickPalette(theme),
    tooltip: { pointFormat: "{series.name}: <b>{point.y}</b> ({point.percentage:.1f}%)" },
    series: [
      {
        name: y,
        colorByPoint: true,
        data: Array.from(totals, ([name, value]) => ({ name, y: value })),
      },
    ],
  };
}

function buildCartesianOptions({ chart_type: chartType, x, y, group_by: groupKey }, rows, theme) {
  const palette = pickPalette(theme);
  const seriesType = chartType === "bar" ? "column" : "line";
  const categories = Array.from(
    new Set(rows.map((row) => String(row[x]))),
  ).sort();

  const groups = groupKey
    ? Array.from(new Set(rows.map((row) => String(row[groupKey]))))
    : [null];

  const series = groups.map((group, i) => {
    const matching = group === null ? rows : rows.filter((row) => String(row[groupKey]) === group);
    const byX = new Map(matching.map((row) => [String(row[x]), toNumber(row[y])]));
    return {
      name: group ?? y,
      type: seriesType,
      color: palette[i % palette.length] || undefined,
      data: categories.map((c) => byX.get(c) ?? null),
    };
  });

  return {
    chart: { height: 280, backgroundColor: "transparent" },
    title: { text: null },
    credits: { enabled: false },
    xAxis: {
      categories,
      labels: { style: { fontSize: "10px" } },
      lineColor: theme?.palette?.divider,
      tickColor: theme?.palette?.divider,
    },
    yAxis: {
      title: { text: null },
      gridLineColor: theme?.palette?.divider,
    },
    legend: {
      enabled: series.length > 1,
      itemStyle: { fontSize: "10px" },
    },
    series,
  };
}

/**
 * @param {{ chart_type?: string, x?: string, y?: string, group_by?: string }} plotSpec
 * @param {object[]} rows
 * @param {import("@mui/material").Theme} theme
 * @returns {object|null} Highcharts options, or null if the spec/data can't be plotted
 */
export function buildChartOptions(plotSpec, rows, theme) {
  if (!plotSpec || !Array.isArray(rows) || rows.length === 0) return null;
  const { chart_type: chartType, x, y } = plotSpec;
  if (!x || !y) return null;

  if (chartType === "pie") return buildPieOptions(plotSpec, rows, theme);
  if (chartType === "line" || chartType === "bar") {
    return buildCartesianOptions(plotSpec, rows, theme);
  }
  return null;
}
