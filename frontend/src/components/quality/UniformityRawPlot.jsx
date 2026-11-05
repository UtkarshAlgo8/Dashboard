import { useEffect, useReducer } from "react";
import {
  Alert,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Typography,
  useTheme,
} from "@mui/material";
import Highcharts from "highcharts";
import HighchartsReactImport from "highcharts-react-official";
import { getUniformityPage } from "@/api/uniformity.js";
import {
  appendUniformityPoints,
  recordedClockMillis,
} from "@/lib/uniformityDrill.js";

const HighchartsReact = HighchartsReactImport?.default ?? HighchartsReactImport;
const POINT_PAGE = 1000;
const DISPLAY_LIMIT = 20000;
const escape = (v) =>
  String(v ?? "—")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
const INITIAL = {
  rows: [],
  total: null,
  has_more: false,
  offset: 0,
  loading: true,
  error: null,
  attempt: 0,
};
function reducer(state, action) {
  if (action.type === "page") {
    try {
      return {
        ...state,
        ...appendUniformityPoints(state, action.page),
        loading: false,
        error: null,
      };
    } catch (error) {
      return { ...state, loading: false, error };
    }
  }
  if (action.type === "error")
    return { ...state, loading: false, error: action.error };
  if (action.type === "more")
    return { ...state, offset: state.rows.length, loading: true, error: null };
  if (action.type === "retry")
    return { ...state, attempt: state.attempt + 1, loading: true, error: null };
  return state;
}
/** Lazy, complete per-tyre chunks: no sampling, subgroup means or spec lines. */
export default function UniformityRawPlot({ scope, title, onClose }) {
  const theme = useTheme();
  const [state, dispatch] = useReducer(reducer, INITIAL);
  const scopeKey = JSON.stringify(scope);
  useEffect(() => {
    let cancelled = false;
    getUniformityPage("points", {
      ...JSON.parse(scopeKey),
      offset: state.offset,
      limit: POINT_PAGE,
    }).then(
      (page) => {
        if (!cancelled) dispatch({ type: "page", page });
      },
      (error) => {
        if (!cancelled) dispatch({ type: "error", error });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [scopeKey, state.offset, state.attempt]);
  const options = {
    chart: {
      type: "line",
      zooming: { type: "x" },
      height: 420,
      backgroundColor: theme.palette.background.paper,
    },
    title: { text: null },
    credits: { enabled: false },
    accessibility: { enabled: false },
    time: { useUTC: true },
    legend: { enabled: false },
    xAxis: {
      type: "datetime",
      title: { text: "Test time (recorded IST clock)" },
    },
    yAxis: { title: { text: "Measured value (tester units)" } },
    tooltip: {
      useHTML: false,
      formatter() {
        const r = (this.point ?? this).options.custom;
        return `Barcode: ${escape(r.barcode)}<br/>Test time: ${escape(r.test_time)}<br/>Shift: ${escape(r.shift)}<br/>Value: ${escape(r.actual_value)}<br/>Grade: ${escape(r.grade)}`;
      },
    },
    plotOptions: {
      series: {
        animation: false,
        turboThreshold: 0,
        marker: { enabled: true, radius: 2 },
      },
    },
    series: [
      {
        name: scope.parameter,
        color: theme.palette.primary.main,
        data: state.rows.map((row) => ({
          x: recordedClockMillis(row.test_time),
          y: row.actual_value,
          custom: row,
          marker: {
            fillColor:
              row.is_off_spec === 1
                ? theme.palette.error.main
                : theme.palette.primary.main,
          },
        })),
      },
    ],
  };
  return (
    <Dialog
      open
      onClose={onClose}
      maxWidth="lg"
      fullWidth
      aria-labelledby="uniformity-raw-title"
    >
      <DialogTitle id="uniformity-raw-title">{title}</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          One point per tyre's latest test. Red = off-spec grade. Drag
          horizontally to zoom. LSL / USL — not available.
        </Typography>
        {state.error && (
          <Alert severity="error" sx={{ mb: 1 }}>
            {state.error.message}
          </Alert>
        )}
        {state.total != null && (
          <Alert severity={state.has_more ? "warning" : "info"} sx={{ mb: 1 }}>
            {state.rows.length} of {state.total} measured tyres loaded.{" "}
            {state.has_more
              ? "Partial plot — load more points below or narrow the date range. No points have been sampled."
              : "All measured tyres loaded."}
          </Alert>
        )}
        {state.rows.length > 0 ? (
          <HighchartsReact highcharts={Highcharts} options={options} />
        ) : !state.loading && !state.error ? (
          <Typography>No measured values for this selection.</Typography>
        ) : null}
        {state.loading && (
          <Stack alignItems="center" sx={{ py: 2 }}>
            <CircularProgress size={24} aria-label="Loading raw values" />
          </Stack>
        )}
        {state.has_more && state.rows.length >= DISPLAY_LIMIT && (
          <Alert severity="warning">
            Display limit reached ({DISPLAY_LIMIT} points). This plot is
            incomplete. Narrow the date range to see every tyre.
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        {state.error && (
          <Button
            disabled={state.loading}
            onClick={() => dispatch({ type: "retry" })}
          >
            Retry page
          </Button>
        )}
        {state.has_more &&
          !state.error &&
          state.rows.length < DISPLAY_LIMIT && (
            <Button
              disabled={state.loading}
              onClick={() => dispatch({ type: "more" })}
            >
              Load next {POINT_PAGE} tyres
            </Button>
          )}
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
