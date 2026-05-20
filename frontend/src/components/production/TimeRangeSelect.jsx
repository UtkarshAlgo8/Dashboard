import { useState } from "react";
import {
  Box,
  Button,
  Popover,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  useTheme,
} from "@mui/material";
import CalendarTodayOutlinedIcon from "@mui/icons-material/CalendarTodayOutlined";
import { DateRange } from "react-date-range";
import { format, parseISO, isValid } from "date-fns";
import "react-date-range/dist/styles.css";
import "react-date-range/dist/theme/default.css";

/**
 * Time-range selector. Four preset pills (Today / Week / Month /
 * Year per BRD FR-X7 and Q-TR-01) plus a single date-range pill
 * that opens a calendar popover. Matches the team convention used
 * in Pwani-SCM-Inbound-FE.
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
  const theme = useTheme();
  const [anchorEl, setAnchorEl] = useState(null);
  const open = Boolean(anchorEl);

  const fromDate = parseSafe(from);
  const toDate = parseSafe(to);

  const range = [
    {
      startDate: fromDate ?? new Date(),
      endDate: toDate ?? fromDate ?? new Date(),
      key: "selection",
    },
  ];

  const handleSelect = (item) => {
    const { startDate, endDate } = item.selection;
    if (startDate) onFromChange(format(startDate, "yyyy-MM-dd"));
    if (endDate) onToChange(format(endDate, "yyyy-MM-dd"));
  };

  const label = formatRangeLabel(fromDate, toDate, preset);

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
        startIcon={<CalendarTodayOutlinedIcon sx={{ fontSize: 14 }} />}
        onClick={(e) => setAnchorEl(e.currentTarget)}
        sx={{
          textTransform: "none",
          fontSize: 12,
          fontWeight: 500,
          color: "text.primary",
          borderColor: "divider",
          backgroundColor: "background.paper",
          minWidth: 200,
          justifyContent: "flex-start",
        }}
      >
        {label}
      </Button>

      <Popover
        open={open}
        anchorEl={anchorEl}
        onClose={() => setAnchorEl(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
        slotProps={{ paper: { sx: { mt: 0.5, overflow: "hidden" } } }}
      >
        <Box>
          <DateRange
            ranges={range}
            onChange={handleSelect}
            rangeColors={[theme.palette.primary.main]}
            showDateDisplay={false}
            moveRangeOnFirstSelection={false}
            editableDateInputs={false}
          />
          <Stack
            direction="row"
            justifyContent="flex-end"
            spacing={1}
            sx={{ px: 1.5, py: 1, borderTop: 1, borderColor: "divider" }}
          >
            <Button
              size="small"
              onClick={() => {
                onFromChange("");
                onToChange("");
                setAnchorEl(null);
              }}
            >
              Clear
            </Button>
            <Button
              size="small"
              variant="contained"
              onClick={() => setAnchorEl(null)}
            >
              Apply
            </Button>
          </Stack>
        </Box>
      </Popover>
    </Stack>
  );
}

function parseSafe(iso) {
  if (!iso) return null;
  const d = parseISO(iso);
  return isValid(d) ? d : null;
}

function formatRangeLabel(fromDate, toDate, preset) {
  if (!fromDate && !toDate) {
    return preset ? "Custom range…" : "Select date range";
  }
  if (fromDate && toDate) {
    const f = format(fromDate, "dd MMM yyyy");
    const t = format(toDate, "dd MMM yyyy");
    if (f === t) return f;
    return `${f} – ${t}`;
  }
  if (fromDate) return `From ${format(fromDate, "dd MMM yyyy")}`;
  return `To ${format(toDate, "dd MMM yyyy")}`;
}

export default TimeRangeSelect;
