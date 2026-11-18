import { useRef, useState } from "react";
import {
  Box,
  Button,
  Checkbox,
  FormControlLabel,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
  useTheme,
} from "@mui/material";
import useAnomaly from "@/hooks/useAnomaly.js";
import {
  clamp,
  formatTime,
  healthBand,
  parseTime,
} from "@/lib/anomaly/model.js";

function TimelineLane({ overview = false }) {
  const { model, nav } = useAnomaly();
  const p = useTheme().custom.anomaly;
  const [draft, setDraft] = useState(null);
  const drag = useRef(null);
  const left = overview ? model.start : nav.from;
  const right = Math.max(left + model.step, overview ? model.end : nav.to);
  const x = (time) => (1000 * (time - left)) / (right - left);
  const eventTime = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return clamp(
      left + ((event.clientX - rect.left) / rect.width) * (right - left),
      left,
      right,
    );
  };
  const segments = [];
  let lastBand = null,
    begin = left;
  const i0 = Math.max(0, Math.floor((left - model.start) / model.step));
  const i1 = Math.min(
    model.state.length - 1,
    Math.ceil((right - model.start) / model.step),
  );
  for (let i = i0; i <= i1 + 1; i++) {
    const time = Math.min(right, model.start + i * model.step);
    const band =
      i > i1
        ? null
        : model.state[i] === "P"
          ? healthBand(model.overall.health[i])
          : "Unknown";
    if (band !== lastBand) {
      if (lastBand) segments.push({ start: begin, end: time, band: lastBand });
      begin = time;
      lastBand = band;
    }
  }
  const finish = (event) => {
    if (!drag.current) return;
    const end = eventTime(event),
      start = drag.current.time;
    if (overview && Math.abs(end - start) >= model.step)
      nav.setWindow(start, end);
    else nav.setTime(end);
    drag.current = null;
    setDraft(null);
    event.currentTarget.releasePointerCapture(event.pointerId);
  };
  return (
    <Box>
      <Box
        component="svg"
        viewBox="0 0 1000 32"
        preserveAspectRatio="none"
        role="slider"
        tabIndex={0}
        aria-label={overview ? "Select a time window" : "Inspect time"}
        aria-valuemin={left}
        aria-valuemax={right}
        aria-valuenow={clamp(nav.time, left, right)}
        aria-valuetext={`${formatTime(draft?.end ?? nav.time)} IST`}
        onPointerDown={(event) => {
          event.currentTarget.focus();
          event.currentTarget.setPointerCapture(event.pointerId);
          const time = eventTime(event);
          drag.current = { time };
          setDraft({ start: time, end: time });
        }}
        onPointerMove={(event) => {
          if (drag.current)
            setDraft({ start: drag.current.time, end: eventTime(event) });
        }}
        onPointerUp={finish}
        onPointerCancel={() => {
          drag.current = null;
          setDraft(null);
        }}
        onKeyDown={(event) => {
          if (event.key === "Home" || event.key === "End") {
            event.preventDefault();
            nav.setTime(event.key === "Home" ? model.start : model.end);
          }
          if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
          event.preventDefault();
          const step =
            (event.key === "ArrowRight" ? 1 : -1) *
            (event.shiftKey ? nav.to - nav.from : model.step);
          nav.setTime(nav.time + step);
        }}
        sx={{
          display: "block",
          height: overview ? 24 : 32,
          width: "100%",
          cursor: overview ? "crosshair" : "ew-resize",
          touchAction: "none",
          border: 1,
          borderColor: "divider",
          "&:focus-visible": {
            outline: "2px solid",
            outlineColor: "primary.main",
            outlineOffset: 2,
          },
        }}
      >
        <rect width="1000" height="32" fill={p.track} />
        {segments.map((segment, index) => (
          <rect
            key={index}
            x={x(segment.start)}
            width={Math.max(0, x(segment.end) - x(segment.start))}
            height="32"
            fill={p[segment.band]}
            opacity="0.65"
          />
        ))}
        {overview && (
          <rect
            x={x(nav.from)}
            width={Math.max(1, x(nav.to) - x(nav.from))}
            height="32"
            fill={`${p.accent}35`}
            stroke={p.accent}
            strokeWidth="2"
          />
        )}
        {model.episodes
          .filter((e) => e.start >= left && e.start <= right)
          .map((e) => (
            <line
              key={e.k}
              x1={x(e.start)}
              x2={x(e.start)}
              y1="0"
              y2="8"
              stroke={p.Critical}
              strokeWidth="2"
            />
          ))}
        {nav.time >= left && nav.time <= right && (
          <line
            x1={x(nav.time)}
            x2={x(nav.time)}
            y1="0"
            y2="32"
            stroke={p.ink}
            strokeWidth="2"
          />
        )}
        {draft && overview && (
          <rect
            x={Math.min(x(draft.start), x(draft.end))}
            width={Math.max(1, Math.abs(x(draft.start) - x(draft.end)))}
            height="32"
            fill={`${p.accent}60`}
            stroke={p.ink}
          />
        )}
        {draft && (
          <line
            x1={x(draft.end)}
            x2={x(draft.end)}
            y1="0"
            y2="32"
            stroke={p.ink}
            strokeWidth="2"
          />
        )}
      </Box>
      {draft && (
        <Typography variant="caption">{formatTime(draft.end)} IST</Typography>
      )}
    </Box>
  );
}

export default function AnomalyTimeline() {
  const { model, nav } = useAnomaly();
  const historical = nav.time < model.end;
  return (
    <Box
      sx={{
        borderBottom: 1,
        borderColor: "divider",
        bgcolor: "background.default",
      }}
    >
      {historical && (
        <Stack
          direction="row"
          alignItems="center"
          gap={1}
          sx={{ px: 3, py: 0.75, bgcolor: (t) => t.custom.anomaly.accentWash }}
        >
          <Typography variant="caption" fontWeight={700}>
            Historical
          </Typography>
          <Typography variant="caption">{formatTime(nav.time)} IST</Typography>
          <Button size="small" onClick={nav.latest} sx={{ ml: "auto" }}>
            Return to latest available
          </Button>
        </Stack>
      )}
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: {
            xs: "1fr",
            md: "auto minmax(200px, 1fr) 210px",
          },
          alignItems: "center",
          gap: 2,
          px: { xs: 2, md: 3 },
          py: 1.25,
        }}
      >
        <Stack spacing={0.5}>
          <Stack direction="row" gap={1} alignItems="center" flexWrap="wrap">
            <Button
              variant={historical ? "outlined" : "contained"}
              onClick={nav.latest}
            >
              Latest available
            </Button>
            <ToggleButtonGroup
              size="small"
              exclusive
              value={nav.custom ? "custom" : nav.preset}
              onChange={(_, value) => {
                if (value) nav.setPreset(value);
              }}
              aria-label="Time range"
            >
              {[
                ["1", "24h"],
                ["3", "3d"],
                ["7", "7d"],
                ["all", "All"],
              ].map(([value, label]) => (
                <ToggleButton
                  key={value}
                  value={value}
                  sx={{ py: 0.25, fontSize: 11 }}
                >
                  {label}
                </ToggleButton>
              ))}
            </ToggleButtonGroup>
          </Stack>
          <FormControlLabel
            sx={{ m: 0 }}
            control={
              <Checkbox
                size="small"
                checked={nav.hideStops}
                onChange={(_, checked) =>
                  nav.update({ stops: checked ? null : "show" }, true)
                }
                sx={{ p: 0.5 }}
              />
            }
            label={
              <Typography variant="caption">Hide stops in charts</Typography>
            }
          />
        </Stack>
        <Stack gap={0.5} sx={{ minWidth: 0 }}>
          <Stack
            direction="row"
            gap={1}
            justifyContent="space-between"
            alignItems="center"
            flexWrap="wrap"
          >
            <Typography variant="caption">
              {formatTime(nav.from, true)} – {formatTime(nav.to, true)} IST
            </Typography>
            {nav.custom && (
              <Button size="small" onClick={() => nav.setPreset("all")}>
                Clear window
              </Button>
            )}
          </Stack>
          <TimelineLane />
          <TimelineLane overview />
          <Typography variant="caption" color="text.secondary">
            Top: inspect an instant · bottom: drag a window · arrow keys step ·
            Shift steps a range
          </Typography>
        </Stack>
        <Box>
          <Typography variant="caption" color="text.secondary">
            {historical
              ? "Inspecting historical data"
              : "Latest point in demo export"}
          </Typography>
          <Typography sx={{ font: "600 14px 'Geist Mono', monospace" }}>
            {formatTime(nav.time)} IST
          </Typography>
          <TextField
            type="datetime-local"
            size="small"
            fullWidth
            value={formatTime(nav.time).replace(" ", "T")}
            onChange={(event) => {
              const time = parseTime(event.target.value);
              if (Number.isFinite(time)) nav.setTime(time);
            }}
            slotProps={{
              htmlInput: {
                "aria-label": "Inspect date and time (IST)",
                min: formatTime(model.start).replace(" ", "T"),
                max: formatTime(model.end).replace(" ", "T"),
                step: 60,
              },
            }}
            sx={{ mt: 0.5, "& input": { fontSize: 11, px: 1, py: 0.75 } }}
          />
          <Typography variant="caption" color="text.secondary">
            Read-only export, not a live feed
          </Typography>
        </Box>
      </Box>
    </Box>
  );
}
