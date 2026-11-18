import { useReducer } from "react";
import {
  Box,
  Button,
  Checkbox,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import useAnomaly from "@/hooks/useAnomaly.js";
import {
  diagnosisAt,
  equipmentAt,
  fmt,
  overlaps,
  tagAt,
  tagStats,
} from "@/lib/anomaly/model.js";
import {
  AnomalyPanel,
  AnomalyTable,
  CoverageMeter,
  EvidenceCallout,
  HealthBadge,
  ModeChip,
  SensorStatus,
  TagLink,
} from "./AnomalyParts.jsx";
import HealthTrend from "./HealthTrend.jsx";
import TagTrends from "./TagTrends.jsx";

export default function SubEquipment() {
  const { model, nav, setTrendTags } = useAnomaly();
  const se = model.equipment[nav.sub];
  const initial = se.tags
    .filter(
      (tag) =>
        model.tags[tag] &&
        model.tags[tag].status !== "BAD" &&
        model.tags[tag].role !== "counter",
    )
    .slice(0, 4);
  const [selection, update] = useReducer(
    (state, action) => ({ ...state, ...action }),
    { draft: initial, plotted: initial, mode: "stack" },
  );
  const now = equipmentAt(model, nav.sub, nav.time);
  const modes = Object.values(model.modes).filter((fm) => fm.se === nav.sub);
  const active = diagnosisAt(model, nav.time).episodes.filter(
    (e) => e.se === nav.sub,
  );
  const tags = se.tags
    .filter((tag) => model.tags[tag])
    .map((tag) => ({
      tag,
      ...model.tags[tag],
      now: tagAt(model, tag, nav.time),
      stats: tagStats(model, tag, nav.from, nav.to),
    }));
  const modeRole = (mode) => {
    const episode = active.find((e) => e.fm === mode.id);
    if (episode) return episode.role === "consequential" ? "explained" : "root";
    if (
      model.transients.some(
        (e) => e.fm === mode.id && e.start <= nav.time && e.end >= nav.time,
      )
    )
      return "transient";
    return model.episodes.some(
      (e) => e.fm === mode.id && overlaps(e, nav.from, nav.to),
    )
      ? "declared in range"
      : "quiet";
  };
  return (
    <>
      <Button onClick={() => nav.go("home")} sx={{ mb: 1 }}>
        ← Home
      </Button>
      <AnomalyPanel>
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr", md: "1.2fr 1fr" },
            gap: 2,
          }}
        >
          <Box>
            <Typography variant="caption" color="text.secondary">
              {nav.sub} · {se.section} · criticality {se.crit} · monitored{" "}
              {se.monitored}
            </Typography>
            <Typography
              component="h3"
              sx={{ fontSize: 20, fontWeight: 600, my: 0.5 }}
            >
              {se.name}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {se.desc}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Placement: {se.placement}
            </Typography>
            <Stack direction="row" gap={0.5} flexWrap="wrap" sx={{ mt: 1 }}>
              {se.nodes.map((node, index) => (
                <Typography
                  key={index}
                  variant="caption"
                  sx={{ px: 0.5, bgcolor: (t) => t.custom.anomaly.track }}
                >
                  {node[0]} › {node[1]}
                </Typography>
              ))}
            </Stack>
          </Box>
          <Box>
            <Stack direction="row" gap={2} alignItems="center" flexWrap="wrap">
              <Typography sx={{ font: "600 44px 'Geist Mono', monospace" }}>
                {now.value == null ? "No reading" : `${fmt(now.value)}/100`}
              </Typography>
              <HealthBadge band={now.band} />
            </Stack>
            {!se.blind && <CoverageMeter value={now.coverage} />}
            <Typography variant="caption" color="text.secondary">
              {se.blind
                ? "No signal attached: always Unknown."
                : now.coverage != null && now.coverage < 0.3
                  ? "Trust-weighted coverage below 0.30: engine score withheld."
                  : now.value == null
                    ? "No producing score at this instant."
                    : "Partial coverage is not a complete view of equipment health."}
            </Typography>
          </Box>
        </Box>
      </AnomalyPanel>
      {se.blind ? (
        <EvidenceCallout>
          No PLC tag or vibration signal is attached to {se.name}. It is listed
          so it is never reported as healthy.{" "}
          <Button onClick={() => nav.go("hierarchy")}>
            View hierarchy and coverage
          </Button>
        </EvidenceCallout>
      ) : (
        <>
          <AnomalyPanel title="Health trend" flush>
            <HealthTrend equipment={nav.sub} />
          </AnomalyPanel>
          <AnomalyPanel
            title={`Tags · ${tags.length}`}
            action={
              <Stack direction="row" gap={1}>
                <Button onClick={() => update({ plotted: selection.draft })}>
                  Plot selected
                </Button>
                <Button
                  onClick={() => {
                    setTrendTags(selection.draft);
                    nav.go("trends");
                  }}
                >
                  Open in Trends
                </Button>
              </Stack>
            }
            flush
          >
            <AnomalyTable
              rows={tags}
              rowKey={(row) => row.tag}
              onRowClick={(row) => nav.openTag(row.tag)}
              maxHeight={440}
              columns={[
                {
                  id: "select",
                  label: "Plot",
                  render: (row) => (
                    <Checkbox
                      size="small"
                      checked={selection.draft.includes(row.tag)}
                      disabled={
                        !selection.draft.includes(row.tag) &&
                        selection.draft.length >= 8
                      }
                      onClick={(event) => event.stopPropagation()}
                      onChange={(_, checked) =>
                        update({
                          draft: checked
                            ? [...selection.draft, row.tag]
                            : selection.draft.filter((tag) => tag !== row.tag),
                        })
                      }
                      slotProps={{ input: { "aria-label": `Plot ${row.tag}` } }}
                    />
                  ),
                },
                {
                  id: "tag",
                  label: "Tag",
                  render: (row) => (
                    <Box>
                      <TagLink tag={row.tag} />
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        display="block"
                      >
                        {row.desc}
                      </Typography>
                    </Box>
                  ),
                },
                { id: "unit", label: "Unit" },
                {
                  id: "envelope",
                  label: "Operating envelope",
                  mono: true,
                  render: (row) =>
                    row.cfg.op_min == null
                      ? "—"
                      : `${fmt(row.cfg.op_min, 1)} – ${fmt(row.cfg.op_max, 1)}`,
                },
                {
                  id: "status",
                  label: "Status · action now",
                  render: (row) => (
                    <SensorStatus
                      status={row.now.status}
                      action={row.now.action}
                    />
                  ),
                },
                {
                  id: "health",
                  label: "Health",
                  mono: true,
                  render: (row) => fmt(row.now.health),
                },
                {
                  id: "dominant",
                  label: "Dominant issue (range)",
                  render: (row) => row.stats.dominant || "—",
                },
                {
                  id: "excluded",
                  label: "% excluded",
                  mono: true,
                  render: (row) => fmt(row.stats.excluded, 1),
                },
              ]}
            />
          </AnomalyPanel>
          <AnomalyPanel title={`Failure modes · ${modes.length}`} flush>
            <AnomalyTable
              rows={modes}
              onRowClick={(mode) => nav.openMode(mode.id)}
              columns={[
                {
                  id: "id",
                  label: "Mode",
                  render: (mode) => (
                    <ModeChip id={mode.id} root={modeRole(mode) === "root"} />
                  ),
                },
                { id: "name", label: "Name" },
                { id: "severity", label: "Severity", mono: true },
                {
                  id: "persistence",
                  label: "Set / clear (min)",
                  mono: true,
                  render: (mode) =>
                    `${mode.p_used ?? "—"} / ${mode.p_clear ?? "—"}`,
                },
                { id: "role", label: "Now", render: modeRole },
                {
                  id: "episodes",
                  label: "Episodes in range",
                  mono: true,
                  render: (mode) =>
                    model.episodes.filter(
                      (e) => e.fm === mode.id && overlaps(e, nav.from, nav.to),
                    ).length,
                },
              ]}
            />
          </AnomalyPanel>
          <AnomalyPanel
            title="Raw tags against their operating envelope"
            action={
              <ToggleButtonGroup
                size="small"
                value={selection.mode}
                exclusive
                onChange={(_, mode) => {
                  if (mode) update({ mode });
                }}
                aria-label="Raw tag layout"
              >
                <ToggleButton value="stack">Stacked</ToggleButton>
                <ToggleButton value="overlay">
                  Overlay (normalised)
                </ToggleButton>
              </ToggleButtonGroup>
            }
            flush
          >
            <TagTrends
              tags={selection.plotted}
              mode={selection.mode}
              normalize
            />
          </AnomalyPanel>
          <Typography variant="caption" color="text.secondary">
            Up to 8 tags · line = mean · band = raw min–max · red = excluded ·
            dashed = calibrated operating envelope.
          </Typography>
        </>
      )}
    </>
  );
}
