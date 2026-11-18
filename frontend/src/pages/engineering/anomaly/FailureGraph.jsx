import { useId, useReducer } from "react";
import {
  Box,
  Button,
  Checkbox,
  FormControlLabel,
  MenuItem,
  Select,
  Stack,
  Typography,
  useTheme,
} from "@mui/material";
import useAnomaly from "@/hooks/useAnomaly.js";
import graphLayout from "@/lib/anomaly/graphLayout.js";
import { diagnosisAt, overlaps } from "@/lib/anomaly/model.js";
import { AnomalyPanel, ModeChip } from "./AnomalyParts.jsx";

export default function FailureGraph() {
  const { model, nav } = useAnomaly();
  const p = useTheme().custom.anomaly;
  const markerId = useId().replaceAll(":", "");
  const [filters, update] = useReducer(
    (state, action) => ({ ...state, ...action }),
    { equipment: "", observation: "", declared: false },
  );
  const layout = graphLayout(model.modes, model.edges);
  const current = diagnosisAt(model, nav.time);
  const roots = new Set(
    current.episodes.filter((e) => e.role !== "consequential").map((e) => e.fm),
  );
  const consequences = new Set(
    current.episodes.filter((e) => e.role === "consequential").map((e) => e.fm),
  );
  const declared = new Set(
    model.episodes
      .filter((e) => overlaps(e, nav.from, nav.to))
      .map((e) => e.fm),
  );
  const usedEdges = new Set(
    model.episodes
      .filter(
        (e) => e.role === "consequential" && overlaps(e, nav.from, nav.to),
      )
      .map((e) => `${e.by}>${e.fm}`),
  );
  const pass = (id) =>
    (!filters.equipment || model.modes[id].se === filters.equipment) &&
    (!filters.observation ||
      model.modes[id].direct === (filters.observation === "direct")) &&
    (!filters.declared || declared.has(id));
  const isolated = Object.keys(model.modes).filter(
    (id) => !layout.positions[id] && pass(id),
  );
  return (
    <>
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", lg: "1fr 1fr" },
          gap: 2,
        }}
      >
        <AnomalyPanel title="Diagnosis driving the colours">
          {current.episodes.length ? (
            <>
              <Stack direction="row" gap={0.75} flexWrap="wrap">
                {[...roots, ...consequences].map((id) => (
                  <ModeChip key={id} id={id} root={roots.has(id)} />
                ))}
              </Stack>
              <Typography variant="caption" color="text.secondary">
                {current.recent
                  ? "Most recent diagnosis"
                  : "Declared at this instant"}{" "}
                · {roots.size} roots · {consequences.size} consequences
              </Typography>
            </>
          ) : (
            <Typography variant="body2" color="text.secondary">
              No diagnosis in force. Modes declared anywhere in the selected
              range are outlined.
            </Typography>
          )}
        </AnomalyPanel>
        <AnomalyPanel title="Filters">
          <Stack direction="row" gap={1} flexWrap="wrap">
            <Select
              size="small"
              displayEmpty
              value={filters.equipment}
              onChange={(event) => update({ equipment: event.target.value })}
              inputProps={{ "aria-label": "Filter graph sub-equipment" }}
            >
              <MenuItem value="">All sub-equipment</MenuItem>
              {model.equipmentIds
                .filter((id) =>
                  Object.values(model.modes).some((fm) => fm.se === id),
                )
                .map((id) => (
                  <MenuItem key={id} value={id}>
                    {id} · {model.equipment[id].short}
                  </MenuItem>
                ))}
            </Select>
            <Select
              size="small"
              displayEmpty
              value={filters.observation}
              onChange={(event) => update({ observation: event.target.value })}
              inputProps={{ "aria-label": "Filter graph evidence" }}
            >
              <MenuItem value="">Evidence: all</MenuItem>
              <MenuItem value="direct">Direct</MenuItem>
              <MenuItem value="inferred">Inferred / residual</MenuItem>
            </Select>
            <FormControlLabel
              control={
                <Checkbox
                  size="small"
                  checked={filters.declared}
                  onChange={(_, value) => update({ declared: value })}
                />
              }
              label={
                <Typography variant="caption">
                  Declared in range only ({declared.size})
                </Typography>
              }
            />
          </Stack>
        </AnomalyPanel>
      </Box>
      <AnomalyPanel
        title={`Cause → effect links · ${model.edges.length} edges`}
        action={
          <Typography variant="caption" color="text.secondary">
            Accent = root · outlined = declared in range · dashed link =
            explanation used
          </Typography>
        }
        flush
      >
        <Box sx={{ overflowX: "auto", p: 1 }}>
          <Box
            component="svg"
            viewBox={`0 0 ${layout.width} ${layout.height}`}
            aria-label="Failure-mode cause and effect graph"
            sx={{
              width: "100%",
              minWidth: layout.width,
              height: layout.height,
              "& [role=button]:focus-visible rect": {
                stroke: p.accent,
                strokeWidth: 3,
              },
              "& [role=button]": { cursor: "pointer", outline: "none" },
            }}
          >
            <defs>
              <marker
                id={markerId}
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="7"
                markerHeight="7"
                orient="auto"
              >
                <path d="M0,0 L10,5 L0,10 z" fill={p.muted} />
              </marker>
            </defs>
            {model.edges.map((edge, index) => {
              const from = layout.positions[edge.p],
                to = layout.positions[edge.c];
              if (!from || !to) return null;
              const used = usedEdges.has(`${edge.p}>${edge.c}`);
              const x1 = from.x + 168,
                y1 = from.y + 21,
                x2 = to.x,
                y2 = to.y + 21,
                mid = (x1 + x2) / 2;
              return (
                <path
                  key={index}
                  d={`M${x1},${y1} C${mid},${y1} ${mid},${y2} ${x2 - 2},${y2}`}
                  fill="none"
                  stroke={used ? p.accent : p.muted}
                  strokeWidth={used ? 2 : 1}
                  strokeDasharray={used ? "6 4" : undefined}
                  opacity={pass(edge.p) && pass(edge.c) ? 1 : 0.18}
                  markerEnd={`url(#${markerId})`}
                >
                  <title>
                    {edge.p} → {edge.c} · lag {edge.lo}–{edge.hi} min ·{" "}
                    {edge.why}
                  </title>
                </path>
              );
            })}
            {layout.ids.map((id) => {
              const mode = model.modes[id],
                position = layout.positions[id],
                root = roots.has(id);
              return (
                <g
                  key={id}
                  role="button"
                  tabIndex={0}
                  aria-label={`${id}: ${mode.name}`}
                  transform={`translate(${position.x}, ${position.y})`}
                  opacity={pass(id) ? 1 : 0.22}
                  onClick={() => nav.openMode(id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      nav.openMode(id);
                    }
                  }}
                >
                  <title>
                    {id} · {mode.name} · {mode.direct ? "Direct" : "Inferred"}{" "}
                    evidence · severity {mode.severity}
                  </title>
                  <rect
                    width="168"
                    height="42"
                    rx="2"
                    fill={root ? p.accentWash : p.raised}
                    stroke={
                      root || consequences.has(id)
                        ? p.accent
                        : declared.has(id)
                          ? p.ink
                          : p.line
                    }
                    strokeWidth={root ? 2 : 1}
                  />
                  <text
                    x="8"
                    y="16"
                    fill={root ? p.accent : p.ink}
                    fontFamily="Geist Mono, monospace"
                    fontSize="11"
                  >
                    {id}
                  </text>
                  <text
                    x="160"
                    y="16"
                    fill={p.muted}
                    textAnchor="end"
                    fontSize="10"
                  >
                    {mode.se}
                  </text>
                  <text x="8" y="32" fill={p.muted} fontSize="10">
                    {mode.name.length > 26
                      ? `${mode.name.slice(0, 25)}…`
                      : mode.name}
                  </text>
                </g>
              );
            })}
          </Box>
        </Box>
      </AnomalyPanel>
      <AnomalyPanel
        title={`Independent modes · no cause/effect link defined · ${isolated.length}`}
      >
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns:
              "repeat(auto-fill, minmax(min(100%, 220px), 1fr))",
            gap: 1,
          }}
        >
          {isolated.map((id) => (
            <Button
              key={id}
              variant="outlined"
              onClick={() => nav.openMode(id)}
              sx={{
                display: "block",
                textAlign: "left",
                color: roots.has(id) ? "primary.main" : "text.primary",
                borderColor: roots.has(id) ? "primary.main" : "divider",
                p: 1,
              }}
            >
              <Typography
                variant="caption"
                fontFamily="'Geist Mono', monospace"
              >
                {id} · {model.modes[id].se}
              </Typography>
              <Typography sx={{ fontSize: 12, my: 0.5 }}>
                {model.modes[id].name}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {model.modes[id].direct ? "Direct" : "Inferred"} · severity{" "}
                {model.modes[id].severity}
              </Typography>
            </Button>
          ))}
        </Box>
        {!isolated.length && (
          <Typography variant="body2" color="text.secondary">
            No independent modes match the filters.
          </Typography>
        )}
      </AnomalyPanel>
    </>
  );
}
