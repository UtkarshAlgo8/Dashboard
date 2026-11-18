import { useReducer } from "react";
import {
  Alert,
  Autocomplete,
  Button,
  Checkbox,
  Chip,
  FormControlLabel,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import FileDownloadOutlinedIcon from "@mui/icons-material/FileDownloadOutlined";
import useAnomaly from "@/hooks/useAnomaly.js";
import exportTagCsv from "@/lib/anomaly/exportCsv.js";
import { AnomalyPanel } from "./AnomalyParts.jsx";
import TagTrends from "./TagTrends.jsx";

export default function AnomalyTrends() {
  const { model, nav, trendTags, setTrendTags } = useAnomaly();
  const [options, update] = useReducer(
    (state, action) => ({ ...state, ...action }),
    { mode: "overlay", envelope: true },
  );
  const units = new Set(
    trendTags.map((tag) => model.tags[tag].unit.split(" (")[0]),
  );
  const mode = units.size > 2 ? "stack" : options.mode;
  return (
    <>
      <AnomalyPanel>
        <Stack direction="row" gap={1} flexWrap="wrap" alignItems="center">
          <Autocomplete
            size="small"
            options={model.tagIds
              .slice()
              .sort((a, b) => model.tags[a].se.localeCompare(model.tags[b].se))}
            value={null}
            groupBy={(tag) =>
              `${model.tags[tag].se} · ${model.equipment[model.tags[tag].se]?.short ?? "Line context"}`
            }
            getOptionLabel={(tag) => `${tag} — ${model.tags[tag].desc}`}
            getOptionDisabled={(tag) =>
              trendTags.includes(tag) || trendTags.length >= 8
            }
            onChange={(_, tag) => {
              if (tag) setTrendTags([...trendTags, tag]);
            }}
            renderInput={(params) => (
              <TextField {...params} label="Add a tag" />
            )}
            sx={{ width: { xs: "100%", md: 370 } }}
          />
          <ToggleButtonGroup
            size="small"
            exclusive
            value={mode}
            onChange={(_, value) => {
              if (value) update({ mode: value });
            }}
            aria-label="Trend chart layout"
          >
            <ToggleButton value="overlay" disabled={units.size > 2}>
              Overlay (dual axis)
            </ToggleButton>
            <ToggleButton value="stack">Stacked</ToggleButton>
          </ToggleButtonGroup>
          <FormControlLabel
            control={
              <Checkbox
                checked={options.envelope}
                onChange={(_, envelope) => update({ envelope })}
                size="small"
              />
            }
            label={
              <Typography variant="caption">
                Operating envelope lines
              </Typography>
            }
          />
          <Button
            startIcon={<FileDownloadOutlinedIcon />}
            onClick={() => exportTagCsv(model, trendTags, nav.from, nav.to)}
            disabled={!trendTags.length}
            sx={{ ml: { md: "auto" } }}
          >
            Export CSV
          </Button>
        </Stack>
        <Stack direction="row" gap={0.75} flexWrap="wrap" sx={{ mt: 1.5 }}>
          {trendTags.map((tag) => (
            <Chip
              key={tag}
              label={tag}
              title={model.tags[tag].desc}
              onClick={() => nav.openTag(tag)}
              onDelete={() =>
                setTrendTags(trendTags.filter((id) => id !== tag))
              }
              sx={{ maxWidth: "100%" }}
            />
          ))}
          <Typography variant="caption" color="text.secondary">
            {trendTags.length}/8 tags
          </Typography>
        </Stack>
      </AnomalyPanel>
      {units.size > 2 && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Stacked view is used for more than two measurement units so unlike
          units are not combined on one axis.
        </Alert>
      )}
      <AnomalyPanel title="Raw tag trends · 10-minute buckets" flush>
        <TagTrends tags={trendTags} mode={mode} envelope={options.envelope} />
      </AnomalyPanel>
      <Typography variant="caption" color="text.secondary">
        Line = mean · band = min–max · red squares = excluded by sensor health ·
        shaded = declared episode. CSV contains the raw values, including
        stopped periods.
      </Typography>
    </>
  );
}
