import { useEffect, useReducer, useRef } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  MenuItem,
  Stack,
  TextField,
  Typography,
  useMediaQuery,
} from "@mui/material";
import RefreshIcon from "@mui/icons-material/Refresh";
import JKLoader from "@/components/JKLoader.jsx";
import ProductionHeader from "@/components/production/ProductionHeader.jsx";
import { Card } from "@/components/quality/shared/Card.jsx";
import { DTable } from "@/components/quality/shared/DTable.jsx";
import { PrintStyles } from "@/components/quality/shared/PrintStyles.jsx";
import { StatTile } from "@/components/quality/shared/StatTile.jsx";
import { C } from "@/components/quality/shared/theme.js";
import { getCtpSpcWorkspace } from "@/api/ctpSpc.js";
import CtpSpcChart from "./CtpSpcChart.jsx";

const RULES = [
  "One point beyond the published control limits",
  "9 consecutive points on one side of the centre line",
  "6 consecutive points steadily increasing or decreasing",
  "14 consecutive points alternating up and down",
  "2 of 3 points beyond 2σ on the same side",
  "4 of 5 points beyond 1σ on the same side",
  "15 consecutive points within 1σ of the centre line",
  "8 consecutive points outside 1σ of the centre line",
];
const number = (v) =>
  Number.isFinite(v)
    ? v.toLocaleString("en-IN", { maximumFractionDigits: 3 })
    : "—";
const statusColor = (status) =>
  ({ Critical: C.rd, Major: C.am, Warning: C.am, Healthy: C.gn })[status] ??
  C.md;
const machineKey = (p) => JSON.stringify([p.tyre, p.machine]);

function reducer(state, action) {
  switch (action.type) {
    case "request":
      return {
        ...state,
        ...action.filters,
        revision: state.revision + 1,
        force: action.force === true,
        status: "loading",
        data: null,
        error: null,
        machine: action.force ? state.machine : "",
        processId: action.force ? state.processId : "",
        activeRule: null,
      };
    case "loaded":
      return { ...state, status: "ready", data: action.data };
    case "failed":
      return { ...state, status: "error", error: action.error };
    case "machine":
      return {
        ...state,
        machine: action.value,
        processId: "",
        activeRule: null,
      };
    case "process":
      return { ...state, processId: action.value, activeRule: null };
    case "rule":
      return {
        ...state,
        activeRule: state.activeRule === action.value ? null : action.value,
      };
    default:
      return state;
  }
}

/** Reference-style SPC workspace in the existing CTP Quality shell. */
export default function CtpSpcDashboard({
  plant,
  categoryTabs,
  onCategoryChange,
  initialTyre = "All",
}) {
  const [state, dispatch] = useReducer(reducer, {
    tyre: initialTyre,
    date: null,
    shift: "All",
    revision: 0,
    force: false,
    status: "loading",
    data: null,
    error: null,
    machine: "",
    processId: "",
    activeRule: null,
  });
  const root = useRef(null);
  const compact = useMediaQuery("(max-width:899px)");
  useEffect(() => {
    // Keep the active SPC tab visible inside the mobile navigation scroller.
    const tabs = root.current?.querySelector(
      "header > div:nth-of-type(2) > div:first-of-type",
    );
    if (compact && tabs) tabs.scrollLeft = tabs.scrollWidth;
  }, [compact]);
  const { tyre, date, shift, revision, force, data, status, error } = state;
  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    getCtpSpcWorkspace({
      tyre,
      date,
      shift,
      refresh: force,
      signal: controller.signal,
    })
      .then((result) => {
        if (!cancelled) dispatch({ type: "loaded", data: result });
      })
      .catch((err) => {
        if (!cancelled) dispatch({ type: "failed", error: err });
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [tyre, date, shift, revision, force]);

  const request = (filters, refresh = false) =>
    dispatch({ type: "request", filters, force: refresh });
  const processes = data?.processes ?? [];
  const machines = [
    ...new Map(processes.map((p) => [machineKey(p), p])).values(),
  ];
  const selectedMachine = machines.some((p) => machineKey(p) === state.machine)
    ? state.machine
    : machines[0]
      ? machineKey(machines[0])
      : "";
  const parameters = processes.filter((p) => machineKey(p) === selectedMachine);
  const process =
    parameters.find((p) => p.id === state.processId) ?? parameters[0];
  const selectedDate = date ?? data?.context?.date ?? "";
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const loading = status === "loading";

  return (
    <Box
      ref={root}
      sx={{
        minHeight: "100vh",
        bgcolor: "background.default",
        color: "text.primary",
        // Scope small-screen adjustments to this workspace, not other dashboards.
        "& > header > div:first-of-type": {
          gridTemplateColumns: { xs: "1fr auto", md: "1fr auto 1fr" },
          rowGap: 1,
        },
        '& > header nav[aria-label="Current location"]': {
          gridRow: { xs: 2, md: "auto" },
          gridColumn: { xs: "1 / -1", md: "auto" },
        },
        "& > header > div:first-of-type > div:last-of-type": {
          gridRow: { xs: 1, md: "auto" },
          gridColumn: { xs: 2, md: "auto" },
        },
        "& > header > div:first-of-type > div:last-of-type > .MuiTypography-root":
          {
            display: { xs: "none", md: "block" },
          },
        "& > header > div:nth-of-type(2) > div:first-of-type, & > header > div:nth-of-type(2) > div:last-of-type":
          {
            maxWidth: "100%",
            overflowX: "auto",
          },
      }}
    >
      <PrintStyles />
      <ProductionHeader
        plant={plant}
        categoryTabs={categoryTabs}
        activeCategory="spc"
        onCategoryChange={onCategoryChange}
        tyreTypes={["All", "PCR", "TBR"]}
        tyreType={tyre}
        onTyreTypeChange={(value) => request({ tyre: value })}
        timeRange={{
          preset: date === today ? "today" : "day",
          from: null,
          to: null,
        }}
        onTimeRangeChange={(updater) => {
          const next =
            typeof updater === "function"
              ? updater({ preset: "day" })
              : updater;
          if (next?.preset === "today") request({ date: today });
        }}
        hiddenPresets={["month", "range"]}
        hideCustomRange
        singleDay={selectedDate}
        onSingleDayChange={(value) => {
          if (value) request({ date: value });
        }}
        shift={shift.toLowerCase()}
        onShiftChange={(value) =>
          request({ shift: value === "all" ? "All" : value.toUpperCase() })
        }
        asOf={today}
        lastUpdatedAt={data?.fetched_at ? new Date(data.fetched_at) : null}
        onExport={() => window.print?.()}
      />
      <Box
        component="section"
        aria-label="CTP SPC workspace"
        sx={{
          px: { xs: 2, md: 3 },
          py: 2,
          display: "grid",
          gap: 2,
          minWidth: 0,
        }}
      >
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={1}
          alignItems={{ sm: "center" }}
          justifyContent="space-between"
        >
          <Box>
            <Typography sx={{ fontSize: 18, fontWeight: 700 }}>
              Statistical process control
            </Typography>
            <Typography sx={{ fontSize: 12, color: C.md }} aria-live="polite">
              {loading
                ? "Loading published CTP snapshot…"
                : data?.context?.data_date
                  ? `Published data: ${data.context.data_date} · ${date === null ? "Latest published day" : "Selected day"} · ${shift === "All" ? "All shifts" : `Shift ${shift}`}`
                  : date
                    ? `No published data for ${date}`
                    : "No published SPC snapshot available"}
            </Typography>
          </Box>
          <Stack direction="row" spacing={1}>
            <Button
              size="small"
              variant={date === null ? "outlined" : "text"}
              onClick={() => request({ date: null })}
              disabled={loading && date === null}
            >
              Latest published
            </Button>
            <Button
              size="small"
              startIcon={<RefreshIcon />}
              onClick={() => request({}, true)}
              disabled={loading}
            >
              Refresh
            </Button>
          </Stack>
        </Stack>
        {loading ? (
          <Box sx={{ minHeight: 380, display: "grid", placeItems: "center" }}>
            <JKLoader message="Loading SPC data" />
          </Box>
        ) : error ? (
          <Alert
            severity="error"
            action={
              <Button color="inherit" onClick={() => request({}, true)}>
                Retry
              </Button>
            }
          >
            Could not load CTP SPC: {error.message || "Request failed"}. Retry
            or choose another day.
          </Alert>
        ) : !process ? (
          <Alert severity="info">
            No SPC data for this tyre type and day. Choose another day or select
            Latest published. Older data is not substituted automatically.
          </Alert>
        ) : (
          <>
            <Card title="Machine / parameter" accent={C.bl} hideExport>
              <Stack
                direction={{ xs: "column", md: "row" }}
                spacing={2}
                sx={{ mt: 1 }}
              >
                <TextField
                  select
                  id="ctp-spc-machine"
                  label="Machine"
                  SelectProps={{
                    SelectDisplayProps: {
                      "aria-labelledby": "ctp-spc-machine-label",
                    },
                  }}
                  value={selectedMachine}
                  size="small"
                  fullWidth
                  onChange={(event) =>
                    dispatch({ type: "machine", value: event.target.value })
                  }
                >
                  {machines.map((p) => (
                    <MenuItem key={machineKey(p)} value={machineKey(p)}>
                      {p.machine} ({p.tyre})
                    </MenuItem>
                  ))}
                </TextField>
                <TextField
                  select
                  id="ctp-spc-parameter"
                  label="Parameter"
                  SelectProps={{
                    SelectDisplayProps: {
                      "aria-labelledby": "ctp-spc-parameter-label",
                    },
                  }}
                  value={process.id}
                  size="small"
                  fullWidth
                  onChange={(event) =>
                    dispatch({ type: "process", value: event.target.value })
                  }
                >
                  {parameters.map((p) => (
                    <MenuItem key={p.id} value={p.id}>
                      {p.parameter}
                      {p.recipe && p.recipe !== "ALL" ? ` · ${p.recipe}` : ""}
                    </MenuItem>
                  ))}
                </TextField>
              </Stack>
            </Card>
            <Stack
              direction={{ xs: "column", sm: "row" }}
              justifyContent="space-between"
              spacing={1}
            >
              <Box>
                <Typography sx={{ fontSize: 17, fontWeight: 700 }}>
                  {process.parameter}
                </Typography>
                <Typography sx={{ fontSize: 12, color: C.md }}>
                  {process.machine} · {process.tyre}
                  {process.section ? ` · ${process.section}` : ""}
                  {process.unit ? ` · ${process.unit}` : ""}
                </Typography>
              </Box>
              <Chip
                label={`Capability: ${process.headline_status}`}
                size="small"
                sx={{
                  color: statusColor(process.headline_status),
                  borderColor: statusColor(process.headline_status),
                  alignSelf: "start",
                }}
                variant="outlined"
              />
            </Stack>
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: {
                  xs: "repeat(2, minmax(0, 1fr))",
                  md: "repeat(6, minmax(0, 1fr))",
                },
                gap: 1,
              }}
            >
              {["Cp", "Cpk", "Pp", "Ppk"].map((metric) => (
                <StatTile
                  key={metric}
                  label={metric}
                  value={number(process.metrics[metric]?.value)}
                  color={statusColor(process.metrics[metric]?.status)}
                  sub={
                    [
                      process.metrics[metric]?.status,
                      process.metrics[metric]?.window_days
                        ? `${process.metrics[metric].window_days}-day window`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" · ") || "Not published"
                  }
                />
              ))}
              <StatTile
                label="Daily mean"
                value={number(process.mean.value)}
                sub={process.mean.status || "Not published"}
              />
              <StatTile
                label="Daily OOC points"
                value={number(process.published_ooc.value)}
                sub={process.published_ooc.status || "Not published"}
              />
            </Box>
            <Typography sx={{ fontSize: 12, color: C.md }}>
              Capability indices are published daily snapshots, not recalculated
              from the displayed points. X̄ points outside limits in this
              selection: {number(process.chart.chart_ooc)}.
              {shift !== "All"
                ? ` Published Shift ${shift} sample count: ${number(process.shift_sample_count)}.`
                : ""}
            </Typography>
            {process.warnings.map((warning) => (
              <Alert key={warning} severity="info">
                {warning}
              </Alert>
            ))}
            <CtpSpcChart process={process} activeRule={state.activeRule} />
            <CtpSpcChart process={process} range />
            <Card title="Nelson rule violations" accent={C.bl}>
              <Typography sx={{ fontSize: 12, color: C.md, mb: 1 }}>
                Eight Nelson rules, evaluated against the published baseline.
                Select a detected rule to highlight its points.
              </Typography>
              <DTable
                cols={["Rule", "Description", "Result", "Points"]}
                sortable={false}
                statusColors={false}
                rows={process.chart.rules.map((rule) => [
                  <Button
                    key={rule.rule}
                    size="small"
                    disabled={!rule.hit}
                    aria-pressed={state.activeRule === rule.rule}
                    onClick={() => dispatch({ type: "rule", value: rule.rule })}
                  >
                    Rule {rule.rule}
                  </Button>,
                  RULES[rule.rule - 1],
                  !rule.evaluated
                    ? "Not evaluated"
                    : rule.hit
                      ? "Detected"
                      : "No breach detected",
                  rule.point_indexes.length
                    ? rule.point_indexes.map((i) => `#${i}`).join(", ")
                    : "—",
                ])}
              />
            </Card>
            <Card title="Nelson rule alerts" accent={C.bl}>
              {process.chart.alerts.length ? (
                <DTable
                  cols={[
                    "Rule",
                    "Severity",
                    "Points",
                    "First reading",
                    "Last reading",
                  ]}
                  rows={process.chart.alerts.map((alert) => [
                    `Rule ${alert.rule}`,
                    alert.severity,
                    `#${alert.points.first}–#${alert.points.last}`,
                    alert.time.first ?? "—",
                    alert.time.last ?? "—",
                  ])}
                />
              ) : (
                <Typography sx={{ color: C.md, fontSize: 13 }}>
                  {process.chart.rules.some((rule) => rule.evaluated)
                    ? "No Nelson rule alerts for the evaluated readings."
                    : "No rule assessment available for this selection."}
                </Typography>
              )}
            </Card>
          </>
        )}
      </Box>
    </Box>
  );
}
