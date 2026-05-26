import { useState } from "react";
import {
  Button,
  MenuItem,
  Select,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
} from "@mui/material";
import CalendarTodayOutlinedIcon from "@mui/icons-material/CalendarTodayOutlined";
import { format, parseISO, isValid } from "date-fns";
import { DateRangeFilterDialog } from "@/components/common";

/**
 * Time-range selector. Three preset pills (Today / Month / Year per
 * BRD FR-X7 and CR-05 — Week was dropped after the artifact refresh)
 * plus a single "Filter Date" pill that opens DateRangeFilterDialog.
 *
 * When the active preset is "today" and `onShiftChange` is provided,
 * a compact Shift select renders nested directly under the preset
 * pills. This matches the new artifact: shift only makes sense
 * within a single day, so it disappears for Month / Year / custom.
 *
 * Parent owns `preset`, `from`, `to` (ISO yyyy-MM-dd strings) and
 * optionally `shift` ("all" | "a" | "b" | "c").
 */
const PRESETS = [
  { id: "today", label: "Today" },
  { id: "month", label: "Month" },
  { id: "year", label: "Year" },
];

const SHIFT_OPTIONS = [
  { id: "all", label: "All Shifts" },
  { id: "a", label: "Shift A" },
  { id: "b", label: "Shift B" },
  { id: "c", label: "Shift C" },
];

function TimeRangeSelect({
  preset,
  onPresetChange,
  from,
  to,
  onFromChange,
  onToChange,
  shift,
  onShiftChange,
}) {
  const [dialogOpen, setDialogOpen] = useState(false);

  const fromDate = parseSafe(from);
  const toDate = parseSafe(to);
  const label = formatRangeLabel(fromDate, toDate);
  const showShift = preset === "today" && typeof onShiftChange === "function";

  return (
    <Stack direction="row" spacing={1} alignItems="flex-start">
      <Stack spacing={0.5} alignItems="flex-start">
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

        {showShift && (
          <Select
            size="small"
            value={shift ?? "all"}
            onChange={(e) => onShiftChange(e.target.value)}
            aria-label="Filter by shift"
            sx={{
              ml: 0.5,
              fontSize: 11,
              height: 24,
              "& .MuiSelect-select": {
                py: 0.25,
                pl: 1,
                pr: "26px !important",
                fontSize: 11,
                fontWeight: 600,
              },
              "& fieldset": { borderColor: "divider" },
            }}
          >
            {SHIFT_OPTIONS.map((opt) => (
              <MenuItem
                key={opt.id}
                value={opt.id}
                sx={{ fontSize: 12, py: 0.5 }}
              >
                {opt.label}
              </MenuItem>
            ))}
          </Select>
        )}
      </Stack>

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
