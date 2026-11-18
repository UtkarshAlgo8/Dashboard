import {
  Box,
  Button,
  CardActionArea,
  Paper,
  Stack,
  Typography,
  useTheme,
} from "@mui/material";
import useAnomaly from "@/hooks/useAnomaly.js";
import { SECTIONS } from "@/lib/anomaly/constants.js";
import {
  diagnosisAt,
  equipmentAt,
  fmt,
  formatTime,
  healthBand,
  producingAt,
  valueAt,
} from "@/lib/anomaly/model.js";
import {
  AnomalyPanel,
  AnomalyTable,
  CoverageMeter,
  EvidenceCallout,
  HealthBadge,
  ModeChip,
} from "./AnomalyParts.jsx";
import HealthTrend from "./HealthTrend.jsx";
import SensorSummary from "./SensorSummary.jsx";

function EquipmentTile({ id }) {
  const { model, nav } = useAnomaly();
  const p = useTheme().custom.anomaly;
  const se = model.equipment[id];
  const now = equipmentAt(model, id, nav.time);
  let path = "",
    previous = false;
  const stride = Math.max(1, Math.floor(se.health.length / 100));
  for (let i = 0; i < se.health.length; i += stride) {
    const value = se.health[i];
    if (value == null || se.unknown[i]) {
      previous = false;
      continue;
    }
    path += `${previous ? "L" : "M"}${(300 * i) / se.health.length},${38 - value * 0.35} `;
    previous = true;
  }
  return (
    <Paper
      variant="outlined"
      sx={{
        borderColor: now.band === "Critical" ? "error.main" : "divider",
        borderStyle: se.blind ? "dashed" : "solid",
        overflow: "hidden",
      }}
    >
      <CardActionArea
        onClick={() => nav.go("sub", id)}
        sx={{ height: "100%", p: 1.25, display: "block", textAlign: "left" }}
      >
        <Stack
          direction="row"
          alignItems="center"
          justifyContent="space-between"
          gap={0.5}
        >
          <Typography variant="caption" fontFamily="'Geist Mono', monospace">
            {id}
          </Typography>
          <HealthBadge band={now.band} />
        </Stack>
        <Typography
          sx={{ fontSize: 13, fontWeight: 600, minHeight: 36, mt: 1 }}
        >
          {se.name}
        </Typography>
        <Typography
          sx={{
            fontFamily: "'Geist Mono', monospace",
            fontSize: se.blind || now.value == null ? 20 : 30,
            fontWeight: 600,
            my: 0.5,
          }}
        >
          {now.value == null ? "No reading" : fmt(now.value)}
        </Typography>
        {se.blind ? (
          <Typography variant="caption" color="text.secondary">
            No PLC tag or vibration signal attached. Always Unknown, never
            Normal.
          </Typography>
        ) : (
          <>
            <CoverageMeter value={now.coverage} label="Coverage" />
            <Box
              component="svg"
              viewBox="0 0 300 40"
              aria-label={`${id} health history`}
              sx={{ width: "100%", height: 40, display: "block" }}
            >
              <path d={path} stroke={p.ink} strokeWidth="1.3" fill="none" />
            </Box>
          </>
        )}
        <Stack
          direction="row"
          justifyContent="space-between"
          gap={1}
          sx={{ mt: 1 }}
        >
          <Typography variant="caption" color="text.secondary">
            {now.dominant ? `dominant ${now.dominant}` : "no dominant mode"}
          </Typography>
          <Typography variant="caption">crit {se.crit}</Typography>
        </Stack>
      </CardActionArea>
    </Paper>
  );
}

export default function AnomalyHome() {
  const { model, nav } = useAnomaly();
  const producing = producingAt(model, nav.time);
  const health = producing
    ? valueAt(model, model.overall.health, nav.time)
    : null;
  const diagnosis = diagnosisAt(model, nav.time);
  const roots = diagnosis.episodes.filter((e) => e.role !== "consequential");
  const consequences = diagnosis.episodes.filter(
    (e) => e.role === "consequential",
  );
  const dominant =
    roots.slice().sort((a, b) => b.sxc - a.sxc)[0] ?? diagnosis.episodes[0];
  const scored = model.equipmentIds.filter((id) => !model.equipment[id].blind);
  const unknown = scored.filter(
    (id) => equipmentAt(model, id, nav.time).band === "Unknown",
  );
  const recent = model.episodes
    .filter((e) => e.start <= nav.time)
    .slice(-6)
    .reverse();
  return (
    <>
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: "1fr",
          "@media (min-width: 1401px)": { gridTemplateColumns: "1.25fr 1fr" },
          gap: 2,
        }}
      >
        <AnomalyPanel title="Overall health · CTP 5X Quintoplex">
          <Typography variant="caption" color="text.secondary">
            {unknown.length} of {scored.length} scored sub-equipment Unknown ·{" "}
            {model.equipmentIds.length - scored.length} blind
          </Typography>
          <Stack
            direction="row"
            gap={2}
            alignItems="center"
            flexWrap="wrap"
            sx={{ my: 1.5 }}
          >
            <Typography sx={{ font: "600 56px/1 'Geist Mono', monospace" }}>
              {fmt(health)}
              <Typography
                component="span"
                sx={{ fontSize: 16, color: "text.secondary" }}
              >
                /100
              </Typography>
            </Typography>
            <Stack gap={0.75} alignItems="flex-start">
              <HealthBadge band={healthBand(health)} />
              {!producing && (
                <Typography variant="caption">
                  Line not producing · score withheld
                </Typography>
              )}
              {dominant && <ModeChip id={dominant.fm} root />}
            </Stack>
          </Stack>
          <Typography sx={{ fontWeight: 600, fontSize: 14 }}>
            {!producing
              ? "The line is not producing at this instant, so no health score is computed."
              : dominant
                ? model.modes[dominant.fm].action
                : "No failure mode declared. Keep normal monitoring."}
          </Typography>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ display: "block", mt: 1.5 }}
          >
            Overall = worst sub-equipment · {diagnosis.episodes.length}{" "}
            declarations in force · as of {formatTime(nav.time)} IST
          </Typography>
        </AnomalyPanel>
        <AnomalyPanel
          title="Active diagnosis"
          action={
            <Button size="small" onClick={() => nav.go("graph")}>
              Trace in graph
            </Button>
          }
        >
          {!diagnosis.episodes.length ? (
            <Box sx={{ py: 2 }}>
              <Typography fontWeight={600}>No diagnosis in force</Typography>
              <Typography variant="body2" color="text.secondary">
                Short evidence that does not persist is recorded as a transient
                and does not raise an alert.
              </Typography>
            </Box>
          ) : (
            <>
              <Typography variant="caption" color="text.secondary">
                {diagnosis.recent
                  ? "Most recent diagnosis (ended)"
                  : "Declared at this instant"}{" "}
                · onset {dominant.onset}
              </Typography>
              {roots.map((episode) => (
                <EvidenceCallout key={episode.k}>
                  <ModeChip id={episode.fm} root episode={episode.k} />
                  <Typography sx={{ mt: 0.5, fontWeight: 600, fontSize: 13 }}>
                    {episode.name}
                  </Typography>
                  <Typography variant="caption">
                    {episode.se} · {episode.min} min · necessary trust{" "}
                    {fmt(episode.ntrust, 2)}
                  </Typography>
                </EvidenceCallout>
              ))}
              {consequences.length > 0 && (
                <Stack direction="row" gap={0.5} flexWrap="wrap">
                  <Typography variant="caption">
                    Explained consequences:
                  </Typography>
                  {consequences.map((e) => (
                    <ModeChip key={e.k} id={e.fm} episode={e.k} />
                  ))}
                </Stack>
              )}
              <CoverageMeter
                value={dominant.conf}
                label="Diagnosis confidence"
              />
              <Typography variant="body2" fontWeight={600}>
                {model.modes[dominant.fm].action}
              </Typography>
              <Button
                size="small"
                onClick={() => nav.openMode(dominant.fm, dominant.k)}
              >
                Open raw data for this episode
              </Button>
            </>
          )}
        </AnomalyPanel>
      </Box>
      <AnomalyPanel title="Overall health over the selected range" flush>
        <HealthTrend height={360} />
      </AnomalyPanel>
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: "1fr",
          "@media (min-width: 1401px)": { gridTemplateColumns: "1.25fr 1fr" },
          gap: 2,
        }}
      >
        <AnomalyPanel
          title="Sensor health · trust at this instant"
          action={
            <Button size="small" onClick={() => nav.go("sensors")}>
              All tags
            </Button>
          }
        >
          <SensorSummary />
        </AnomalyPanel>
        <AnomalyPanel
          title="Latest declarations"
          action={
            <Button size="small" onClick={() => nav.go("diagnoses")}>
              All diagnoses
            </Button>
          }
          flush
        >
          <AnomalyTable
            rows={recent}
            onRowClick={(e) => nav.openMode(e.fm, e.k)}
            columns={[
              {
                id: "onset",
                label: "Onset",
                mono: true,
                render: (e) => e.onset.slice(5),
              },
              {
                id: "fm",
                label: "Mode",
                render: (e) => (
                  <ModeChip
                    id={e.fm}
                    episode={e.k}
                    root={e.role !== "consequential"}
                  />
                ),
              },
              { id: "name", label: "Diagnosis" },
              {
                id: "conf",
                label: "Confidence",
                mono: true,
                render: (e) => fmt(e.conf, 2),
              },
            ]}
          />
        </AnomalyPanel>
      </Box>
      {SECTIONS.map((section) => {
        const ids = model.equipmentIds.filter(
          (id) => model.equipment[id].section === section,
        );
        const order = ["Critical", "Degraded", "Advisory", "Unknown", "Normal"];
        ids.sort(
          (a, b) =>
            order.indexOf(equipmentAt(model, a, nav.time).band) -
              order.indexOf(equipmentAt(model, b, nav.time).band) ||
            model.equipment[b].crit - model.equipment[a].crit,
        );
        if (!ids.length) return null;
        return (
          <Box key={section} sx={{ mb: 2.5 }}>
            <Stack
              direction="row"
              gap={1.5}
              alignItems="baseline"
              sx={{ mb: 1 }}
            >
              <Typography component="h3" sx={{ fontSize: 13, fontWeight: 600 }}>
                {section}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {ids.length} sub-equipment ·{" "}
                {
                  ids.filter(
                    (id) => equipmentAt(model, id, nav.time).band !== "Normal",
                  ).length
                }{" "}
                not Normal
              </Typography>
            </Stack>
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns:
                  "repeat(auto-fill, minmax(min(100%, 250px), 1fr))",
                gap: 1.5,
              }}
            >
              {ids.map((id) => (
                <EquipmentTile key={id} id={id} />
              ))}
            </Box>
          </Box>
        );
      })}
    </>
  );
}
