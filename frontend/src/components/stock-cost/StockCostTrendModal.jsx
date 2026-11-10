import { useState } from "react";
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  TextField,
  Typography,
  useTheme,
} from "@mui/material";
import Highcharts from "highcharts";
import HighchartsReactImport from "highcharts-react-official";
import JKLoader from "@/components/JKLoader.jsx";
import { DTable } from "@/components/quality/shared/DTable.jsx";
import useStockCostQuery from "@/hooks/useStockCostQuery.js";
import {
  stockCategoryLabel,
  stockCostRange,
  stockCostTrend,
  stockMoney,
} from "@/lib/stockCost.js";

const HighchartsReact = HighchartsReactImport?.default ?? HighchartsReactImport;

/** Overall cost only; a single raw category unlocks separate quantity series/axes per UoM. */
export default function StockCostTrendModal({
  range: initialRange,
  initialCategory = "",
  onClose,
}) {
  const theme = useTheme();
  const [range, setRange] = useState(initialRange);
  const [draft, setDraft] = useState(initialRange);
  const [category, setCategory] = useState(initialCategory);
  const query = useStockCostQuery(range);
  const optionsCategories = [
    ...new Set(
      (query.data?.categories ?? [])
        .filter((row) => row.cost !== null)
        .map((row) => row.category),
    ),
  ].sort();
  // A category shortcut may be absent in a later range. Fall back visibly to All, never another category.
  const selectedCategory = optionsCategories.includes(category) ? category : "";
  const trend = stockCostTrend(query.data, range, selectedCategory);
  const colors = [
    theme.palette.secondary.main,
    theme.palette.info.main,
    theme.palette.warning.main,
    theme.palette.success.main,
    theme.palette.text.secondary,
  ];
  const options = {
    chart: {
      height: 380,
      backgroundColor: "transparent",
      style: { fontFamily: theme.typography.fontFamily },
    },
    title: { text: null },
    credits: { enabled: false },
    accessibility: { enabled: false },
    xAxis: {
      categories: trend.dates,
      labels: {
        rotation: -45,
        step: Math.max(1, Math.ceil(trend.dates.length / 15)),
        style: { color: theme.palette.text.secondary },
      },
    },
    yAxis: [
      {
        title: { text: "Cost (₹)" },
        gridLineColor: theme.palette.divider,
        labels: {
          formatter() {
            return stockMoney(this.value);
          },
        },
      },
      ...trend.quantities.map(({ unit }, index) => ({
        title: {
          text: `Qty (${unit})`,
          style: { color: colors[index % colors.length] },
        },
        opposite: true,
        offset: index * 65,
        gridLineWidth: 0,
      })),
    ],
    legend: { itemStyle: { color: theme.palette.text.secondary } },
    tooltip: { shared: true, valueDecimals: 2 },
    plotOptions: { series: { animation: false, connectNulls: false } },
    series: [
      {
        type: selectedCategory ? "column" : "line",
        name: "Cost ₹",
        color: theme.palette.primary.main,
        data: trend.cost,
        tooltip: { valuePrefix: "₹" },
      },
      ...trend.quantities.map(({ unit, values }, index) => ({
        type: "spline",
        name: `Qty (${unit})`,
        yAxis: index + 1,
        color: colors[index % colors.length],
        data: values,
        tooltip: { valueSuffix: ` ${unit}` },
      })),
    ],
  };
  const validRange = stockCostRange({ ...draft, granularity: "DAY" });
  const dateValid = (value) =>
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
  const canApply = validRange && dateValid(draft.from) && dateValid(draft.to);
  return (
    <Dialog
      open
      onClose={onClose}
      fullWidth
      maxWidth="lg"
      aria-labelledby="stock-cost-trend-title"
    >
      <DialogTitle id="stock-cost-trend-title">Stock Cost Trend</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <Typography sx={{ fontSize: 12, color: "text.secondary" }}>
            BTP · DAY · All shifts · {range.from} – {range.to}
          </Typography>
          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={1}
            alignItems={{ sm: "flex-start" }}
          >
            <TextField
              label="From"
              type="date"
              size="small"
              value={draft.from}
              onChange={(event) =>
                setDraft({ ...draft, from: event.target.value })
              }
              slotProps={{ inputLabel: { shrink: true } }}
            />
            <TextField
              label="To"
              type="date"
              size="small"
              value={draft.to}
              onChange={(event) =>
                setDraft({ ...draft, to: event.target.value })
              }
              slotProps={{ inputLabel: { shrink: true } }}
            />
            <Button
              variant="outlined"
              disabled={!canApply}
              onClick={() => {
                setRange(validRange);
                setCategory("");
              }}
            >
              Apply dates
            </Button>
            <TextField
              select
              label="Category"
              size="small"
              value={selectedCategory}
              disabled={query.isLoading || Boolean(query.error)}
              onChange={(event) => setCategory(event.target.value)}
              sx={{ minWidth: 230, maxWidth: 420 }}
            >
              <MenuItem value="">All</MenuItem>
              {optionsCategories.map((raw) => (
                <MenuItem key={raw} value={raw}>
                  {stockCategoryLabel(raw)}
                </MenuItem>
              ))}
            </TextField>
          </Stack>
          {!canApply && (
            <Alert severity="info">
              Choose a valid date range up to 366 days.
            </Alert>
          )}
          {query.error ? (
            <Alert severity="error">
              Stock Cost unavailable: {query.error.message}
            </Alert>
          ) : query.isLoading ? (
            <JKLoader message="Loading Stock Cost trend" />
          ) : !query.data?.overall.length && !optionsCategories.length ? (
            <Alert severity="info">
              No published Stock Cost data for this range.
            </Alert>
          ) : (
            <>
              {query.data?.reconciliation.length > 0 && (
                <Alert severity="warning">
                  Category costs and plant totals do not reconcile on{" "}
                  {query.data.reconciliation
                    .map((item) => item.date)
                    .join(", ")}
                  . Values are shown as published.
                </Alert>
              )}
              <Box sx={{ overflowX: "auto" }}>
                <Box sx={{ minWidth: 600 }}>
                  <HighchartsReact highcharts={Highcharts} options={options} />
                </Box>
              </Box>
              <Typography sx={{ fontSize: 12, color: "text.secondary" }}>
                {selectedCategory
                  ? "Missing category dates are plotted as 0. Each quantity unit has its own series and axis."
                  : "Overall cost only — quantity units are mixed across categories. Missing plant totals are left unpublished, not fabricated."}
              </Typography>
              <DTable
                cols={[
                  "Date",
                  "Cost ₹",
                  ...trend.quantities.map(({ unit }) => `Qty (${unit})`),
                ]}
                rows={trend.dates.map((date, index) => [
                  date,
                  stockMoney(trend.cost[index]),
                  ...trend.quantities.map(({ values }) =>
                    stockMoney(values[index]),
                  ),
                ])}
                sortable={false}
                statusColors={false}
                preserveText
              />
            </>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
