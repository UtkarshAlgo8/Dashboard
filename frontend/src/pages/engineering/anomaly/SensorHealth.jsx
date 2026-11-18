import { useState } from "react";
import {
  Box,
  Chip,
  MenuItem,
  Select,
  Stack,
  Tab,
  Tabs,
  TableSortLabel,
  TextField,
  Typography,
} from "@mui/material";
import useAnomaly from "@/hooks/useAnomaly.js";
import { fmt, tagAt, tagStats } from "@/lib/anomaly/model.js";
import {
  AnomalyPanel,
  AnomalyTable,
  EvidenceCallout,
  RuleChips,
  SensorStatus,
  TagLink,
} from "./AnomalyParts.jsx";
import SensorHeatmap from "./SensorHeatmap.jsx";
import SensorSummary from "./SensorSummary.jsx";

const SENSOR_TABS = [
  ["tags", "All tags"],
  ["calib", "Calibration"],
  ["heat", "Health over time"],
  ["anom", "Anomaly arms"],
  ["rules", "Rules & penalties"],
];
const STATUS_ORDER = { BAD: 0, SUSPECT: 1, "NO DATA": 2, GOOD: 3 };

function TagsTable() {
  const { model, nav } = useAnomaly();
  const [filters, setFilters] = useState({
    equipment: "",
    query: "",
  });
  const [sort, setSort] = useState({ key: "status", direction: "asc" });
  const update = (key, value) =>
    setFilters((previous) => ({ ...previous, [key]: value }));
  const rows = model.tagIds
    .map((tag) => ({
      tag,
      ...model.tags[tag],
      now: tagAt(model, tag, nav.time),
      stats: tagStats(model, tag, nav.from, nav.to),
    }))
    .filter(
      (row) =>
        (!filters.equipment || row.se === filters.equipment) &&
        (!nav.status || row.now.status === nav.status) &&
        (!nav.action || row.now.action === nav.action) &&
        (!filters.query ||
          `${row.tag} ${row.desc}`
            .toLowerCase()
            .includes(filters.query.toLowerCase())),
    );
  const value = (row) =>
    ({
      tag: row.tag,
      se: row.se,
      status: STATUS_ORDER[row.now.status] * 1000 + (row.now.health ?? 0),
      health: row.now.health ?? -1,
      mean: row.stats.mean ?? -1,
      excluded: row.stats.excluded ?? -1,
      readings: row.readings,
    })[sort.key];
  rows.sort(
    (a, b) =>
      (value(a) < value(b) ? -1 : value(a) > value(b) ? 1 : 0) *
      (sort.direction === "asc" ? 1 : -1),
  );
  const heading = (key, label) => (
    <TableSortLabel
      active={sort.key === key}
      direction={sort.key === key ? sort.direction : "asc"}
      onClick={() =>
        setSort({
          key,
          direction:
            sort.key === key && sort.direction === "asc" ? "desc" : "asc",
        })
      }
    >
      {label}
    </TableSortLabel>
  );
  return (
    <>
      <Stack
        direction="row"
        gap={1}
        alignItems="center"
        flexWrap="wrap"
        sx={{ mb: 1.5 }}
      >
        <Select
          size="small"
          value={filters.equipment}
          displayEmpty
          onChange={(event) => update("equipment", event.target.value)}
          inputProps={{ "aria-label": "Filter sensor sub-equipment" }}
          sx={{ minWidth: 200 }}
        >
          <MenuItem value="">All sub-equipment</MenuItem>
          {[...new Set(model.tagIds.map((tag) => model.tags[tag].se))]
            .sort()
            .map((id) => (
              <MenuItem key={id} value={id}>
                {id} · {model.equipment[id]?.short ?? "Line context"}
              </MenuItem>
            ))}
        </Select>
        <Select
          size="small"
          value={nav.status ?? ""}
          displayEmpty
          onChange={(event) =>
            nav.update({ status: event.target.value || null }, true)
          }
          inputProps={{ "aria-label": "Filter sensor status" }}
        >
          <MenuItem value="">All statuses</MenuItem>
          {Object.keys(STATUS_ORDER).map((status) => (
            <MenuItem key={status} value={status}>
              {status}
            </MenuItem>
          ))}
        </Select>
        <TextField
          size="small"
          placeholder="Search tag or function"
          value={filters.query}
          onChange={(event) => update("query", event.target.value)}
          slotProps={{ htmlInput: { "aria-label": "Search sensor tags" } }}
        />
        <Typography variant="caption" color="text.secondary">
          {rows.length} of {model.tagIds.length} tags
        </Typography>
      </Stack>
      {nav.action && (
        <Chip
          label={`Action: ${nav.action}`}
          onDelete={() => nav.update({ action: null }, true)}
          variant="outlined"
          sx={{ mb: 1 }}
        />
      )}
      <AnomalyPanel flush>
        <AnomalyTable
          rows={rows}
          rowKey={(row) => row.tag}
          onRowClick={(row) => nav.openTag(row.tag)}
          columns={[
            {
              id: "tag",
              label: heading("tag", "Tag"),
              render: (row) => (
                <Box>
                  <TagLink tag={row.tag} />
                  <Typography
                    sx={{ fontSize: 11, maxWidth: 320 }}
                    color="text.secondary"
                  >
                    {row.desc}
                  </Typography>
                </Box>
              ),
            },
            { id: "se", label: heading("se", "Sub-eq"), mono: true },
            {
              id: "status",
              label: heading("status", "Status · action"),
              render: (row) => (
                <SensorStatus status={row.now.status} action={row.now.action} />
              ),
            },
            {
              id: "health",
              label: heading("health", "Health"),
              mono: true,
              render: (row) => fmt(row.now.health),
            },
            {
              id: "mean",
              label: heading("mean", "Mean (range)"),
              mono: true,
              render: (row) => fmt(row.stats.mean, 1),
            },
            {
              id: "dominant",
              label: "Dominant issue",
              render: (row) => row.stats.dominant || "—",
            },
            {
              id: "excluded",
              label: heading("excluded", "% excluded"),
              mono: true,
              render: (row) => fmt(row.stats.excluded, 1),
            },
            {
              id: "hits",
              label: "Rules fired (range)",
              render: (row) => <RuleChips hits={row.stats.hits} />,
            },
            {
              id: "readings",
              label: heading("readings", "Readings"),
              mono: true,
            },
          ]}
        />
      </AnomalyPanel>
    </>
  );
}

function CalibrationTable() {
  const { model, nav } = useAnomaly();
  return (
    <>
      <EvidenceCallout>
        Limits were learned per tag on the healthy training window, before{" "}
        {model.trainingEnd}. “Off” means a statistic could not be learned
        reliably; physical ranges need I&amp;C confirmation.
      </EvidenceCallout>
      <AnomalyPanel flush>
        <AnomalyTable
          rows={model.tagIds.map((tag) => ({ tag, ...model.tags[tag] }))}
          rowKey={(row) => row.tag}
          onRowClick={(row) => nav.openTag(row.tag)}
          columns={[
            {
              id: "tag",
              label: "Tag",
              render: (row) => <TagLink tag={row.tag} />,
            },
            { id: "se", label: "Sub-eq", mono: true },
            ...[
              ["Physical", "phys_min", "phys_max"],
              ["Operating envelope", "op_min", "op_max"],
            ].map(([label, min, max]) => ({
              id: min,
              label,
              mono: true,
              render: (row) =>
                row.cfg[min] == null
                  ? "Off"
                  : `${fmt(row.cfg[min], 2)} … ${fmt(row.cfg[max], 2)}`,
            })),
            ...[
              ["median_gap_s", "Median gap (s)"],
              ["hold_limit_min", "STALE after (min)"],
              ["step_sigma", "Step σ"],
              ["spike_k", "Spike k"],
              ["max_rate_per_s", "Max rate /s"],
              ["noise_std_max", "Noise max"],
            ].map(([key, label]) => ({
              id: key,
              label,
              mono: true,
              render: (row) =>
                row.cfg[key] == null ? "Off" : fmt(row.cfg[key], 3),
            })),
            {
              id: "redundancy",
              label: "Redundancy",
              render: (row) =>
                row.cfg.redundancy_ref
                  ? `${row.cfg.redundancy_ref} ± ${fmt(row.cfg.redundancy_tol, 2)}`
                  : "—",
            },
            ...[
              ["spikes", "Spikes"],
              ["rate_hits", "Rate"],
              ["invalid_range", "Out of range"],
            ].map(([id, label]) => ({
              id,
              label,
              mono: true,
              render: (row) => row.cfg[id] ?? 0,
            })),
          ]}
        />
      </AnomalyPanel>
    </>
  );
}

function RulesTable() {
  const { model } = useAnomaly();
  const p = model.penalties;
  const rows = [
    [
      "MISSING",
      "No value while the line is producing, including dead tags and data gaps",
      "per minute",
      p.MISSING,
    ],
    ["QUALITY", "OPC quality not Good", "per reading", p.QUALITY],
    [
      "RANGE",
      "Outside physical range; held as no value",
      "per reading",
      p.RANGE,
    ],
    ["RAIL", "ADC rail value (±32767, 27648, 65535)", "per reading", p.RAIL],
    [
      "STALE",
      "No update longer than calibrated habitual hold while producing",
      "per minute",
      p.STALE,
    ],
    [
      "SPIKE",
      "Short excursion beyond k·σ returning within 5 seconds; readings removed",
      "per minute",
      `${p.SPIKE_BASE} + ${p.SPIKE_STEP}·(n−1), ≤ ${p.SPIKE_MAX}`,
    ],
    ["RATE", "Faster than 5 × the fastest healthy rate", "per reading", p.RATE],
    [
      "NOISE",
      "Minute roughness above healthy threshold",
      "per minute",
      `20 + 20·(r−1), ≤ ${p.NOISE_MAX}`,
    ],
    [
      "OP_ENVELOPE",
      "Outside healthy operating envelope while producing",
      "per minute",
      p.OP_ENVELOPE,
    ],
    [
      "REDUNDANCY",
      "Paired pressure transducers disagree beyond tolerance",
      "per minute, both tags",
      `${p.REDUNDANCY_BASE} + 20·(r−1), ≤ ${p.REDUNDANCY_MAX}`,
    ],
    ["WARMUP", "First 10 minutes after a data gap", "per minute", p.WARMUP],
  ].map(([rule, description, scope, penalty]) => ({
    rule,
    description,
    scope,
    penalty,
  }));
  return (
    <>
      <AnomalyPanel flush>
        <AnomalyTable
          rows={rows}
          columns={[
            { id: "rule", label: "Rule", mono: true },
            { id: "description", label: "Fires when" },
            { id: "scope", label: "Scope" },
            { id: "penalty", label: "Penalty", mono: true },
          ]}
        />
      </AnomalyPanel>
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", md: "repeat(3, 1fr)" },
          gap: 2,
        }}
      >
        <AnomalyPanel title="Combine">
          <Typography variant="body2">
            Health = 100 × Π(1 − p/100)
            <br />
            Trust = mean(health, 30 min)
          </Typography>
        </AnomalyPanel>
        <AnomalyPanel title="Act">
          <Typography variant="body2">
            USE when health and trust ≥ 80. DOWNWEIGHT when health ≥ 50.
            Otherwise EXCLUDE: blank the reading.
          </Typography>
        </AnomalyPanel>
        <AnomalyPanel title="Engine">
          <Typography variant="body2">
            Necessary indicator trust ≥ 0.5. Confidence floor 0.60. Coverage
            below 0.30 is Unknown; persistence is at least 3 minutes.
          </Typography>
        </AnomalyPanel>
      </Box>
    </>
  );
}

export default function SensorHealth() {
  const { model, nav } = useAnomaly();
  const tab = SENSOR_TABS.some(([id]) => id === nav.tab) ? nav.tab : "tags";
  return (
    <>
      <AnomalyPanel title="Sensor health · trust at the selected instant">
        <SensorSummary />
      </AnomalyPanel>
      <EvidenceCallout>
        Sensor health checks raw PLC readings before failure-mode indicators see
        them. EXCLUDE blanks the reading; DOWNWEIGHT lowers supporting evidence.
        This export has {model.summary["v1 episodes"]} declarations before the
        sensor layer and {model.summary["v2 episodes"]} after it.
      </EvidenceCallout>
      <Tabs
        value={tab}
        onChange={(_, value) =>
          nav.update({ tab: value === "tags" ? null : value })
        }
        variant="scrollable"
        scrollButtons="auto"
        aria-label="Sensor health views"
        sx={{ mb: 2, minHeight: 36 }}
      >
        {SENSOR_TABS.map(([id, label]) => (
          <Tab
            key={id}
            value={id}
            label={id === "tags" ? `All ${model.tagIds.length} tags` : label}
            sx={{ minHeight: 36, py: 0.5, textTransform: "none", fontSize: 12 }}
          />
        ))}
      </Tabs>
      {tab === "tags" && <TagsTable />}
      {tab === "calib" && <CalibrationTable />}
      {tab === "rules" && <RulesTable />}
      {(tab === "heat" || tab === "anom") && (
        <AnomalyPanel
          title={
            tab === "heat"
              ? "Sensor health over time"
              : "Per-tag anomaly · level / drift / step"
          }
          flush
        >
          <SensorHeatmap kind={tab === "heat" ? "health" : "anomaly"} />
        </AnomalyPanel>
      )}
      {tab === "anom" && (
        <EvidenceCallout>
          Anomaly arms compare each tag against its rolling 24-hour producing
          baseline. These are informational, do not change any score, and should
          be read together with failure-mode evidence.
        </EvidenceCallout>
      )}
    </>
  );
}
