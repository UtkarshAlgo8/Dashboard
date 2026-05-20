import { useState } from "react";
import { Button, Stack, ToggleButton, ToggleButtonGroup } from "@mui/material";
import CalendarTodayOutlinedIcon from "@mui/icons-material/CalendarTodayOutlined";
import { format, parseISO, isValid } from "date-fns";
import { DateRangeFilterDialog } from "@/components/common";

/**
 * Time-range selector. Four preset pills (Today / Week / Month /
 * Year per BRD FR-X7 and Q-TR-01) plus a single "Filter Date" pill
 * that opens DateRangeFilterDialog. The dialog matches the Pwani
 * "Date Filter" pattern (title + Cancel/Apply + two date pills +
 * single-month calendar with continuous-pill range styling).
 *
 * Parent owns `preset`, `from`, `to` (ISO yyyy-MM-dd strings).
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
  const [dialogOpen, setDialogOpen] = useState(false);

  const fromDate = parseSafe(from);
  const toDate = parseSafe(to);
  const label = formatRangeLabel(fromDate, toDate);

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

      <Button
        size="small"
        variant="outlined"
        endIcon={<CalendarTodayOutlinedIcon sx={{ fontSize: 14 }} />}
        onClick={() => setDialogOpen(true)}
        sx={{
          textTransform: "none",
          fontSize: 12,
          fontWeight: 500,
          color: "text.primary",
          borderColor: "divider",
          backgroundColor: "background.paper",
          minWidth: 200,
          justifyContent: "space-between",
        }}
      >
        {label}
      </Button>

      <DateRangeFilterDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        from={from}
        to={to}
        onApply={({ from: nextFrom, to: nextTo }) => {
          onFromChange(nextFrom);
          onToChange(nextTo);
        }}
      />
    </Stack>
  );
}

function parseSafe(iso) {
  if (!iso) return null;
  const d = parseISO(iso);
  return isValid(d) ? d : null;
}

const PLACEHOLDER = "DD/MM/YYYY";

function formatRangeLabel(fromDate, toDate) {
  if (!fromDate && !toDate) return "Filter Date";
  const f = fromDate ? format(fromDate, "dd/MM/yyyy") : PLACEHOLDER;
  const t = toDate ? format(toDate, "dd/MM/yyyy") : PLACEHOLDER;
  return `${f} – ${t}`;
}

export default TimeRangeSelect;
