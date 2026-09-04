import { useMemo } from "react";
import { Box, useTheme } from "@mui/material";
import Highcharts from "highcharts";
import HighchartsReactImport from "highcharts-react-official";
import { buildChartOptions } from "@/lib/chatPlot.js";

// See frontend/src/components/trend/LineChart.jsx for why this
// normalisation is needed (CJS/ESM interop on the UMD bundle).
const HighchartsReact = HighchartsReactImport?.default ?? HighchartsReactImport;

/**
 * Renders the chart a JK Agent response asked for (`wants_plot` +
 * `plot_spec`), plotted from that same response's `preview_rows`.
 *
 * @param {{ plotSpec: object, rows: object[] }} props
 */
export default function JkAgentChart({ plotSpec, rows }) {
  const theme = useTheme();

  const options = useMemo(
    () => buildChartOptions(plotSpec, rows, theme),
    [plotSpec, rows, theme],
  );

  if (!options) return null;

  return (
    <Box sx={{ mt: 1, mx: -0.5 }}>
      <HighchartsReact highcharts={Highcharts} options={options} />
    </Box>
  );
}
