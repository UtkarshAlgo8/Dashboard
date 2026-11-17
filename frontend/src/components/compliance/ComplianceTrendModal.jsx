import { useState } from "react";
import {
  Alert,
  Box,
  Stack,
  TextField,
  Typography,
  useTheme,
} from "@mui/material";
import Highcharts from "highcharts";
import HighchartsReactImport from "highcharts-react-official";
import { getComplianceHistory } from "@/api/compliance.js";
import {
  ModalFrame,
  ChartPanel,
  SingleSelectRow,
} from "@/components/trend/TrendModalParts.jsx";
import JKLoader from "@/components/JKLoader.jsx";
import { usePolledQuery } from "@/hooks/usePolledQuery.js";
import { COMPLIANCE_DEFINITIONS } from "@/lib/compliance.js";

const HighchartsReact = HighchartsReactImport?.default ?? HighchartsReactImport;

/** One point per published period; empty periods are gaps, not zeroes. */
export default function ComplianceTrendModal({ id, anchor, onClose }) {
  const theme = useTheme();
  const [granularity, setGranularity] = useState("DAY");
  const [month, setMonth] = useState(anchor.slice(0, 7));
  const year = month.slice(0, 4);
  const from = granularity === "DAY" ? `${month}-01` : `${year}-01-01`;
  const to =
    granularity === "DAY"
      ? new Date(Date.UTC(Number(year), Number(month.slice(5, 7)), 0))
          .toISOString()
          .slice(0, 10)
      : `${year}-12-31`;
  const query = usePolledQuery(
    () => getComplianceHistory({ id, from, to, granularity }),
    { deps: [id, from, to, granularity], interval: 60000 },
  );
  const matching =
    query.data?.context?.id === id &&
    query.data.context.from === from &&
    query.data.context.to === to &&
    query.data.context.granularity === granularity;
  const points = matching ? query.data.points : [];
  const byDate = new Map(points.map((point) => [point.date, point.value]));
  const count = granularity === "DAY" ? Number(to.slice(8, 10)) : 12;
  const dates = Array.from({ length: count }, (_, index) =>
    granularity === "DAY"
      ? `${month}-${String(index + 1).padStart(2, "0")}`
      : `${year}-${String(index + 1).padStart(2, "0")}-01`,
  );
  const options = {
    chart: {
      type: "line",
      height: 380,
      backgroundColor: "transparent",
      style: { fontFamily: theme.typography.fontFamily },
    },
    title: { text: null },
    credits: { enabled: false },
    accessibility: { enabled: false },
    xAxis: {
      categories: dates.map((date) =>
        granularity === "DAY" ? date.slice(8, 10) : date.slice(0, 7),
      ),
      labels: {
        step: granularity === "DAY" ? 2 : 1,
        style: { color: theme.palette.text.secondary },
      },
    },
    yAxis: {
      title: { text: "Compliance (%)" },
      gridLineColor: theme.palette.divider,
    },
    legend: { enabled: false },
    tooltip: { valueSuffix: "%", valueDecimals: 2 },
    plotOptions: { series: { animation: false, connectNulls: false } },
    series: [
      {
        name: COMPLIANCE_DEFINITIONS[id].name,
        color: theme.palette.primary.main,
        data: dates.map((date) => byDate.get(date) ?? null),
      },
    ],
  };
  return (
    <ModalFrame
      open
      onClose={onClose}
      kpi={{ name: COMPLIANCE_DEFINITIONS[id].name, unit: "%" }}
    >
      <Stack spacing={2}>
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={2}
          alignItems={{ sm: "center" }}
        >
          <SingleSelectRow
            label="View by"
            value={granularity}
            onChange={setGranularity}
            options={[
              { value: "DAY", label: "Daily" },
              { value: "MONTH", label: "Monthly" },
            ]}
          />
          <TextField
            label="Month"
            type="month"
            size="small"
            value={month}
            onChange={(event) => {
              const value = event.target.value;
              if (
                /^\d{4}-(0[1-9]|1[0-2])$/.test(value) &&
                Number(value.slice(0, 4)) >= 100
              )
                setMonth(value);
            }}
            slotProps={{ inputLabel: { shrink: true } }}
          />
        </Stack>
        <Typography sx={{ fontSize: 12, color: "text.secondary" }}>
          BTP · All shifts · {granularity === "DAY" ? month : year}. Published
          values; missing periods are gaps.
        </Typography>
        {query.error ? (
          <Alert severity="error">
            Compliance trend unavailable: {query.error.message}
          </Alert>
        ) : query.isLoading && !matching ? (
          <JKLoader message="Loading compliance trend" />
        ) : !points.some((point) => point.value != null) ? (
          <Alert severity="info">
            No published compliance data for this period.
          </Alert>
        ) : (
          <ChartPanel theme={theme} title="Compliance trend">
            <Box sx={{ overflowX: "auto", width: "100%" }}>
              <Box sx={{ minWidth: 600 }}>
                <HighchartsReact highcharts={Highcharts} options={options} />
              </Box>
            </Box>
          </ChartPanel>
        )}
      </Stack>
    </ModalFrame>
  );
}
