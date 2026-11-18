import {
  Alert,
  Box,
  Button,
  Divider,
  Drawer,
  Stack,
  Typography,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import useAnomaly from "@/hooks/useAnomaly.js";
import { fmt, tagAt, tagStats, thresholdText } from "@/lib/anomaly/model.js";
import {
  AnomalyPanel,
  AnomalyTable,
  EvidenceCallout,
  ModeChip,
  RuleChips,
  SensorStatus,
  TagLink,
} from "./AnomalyParts.jsx";
import EpisodeEvidence from "./EpisodeEvidence.jsx";
import SensorHeatmap from "./SensorHeatmap.jsx";
import TagTrends from "./TagTrends.jsx";

function FailureModeDetail({ mode }) {
  const { model, nav } = useAnomaly();
  const declared = model.episodes.filter((e) => e.fm === mode.id);
  const baseline = model.baselineEpisodes.filter(
    (e) => e.fm === mode.id && e.outcome.startsWith("suppressed"),
  );
  const transients = model.transients.filter((e) => e.fm === mode.id);
  const all = [...declared, ...baseline, ...transients];
  const selected = nav.episodeId
    ? all.find((e) => e.k === nav.episodeId)
    : (declared.filter((e) => e.start <= nav.time).at(-1) ?? declared[0]);
  const parents = model.edges.filter((edge) => edge.c === mode.id);
  const children = model.edges.filter((edge) => edge.p === mode.id);
  const tags = [...new Set(mode.evidence.flatMap((e) => e.tags))]
    .filter((tag) => model.tags[tag])
    .slice(0, 8);
  return (
    <>
      <Stack direction="row" gap={1} alignItems="center" flexWrap="wrap">
        <ModeChip id={mode.id} />
        <Typography variant="caption">
          {mode.direct ? "Direct evidence" : "Inferred / residual evidence"} ·{" "}
          {mode.obs} · {mode.se}
        </Typography>
      </Stack>
      <EvidenceCallout>
        <Typography variant="caption">Recommended action</Typography>
        <Typography sx={{ fontSize: 14, fontWeight: 600, mt: 0.5 }}>
          {mode.action}
        </Typography>
      </EvidenceCallout>
      {mode.cand_note && (
        <EvidenceCallout>
          <b>Candidate set.</b> {mode.cand_note}
        </EvidenceCallout>
      )}
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
          gap: 2,
          my: 2,
        }}
      >
        <Box>
          <Typography variant="body2">
            Severity {mode.severity} · persistence set/clear{" "}
            {mode.p_used ?? "—"}/{mode.p_clear ?? "—"} min (configured{" "}
            {mode.p_cfg})
          </Typography>
          <Typography variant="body2" sx={{ mt: 0.5 }}>
            Healthy training declarations: {mode.train_decl ?? "—"}
          </Typography>
          <Typography variant="body2">
            Evaluated when {mode.states}
            {mode.ramp ? ", including ramps" : ", no ramps"}
          </Typography>
          <Typography variant="body2">
            FMEA {mode.ref} · {mode.component}
          </Typography>
        </Box>
        <Box>
          <Typography variant="body2">
            <b>Why it happens.</b> {mode.explanation}
          </Typography>
          <Typography variant="body2" sx={{ mt: 1 }}>
            <b>Effect.</b> {mode.effect}
          </Typography>
        </Box>
      </Box>
      {[
        ["necessary", "Necessary evidence · confidence floor 0.60 when met"],
        ["supporting", "Supporting evidence · trust-weighted confidence"],
        ["exclusion", "Exclusions · present means not this mode"],
      ].map(([role, label]) => {
        const rows = mode.evidence.filter((e) => e.role === role);
        if (!rows.length && role === "exclusion") return null;
        return (
          <AnomalyPanel title={label} key={role}>
            {rows.length ? (
              rows.map((e, index) => (
                <Box
                  key={e.id ?? index}
                  sx={{
                    py: 1,
                    borderBottom: index < rows.length - 1 ? 1 : 0,
                    borderColor: "divider",
                  }}
                >
                  <Typography
                    sx={{ fontSize: 12, fontFamily: "'Geist Mono', monospace" }}
                  >
                    {e.ind} · {thresholdText(e)} · weight {e.w}
                  </Typography>
                  <Typography variant="body2">{e.meaning}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {e.why}
                  </Typography>
                  <Stack
                    direction="row"
                    gap={0.75}
                    flexWrap="wrap"
                    sx={{ mt: 0.5 }}
                  >
                    {e.tags.map((tag) => (
                      <TagLink key={tag} tag={tag} />
                    ))}
                  </Stack>
                </Box>
              ))
            ) : (
              <Typography variant="body2" color="text.secondary">
                None.{" "}
                {role === "supporting"
                  ? "Confidence stays at the 0.60 floor."
                  : ""}
              </Typography>
            )}
          </AnomalyPanel>
        );
      })}
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
          gap: 2,
        }}
      >
        {[
          ["Upstream · causes", parents, "p"],
          ["Downstream · consequences", children, "c"],
        ].map(([label, edges, key]) => (
          <AnomalyPanel title={label} key={label}>
            {edges.length ? (
              edges.map((edge, index) => (
                <Stack
                  key={index}
                  direction="row"
                  gap={1}
                  alignItems="center"
                  flexWrap="wrap"
                  sx={{ mb: 0.5 }}
                >
                  <ModeChip id={edge[key]} />
                  <Typography variant="caption">
                    lag {edge.lo}–{edge.hi} min · {model.modes[edge[key]]?.name}
                  </Typography>
                </Stack>
              ))
            ) : (
              <Typography variant="body2" color="text.secondary">
                No defined link
              </Typography>
            )}
          </AnomalyPanel>
        ))}
      </Box>
      <Typography component="h3" sx={{ fontSize: 14, fontWeight: 600, my: 1 }}>
        Episodes · select one to inspect raw evidence
      </Typography>
      <Stack direction="row" gap={0.75} flexWrap="wrap" sx={{ mb: 1 }}>
        {[...declared, ...baseline].map((e) => (
          <Button
            variant={selected?.k === e.k ? "contained" : "outlined"}
            key={e.k}
            onClick={() => nav.update({ ep: e.k }, true)}
          >
            {e.outcome ? "v1 " : ""}
            {e.onset.slice(5)} · {e.min} min
            {e.conf != null ? ` · conf ${fmt(e.conf, 2)}` : ` · ${e.outcome}`}
          </Button>
        ))}
      </Stack>
      {!declared.length && !baseline.length && (
        <Typography variant="body2" color="text.secondary">
          Never declared in this export.
        </Typography>
      )}
      <Typography variant="caption" color="text.secondary">
        {transients.length} transients · evidence shorter than persistence, not
        alerted
      </Typography>
      <Stack direction="row" gap={0.5} flexWrap="wrap" sx={{ mb: 1 }}>
        {transients.slice(-8).map((e) => (
          <Button
            key={e.k}
            onClick={() => nav.update({ ep: e.k }, true)}
            size="small"
          >
            {e.onset.slice(5)} ({e.min} min)
          </Button>
        ))}
      </Stack>
      {nav.episodeId && !selected && (
        <Alert severity="warning" sx={{ my: 1 }}>
          This episode is not in the available export. Select an episode above.
        </Alert>
      )}
      {selected ? (
        <EpisodeEvidence
          key={`${mode.id}-${selected.k}`}
          mode={mode}
          episode={selected}
        />
      ) : (
        <AnomalyPanel
          title="Tags behind this mode over the selected range"
          flush
        >
          <TagTrends tags={tags} />
        </AnomalyPanel>
      )}
    </>
  );
}

function TagDetail({ tag }) {
  const { model, nav, trendTags, setTrendTags } = useAnomaly();
  const meta = model.tags[tag],
    now = tagAt(model, tag, nav.time),
    stats = tagStats(model, tag, nav.from, nav.to),
    cfg = meta.cfg;
  const details = [
    [
      "Sub-equipment",
      `${meta.se} · ${model.equipment[meta.se]?.short ?? "Line context"}`,
    ],
    ["Measurement / unit", `${meta.meas} · ${meta.unit}`],
    ["Component", meta.comp],
    ["Grid / assessed", `${cfg.grid} · ${cfg.assessed}`],
    [
      "Physical range",
      `${fmt(cfg.phys_min, 1)} … ${fmt(cfg.phys_max, 1)} (${cfg.phys_basis})`,
    ],
    [
      "Operating envelope",
      cfg.op_min == null
        ? "Off"
        : `${fmt(cfg.op_min, 2)} … ${fmt(cfg.op_max, 2)}`,
    ],
    [
      "Habitual hold (healthy / full)",
      `${fmt(cfg.habitual_hold_s)} / ${fmt(cfg.habitual_hold_full_s)} s`,
    ],
    [
      "STALE after",
      cfg.hold_limit_min == null ? "Off" : `${fmt(cfg.hold_limit_min, 1)} min`,
    ],
    ["Step σ / spike k", `${fmt(cfg.step_sigma, 3)} / ${fmt(cfg.spike_k)}`],
    ["Max rate /s", fmt(cfg.max_rate_per_s, 3)],
    ["Noise max", fmt(cfg.noise_std_max, 3)],
    [
      "Redundancy",
      cfg.redundancy_ref
        ? `${cfg.redundancy_ref} ± ${fmt(cfg.redundancy_tol, 2)}`
        : "None",
    ],
  ];
  return (
    <>
      <Stack direction="row" gap={1} alignItems="center" flexWrap="wrap">
        <SensorStatus status={now.status} action={now.action} />
        <Typography variant="caption" color="text.secondary">
          Selected range: mean health {fmt(stats.mean, 1)} ·{" "}
          {fmt(stats.excluded, 1)}% excluded
        </Typography>
        <Button
          variant="contained"
          sx={{ ml: "auto" }}
          onClick={() => {
            setTrendTags(
              [...trendTags.filter((id) => id !== tag), tag].slice(-8),
            );
            nav.go("trends");
          }}
        >
          Plot in Trends
        </Button>
      </Stack>
      <Typography variant="body2" sx={{ my: 1.5 }}>
        {meta.desc}
      </Typography>
      {meta.notes && <EvidenceCallout>{meta.notes}</EvidenceCallout>}
      <Box
        component="dl"
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", sm: "max-content 1fr" },
          gap: "6px 16px",
          fontSize: 12,
          my: 2,
        }}
      >
        {details.map(([label, value]) => (
          <Box key={label} sx={{ display: "contents" }}>
            <Box component="dt" sx={{ color: "text.secondary" }}>
              {label}
            </Box>
            <Box
              component="dd"
              sx={{
                m: 0,
                overflowWrap: "anywhere",
                fontFamily: "'Geist Mono', monospace",
              }}
            >
              {value}
            </Box>
          </Box>
        ))}
      </Box>
      <AnomalyPanel title="Raw value and sensor health" flush>
        <TagTrends tags={[tag]} health />
      </AnomalyPanel>
      <AnomalyPanel title="Per-tag anomaly · level / drift / step" flush>
        <SensorHeatmap tags={[tag]} kind="anomaly" />
      </AnomalyPanel>
      <EvidenceCallout>
        Normal / Watch / Anomaly / Unscored are exported anomaly-arm states
        against a rolling 24-hour producing baseline. Anomaly arms do not change
        failure-mode health.
      </EvidenceCallout>
      <AnomalyPanel
        title="Sensor health report windows · producing time per day"
        flush
      >
        <AnomalyTable
          rows={meta.daily}
          columns={[
            { id: "day", label: "Window", mono: true, render: (row) => row[0] },
            ...[
              [1, "Mean health"],
              [2, "p10"],
              [3, "% good"],
              [4, "% suspect"],
              [5, "% bad"],
              [6, "% excluded"],
              [7, "Readings"],
            ].map(([index, label]) => ({
              id: String(index),
              label,
              mono: true,
              render: (row) => fmt(row[index], index === 7 ? 0 : 1),
            })),
            {
              id: "rules",
              label: "Rules fired",
              render: (row) => <RuleChips hits={row[9]} />,
            },
          ]}
        />
      </AnomalyPanel>
    </>
  );
}

export default function AnomalyDrawer() {
  const { model, nav } = useAnomaly();
  const mode = model.modes[nav.modeId],
    tag = model.tags[nav.tagId];
  const open = Boolean(nav.modeId || nav.tagId);
  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={nav.closeDrawer}
      slotProps={{
        paper: {
          sx: {
            width: "min(1060px, 100vw)",
            maxWidth: "100vw",
            bgcolor: "background.paper",
          },
          role: "dialog",
          "aria-modal": true,
          "aria-labelledby": "anomaly-detail-title",
        },
      }}
    >
      <Stack
        direction="row"
        gap={2}
        alignItems="flex-start"
        sx={{ p: 2, bgcolor: (t) => t.custom.anomaly.raised, flexShrink: 0 }}
      >
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography variant="caption" color="text.secondary">
            {mode
              ? `Failure mode · ${mode.se}`
              : tag
                ? `Tag · ${tag.se}`
                : "Detail unavailable"}
          </Typography>
          <Typography
            id="anomaly-detail-title"
            component="h2"
            sx={{ fontSize: 17, fontWeight: 600, overflowWrap: "anywhere" }}
          >
            {mode ? `${mode.id} · ${mode.name}` : nav.tagId || nav.modeId}
          </Typography>
        </Box>
        <Button
          onClick={nav.closeDrawer}
          startIcon={<CloseIcon />}
          aria-label="Close detail"
        >
          Close
        </Button>
      </Stack>
      <Divider />
      <Box sx={{ p: 2, overflowY: "auto", flex: 1, minHeight: 0 }}>
        {mode ? (
          <FailureModeDetail key={mode.id} mode={mode} />
        ) : tag ? (
          <TagDetail key={nav.tagId} tag={nav.tagId} />
        ) : (
          <Alert severity="warning">
            This item is not present in the available data.
          </Alert>
        )}
      </Box>
    </Drawer>
  );
}
