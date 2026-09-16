import { useEffect, useMemo, useState } from "react";
import {
  Box,
  CircularProgress,
  Stack,
  Typography,
  useTheme,
} from "@mui/material";
import Highcharts from "highcharts";
import HighchartsReactImport from "highcharts-react-official";
import { downloadChatResult } from "@/api/chat.js";
import { buildChartOptions } from "@/lib/chatPlot.js";

// See frontend/src/components/trend/LineChart.jsx for why this
// normalisation is needed (CJS/ESM interop on the UMD bundle).
const HighchartsReact = HighchartsReactImport?.default ?? HighchartsReactImport;

/**
 * Renders the chart a JK Agent response asked for (`wants_plot` +
 * `plot_spec`).
 *
 * The rows are fetched from /chat/download/{resultId} rather than read off
 * the chat response: this build of the upstream dropped `preview_rows`, so
 * the cached result set is the only place the actual data lives. That
 * makes plotting a second round-trip, hence the loading state.
 *
 * @param {{ plotSpec: object, resultId: string }} props
 */
export default function JkAgentChart({ plotSpec, resultId }) {
  const theme = useTheme();
  // Result and its id are stored together so a change of `resultId`
  // invalidates the previous rows by derivation rather than by resetting
  // state from inside the effect.
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (!resultId) return undefined;

    // Guards against a late response from a superseded resultId
    // overwriting the rows of the current one.
    let cancelled = false;

    downloadChatResult(resultId)
      .then((data) => {
        if (!cancelled) setResult({ resultId, rows: data.rows ?? [] });
      })
      .catch(() => {
        if (!cancelled) setResult({ resultId, failed: true });
      });

    return () => {
      cancelled = true;
    };
  }, [resultId]);

  const current = result?.resultId === resultId ? result : null;
  const isError = !resultId || Boolean(current?.failed);
  const isLoading = !isError && !current;

  const options = useMemo(
    () =>
      current?.rows ? buildChartOptions(plotSpec, current.rows, theme) : null,
    [plotSpec, current, theme],
  );

  if (isLoading) {
    return (
      <Stack
        direction="row"
        spacing={1}
        alignItems="center"
        sx={{ mt: 1, py: 2, color: "text.disabled" }}
      >
        <CircularProgress size={14} color="inherit" />
        <Typography variant="caption">Loading chart data…</Typography>
      </Stack>
    );
  }

  if (isError || !options) {
    return (
      <Typography
        variant="caption"
        sx={{ display: "block", mt: 1, color: "text.disabled" }}
      >
        Chart unavailable — the result data could not be loaded.
      </Typography>
    );
  }

  return (
    <Box sx={{ mt: 1, mx: -0.5 }}>
      <HighchartsReact highcharts={Highcharts} options={options} />
    </Box>
  );
}
