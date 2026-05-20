import {
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
} from "@mui/material";

/**
 * Time-range selector — visual chrome for spec 04. Renders the four
 * preset pills (Today / Week / Month / Year per BRD FR-X7 and
 * Q-TR-01) plus From/To date inputs. Changing the preset updates the
 * controlled `preset` prop; date inputs update `from` / `to`.
 *
 * No data fetching happens here — consuming pages (spec 05+) lift
 * this state and use it to scope KPI queries.
 */
const PRESETS = [
  { id: "today", label: "Today" },
  { id: "week", label: "Week" },
  { id: "month", label: "Month" },
  { id: "year", label: "Year" },
];

function TimeRangeSelect({
  preset,
  onPresetChange,
  from,
  to,
  onFromChange,
  onToChange,
}) {
  return (
    <Stack direction="row" spacing={1} alignItems="center">
      <ToggleButtonGroup
        size="small"
        value={preset ?? ""}
        exclusive
        onChange={(_, value) => {
          if (value) onPresetChange(value);
        }}
        sx={{
          "& .MuiToggleButton-root": {
            px: 1.5,
            py: 0.25,
            fontSize: 12,
            textTransform: "none",
            fontWeight: 500,
          },
        }}
      >
        {PRESETS.map((p) => (
          <ToggleButton key={p.id} value={p.id}>
            {p.label}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>
      <TextField
        size="small"
        type="date"
        value={from ?? ""}
        onChange={(e) => onFromChange(e.target.value)}
        sx={{ width: 130, "& input": { fontSize: 12, py: 0.5 } }}
      />
      <TextField
        size="small"
        type="date"
        value={to ?? ""}
        onChange={(e) => onToChange(e.target.value)}
        sx={{ width: 130, "& input": { fontSize: 12, py: 0.5 } }}
      />
    </Stack>
  );
}

export default TimeRangeSelect;
