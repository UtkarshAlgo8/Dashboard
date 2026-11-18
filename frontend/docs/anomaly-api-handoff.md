# CTP Anomaly Detection: API handoff

## Current source

The complete workspace is native React/MUI with Highcharts. It reads a historical
PLC-export fixture extracted from `Quintoplex_PdM_Demo 4 (4).html`, not a live feed.
No HTML, executable scripts, Plotly bundle, or iframe is copied into the app.

`src/api/anomalyDetection.js` is the only source-loading boundary. It loads
`public/anomaly/quintoplex-demo.json` on first visit, normalizes it once with
`src/lib/anomaly/model.js`, and caches it for the page lifetime. Loading is
cancellable, failures have Retry, and no polling or speculative API URLs exist.
Other routes do not request this approximately 8 MB file. HTTP compression is
recommended when serving the fixture.

**Deployment caveat:** this is a static frontend fixture and is publicly retrievable
like other frontend assets; route authentication does not protect static files.
Review permission to distribute the historical export before deploying it beyond
the intended demo environment. Live data must use authenticated API requests.

Regenerate the data-only fixture with:

```bash
python scripts/extract-anomaly-demo.py '/path/to/Quintoplex_PdM_Demo 4 (4).html'
```

## Stable presentation model

These are UI requirements, **not an agreed backend wire format or endpoint list**.
The future provider may assemble this model from several authenticated endpoints.
Do not require the API to return the prototype's compressed comma-separated arrays.

- `source`: `type` (`demo`/`live`), label, asset, timezone, latest available `asOf`
  (epoch milliseconds), and a provider-owned `stale` boolean.
- `start`, `end`, `step`, `state`: equipment history bounds, bucket width, and
  producing/idle/stopped/unavailable line-state history.
- `equipment`: keyed identities, names, section, criticality, description,
  monitored/placement metadata, plant nodes, tag associations, blind flag, and
  aligned histories of failure-mode health, Isolation Forest health, coverage,
  Unknown flags, and dominant failure-mode ID. Unknown/missing is never zero or Normal.
- `overall`: supplied health, Isolation Forest health, Unknown count histories.
- `tags`, `tagIds`: sensor metadata, unit, role, component, notes, calibration,
  rule-hit summaries, and producing-time daily reports.
- `tagStart`, `tagStep`, `getTagSeries(tag)`: aligned raw mean/min/max (`a/lo/hi`),
  sensor health (`h`), action (`x`: USE/DOWNWEIGHT/EXCLUDE), dominant rule index
  (`d`), and anomaly-arm state (`an`: Normal/Watch/Anomaly/Unscored).
- `modes`: FMEA identity, evidence type, severity, recommended action, explanation,
  effects, candidate notes, state/ramp gating, configured/set/clear persistence,
  training declaration count, and necessary/supporting/exclusion evidence. Each
  evidence item needs its indicator ID, tags, operator, resolved threshold, weight,
  meaning, and rationale.
- `episodes`: stable ID, mode, equipment, onset/declaration/end times, duration,
  confidence, necessary trust, coverage, root/consequential role, explaining parent,
  train/test period, and new-in-v2 flag.
- `baselineEpisodes`, `transients`, `unrecognised`: comparison outcomes/reasons,
  short-evidence observations, and Isolation Forest observations respectively.
  These are distinct from actionable confirmed diagnoses.
- `edges`: parent/child mode IDs, lag window, rationale.
- `windows`: on-demand equivalent of exported 1-minute episode windows: raw
  mean/min/max, cleaned values, health, action, dominant rule, spike counts,
  indicator values/trust, confidence, coverage, and line state. Empty windows must
  produce “No raw-data window available”, not synthetic evidence.
- `hierarchy`, `undetectable`: assemblies, sub-assemblies, components, departments,
  PLC/vibration associations, source references, review notes, signal gaps, and
  FMEA failure modes not detectable with the available signals.
- `rules`, `penalties`, `sensorConfig`, `summary`, `trainingEnd`, `plantRows`:
  method/configuration and full-record comparison metadata for the reference views.

The provider currently retains prototype field names inside records to avoid
inventing a second domain vocabulary before the API exists. A future API adapter
should translate wire names to this model, not leak network calls into components.
`getTagSeries` lazily decodes the export; live providers can replace it with
cached already-decoded series. Production data should be fetched by asset, range,
resolution, tag selection, and episode rather than downloading all history.

## Semantics to agree before live integration

1. Asset IDs and plant scope, access control, endpoints, paging, resolution limits.
2. Source timestamps and timezone. The export explicitly labels its naive dates
   **IST**, so this adapter parses them as `Asia/Kolkata` (UTC+05:30), independent
   of browser timezone. The prototype incorrectly used UTC internally while
   labeling timestamps IST. Live timestamps must include an offset or UTC `Z`.
3. End-time inclusivity. Export episode end minutes are inclusive; the adapter
   converts them to an exclusive end boundary by adding one minute.
4. Meaning of missing, blind, stopped, stale, unscored, and partial coverage;
   health/action/confidence ownership and numerical precision.
5. Actual live transport and update interval. “Latest available” currently jumps
   to the last point in the export. It is not a simulated live/polling mode.
6. Whether v1/v2 comparison, training calibration, rules, FMEA review, and hierarchy
   are available to the production API or need explicit unavailable states.

Detection, calibration, trust, confidence, persistence, causal explanations, and
Isolation Forest results belong to the backend. The frontend displays exported
results, applies display bands, aggregates worst values for heatmap rendering,
computes selected-range descriptive summaries, and highlights resolved evidence
conditions; it does not run a predictive-maintenance engine.

## Navigation and chart behavior

- `/chennai/engineering`: six original Engineering sections disabled; only Anomaly
  Detection is enabled. No BTP queries or unavailable CTP KPI calls are made.
- `/chennai/engineering/anomaly-detection`: primary navbar only; existing global
  chat launcher is not mounted here. Workspace sidebar/timeline belong to this UI.
- Query parameters: `view`, `sub`, `tab`, `t`, `r`, `from`, `to`, `stops`, `fm`,
  `ep`, `tag`, `status`, `action`. Browser back/forward, refresh, and shared detail links work.
  Screen/detail changes push history; scrubbing replaces history.
- Themes are feature-local, persisted as `ctp-anomaly-theme`; no document/body
  theme mutation or prototype global event handlers.
- Charts use existing Highcharts modules. Tag overlays support two units; more
  units use stacked charts. Sub-equipment/episode overlays are explicitly
  normalised and CSV always exports unnormalised raw values with IST labels.
- Heatmaps use at most 180 time-display buckets per tag, preserving worst health
  or highest exported anomaly state per bucket. This bounds SVG work; exact
  selected-range sensor summaries still use all exported 10-minute buckets.
