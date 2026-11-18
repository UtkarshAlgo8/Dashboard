import { Box, Button, Chip, Stack, Tab, Tabs, Typography } from "@mui/material";
import useAnomaly from "@/hooks/useAnomaly.js";
import { fmt, overlaps, parseTime } from "@/lib/anomaly/model.js";
import {
  AnomalyPanel,
  AnomalyTable,
  EvidenceCallout,
  ModeChip,
} from "./AnomalyParts.jsx";

export default function Diagnoses() {
  const { model, nav } = useAnomaly();
  const tab = ["hist", "v1", "trans", "unrec"].includes(nav.tab)
    ? nav.tab
    : "hist";
  const history = model.episodes
    .filter((e) => overlaps(e, nav.from, nav.to) && e.start <= nav.time)
    .slice()
    .reverse();
  const transients = model.transients.filter((e) =>
    overlaps(e, nav.from, nav.to),
  );
  const groups = {};
  transients.forEach((episode) => {
    (groups[episode.fm] ??= []).push(episode);
  });
  const grouped = Object.entries(groups)
    .map(([fm, rows]) => ({
      fm,
      name: model.modes[fm].name,
      se: model.modes[fm].se,
      count: rows.length,
      longest: Math.max(...rows.map((e) => e.min)),
      needs: rows[0].needs,
      latest: rows.at(-1),
    }))
    .sort((a, b) => b.count - a.count);
  const metrics = [
    [
      "Declared · v1 → v2",
      `${model.baselineEpisodes.length} → ${model.episodes.length}`,
      "whole export (train + test)",
    ],
    [
      "≤ 5 minutes",
      `${model.summary["v1 <= 5 min"]} → ${model.summary["v2 <= 5 min"]}`,
      `median ${model.summary["v1 median min"]} → ${model.summary["v2 median min"]} min`,
    ],
    [
      "Suppressed v1 declarations",
      model.baselineEpisodes.filter((e) => e.outcome.startsWith("suppressed"))
        .length,
      "sensor, short evidence, or engine",
    ],
    [
      "New in v2",
      model.episodes.filter((e) => e.new).length,
      "thresholds learned on clean data",
    ],
    [
      "Transients · not alerted",
      model.transients.length,
      "evidence shorter than persistence",
    ],
  ];
  return (
    <>
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "repeat(2, 1fr)", lg: "repeat(5, 1fr)" },
          gap: 1.5,
          mb: 2,
        }}
      >
        {metrics.map(([label, value, detail]) => (
          <AnomalyPanel key={label} sx={{ mb: 0 }}>
            <Typography variant="caption" color="text.secondary">
              {label}
            </Typography>
            <Typography
              sx={{ font: "600 28px 'Geist Mono', monospace", my: 0.5 }}
            >
              {value}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {detail}
            </Typography>
          </AnomalyPanel>
        ))}
      </Box>
      <Tabs
        value={tab}
        onChange={(_, value) =>
          nav.update({ tab: value === "hist" ? null : value })
        }
        variant="scrollable"
        scrollButtons="auto"
        aria-label="Diagnosis views"
        sx={{ mb: 1.5 }}
      >
        {[
          ["hist", `Diagnosis history · ${history.length}`],
          ["v1", `Before / after · ${model.baselineEpisodes.length}`],
          ["trans", `Transients · ${transients.length}`],
          ["unrec", `Unrecognised (IF) · ${model.unrecognised.length}`],
        ].map(([id, label]) => (
          <Tab
            key={id}
            value={id}
            label={label}
            sx={{ textTransform: "none", fontSize: 12 }}
          />
        ))}
      </Tabs>
      {tab === "hist" && (
        <AnomalyPanel flush>
          <AnomalyTable
            rows={history}
            onRowClick={(e) => nav.openMode(e.fm, e.k)}
            columns={[
              { id: "declared", label: "Declared", mono: true },
              { id: "onset", label: "Onset", mono: true },
              { id: "min", label: "Duration (min)", mono: true },
              {
                id: "fm",
                label: "Mode",
                render: (e) => (
                  <Stack gap={0.5} alignItems="flex-start">
                    <ModeChip
                      id={e.fm}
                      root={e.role !== "consequential"}
                      episode={e.k}
                    />
                    {e.new && (
                      <Chip size="small" label="New in v2" variant="outlined" />
                    )}
                  </Stack>
                ),
              },
              { id: "name", label: "Name", minWidth: 220 },
              { id: "se", label: "Sub-eq", mono: true },
              {
                id: "role",
                label: "Role",
                render: (e) =>
                  e.role === "consequential" ? (
                    <Box>
                      explained ← <ModeChip id={e.by} />
                    </Box>
                  ) : (
                    "root / independent"
                  ),
              },
              {
                id: "conf",
                label: "Confidence",
                mono: true,
                render: (e) => fmt(e.conf, 2),
              },
              {
                id: "ntrust",
                label: "Necessary trust",
                mono: true,
                render: (e) => fmt(e.ntrust, 2),
              },
              {
                id: "cov",
                label: "Coverage",
                mono: true,
                render: (e) => fmt(e.cov, 2),
              },
              {
                id: "action",
                label: "Action",
                minWidth: 260,
                render: (e) => model.modes[e.fm].action,
              },
            ]}
          />
        </AnomalyPanel>
      )}
      {tab === "v1" && (
        <>
          <EvidenceCallout>
            Every v1 declaration and its v2 outcome. Suppressed sensor =
            excluded or de-spiked evidence; too short = evidence shorter than
            minimum persistence; engine = trusted evidence that did not meet
            recalibrated thresholds or persistence. Click a mode to inspect the
            exported raw evidence.
          </EvidenceCallout>
          <AnomalyPanel flush>
            <AnomalyTable
              rows={model.baselineEpisodes}
              onRowClick={(e) => nav.openMode(e.fm, e.k)}
              columns={[
                { id: "onset", label: "Onset", mono: true },
                { id: "min", label: "Duration (min)", mono: true },
                {
                  id: "fm",
                  label: "Mode",
                  render: (e) => <ModeChip id={e.fm} episode={e.k} />,
                },
                { id: "name", label: "Name" },
                { id: "se", label: "Sub-eq", mono: true },
                { id: "period", label: "Period" },
                {
                  id: "outcome",
                  label: "v2 outcome",
                  render: (e) => (
                    <Chip
                      size="small"
                      label={e.outcome}
                      color={
                        e.outcome.includes("sensor")
                          ? "error"
                          : e.outcome.startsWith("kept")
                            ? "default"
                            : "warning"
                      }
                      variant="outlined"
                    />
                  ),
                },
                { id: "reason", label: "Why", minWidth: 350 },
              ]}
            />
          </AnomalyPanel>
        </>
      )}
      {tab === "trans" && (
        <>
          <EvidenceCallout>
            A transient has necessary evidence but lasts less than its
            persistence. It raises no alert and does not lower health. Frequent
            transients may indicate an emerging fault or a threshold that is too
            tight.
          </EvidenceCallout>
          <AnomalyPanel flush>
            <AnomalyTable
              rows={grouped}
              rowKey={(e) => e.fm}
              onRowClick={(e) => nav.openMode(e.fm, e.latest.k)}
              columns={[
                {
                  id: "fm",
                  label: "Mode",
                  render: (e) => <ModeChip id={e.fm} episode={e.latest.k} />,
                },
                { id: "name", label: "Name" },
                { id: "se", label: "Sub-eq", mono: true },
                { id: "count", label: "Transients", mono: true },
                { id: "longest", label: "Longest (min)", mono: true },
                { id: "needs", label: "Needs (min)", mono: true },
                {
                  id: "latest",
                  label: "Latest",
                  render: (e) => e.latest.onset,
                },
              ]}
            />
          </AnomalyPanel>
        </>
      )}
      {tab === "unrec" && (
        <>
          <EvidenceCallout>
            Isolation Forest health below 75 for at least 10 minutes with no
            declared mode on the same sub-equipment. Capped at Advisory, never
            Critical. These are model observations, not confirmed failures.
          </EvidenceCallout>
          <AnomalyPanel flush>
            <AnomalyTable
              rows={model.unrecognised}
              columns={[
                {
                  id: "start",
                  label: "Start",
                  mono: true,
                  render: (e) => (
                    <Button
                      size="small"
                      onClick={() => nav.setTime(parseTime(e.start))}
                    >
                      {e.start}
                    </Button>
                  ),
                },
                { id: "min", label: "Duration (min)", mono: true },
                {
                  id: "se",
                  label: "Sub-equipment",
                  render: (e) => (
                    <Button size="small" onClick={() => nav.go("sub", e.se)}>
                      {e.se} · {model.equipment[e.se]?.short}
                    </Button>
                  ),
                },
                { id: "ifmin", label: "IF minimum", mono: true },
                {
                  id: "top",
                  label: "What the model reacted to",
                  minWidth: 300,
                },
                { id: "period", label: "Period" },
              ]}
            />
          </AnomalyPanel>
        </>
      )}
    </>
  );
}
