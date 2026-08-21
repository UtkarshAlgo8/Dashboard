import { useMemo, useState } from "react";
import {
  Box,
  Button,
  Menu,
  MenuItem,
  Select,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
} from "@mui/material";
import CalendarTodayOutlinedIcon from "@mui/icons-material/CalendarTodayOutlined";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import { format, parseISO, isValid } from "date-fns";
import { DateRangeFilterDialog } from "@/components/common";
import { asOfMonthKey, buildMonthOptions } from "@/lib/timeRange.js";

/**
 * Time-range selector. Three preset pills (Today / Month / Year per
 * BRD FR-X7 and CR-05 — Week was dropped after the artifact refresh)
 * plus a single "Filter Date" pill that opens DateRangeFilterDialog.
 *
 * When the active preset is "today" and `onShiftChange` is provided,
 * a compact Shift select renders inline to the LEFT of the preset
 * pills (same row), so toggling Today never changes the header height
 * — no vertical UI jump. Shift only makes sense within a single day,
 * so it disappears for Month / Year / custom.
 *
 * Parent owns `preset`, `from`, `to` (ISO yyyy-MM-dd strings) and
 * optionally `shift` ("all" | "a" | "b" | "c").
 *
 * `presetLabels` optionally overrides the display text per preset id
 * WITHOUT changing the ids — the dashboard header keeps Today/Month/Year,
 * while the Trend modal passes Daily/Monthly/Yearly (dashboard_doc.md §1).
 * The granularity mapping downstream keys off the id, so it is unaffected.
 */
// realdata.md §3: no yearly (YTD) data yet — the Year option stays visible
// but disabled. Flip `disabled` off (and ENABLE_YEAR in timeRange.js) when
// yearly data arrives; no other change needed.
const ENABLE_YEAR = false;
const PRESETS = [
  { id: "today", label: "Today" },
  { id: "month", label: "Month" },
  { id: "year", label: "Year", disabled: !ENABLE_YEAR },
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
  presetLabels,
  // When provided, the Month pill becomes a dropdown of selectable months
  // (bounded by `asOf`); `month` is the pinned "yyyy-MM" (default: as-of month).
  asOf = null,
  month = null,
  onMonthChange,
  // CR-10 / Q-LP-01: when true, the Year pill is omitted entirely (the
  // landing page drops Year from the visible preset row; Year remains
  // reachable via the custom-range dialog). Defaults to false so the
  // production dashboard is unchanged.
  hideYear = false,
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [monthAnchor, setMonthAnchor] = useState(null);

  const fromDate = parseSafe(from);
  const toDate = parseSafe(to);
  const label = formatRangeLabel(fromDate, toDate);
  const showShift = preset === "today" && typeof onShiftChange === "function";

  const monthMenuEnabled = typeof onMonthChange === "function";
  const monthOptions = useMemo(() => buildMonthOptions(asOf), [asOf]);
  const selectedMonthKey = month ?? asOfMonthKey(asOf);
  const selectedMonthLabel =
    monthOptions.find((o) => o.key === selectedMonthKey)?.label ?? "Month";

  return (
    <Stack direction="row" spacing={1} alignItems="center">
      {/* Fixed-width slot: always reserved so showing/hiding the shift
          selector (Today only) never changes the cluster width — the
          centred plant pill stays put, no UI jump. */}
      <Box sx={{ width: 96, flexShrink: 0, display: "flex" }}>
        {showShift && (
          <Select
            size="small"
            value={shift ?? "all"}
            onChange={(e) => onShiftChange(e.target.value)}
            aria-label="Filter by shift"
            sx={{
              width: "100%",
              fontSize: 11,
              height: 30,
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
      </Box>

      <ToggleButtonGroup
        size="small"
        value={preset ?? ""}
        exclusive
        onChange={(_, value) => {
          // The Month pill opens its own dropdown (handled in onClick below)
          // when the month menu is enabled, so ignore its group toggle — that
          // also avoids the exclusive-group deselect on re-clicking Month.
          if (!value) return;
          if (value === "month" && monthMenuEnabled) return;
          onPresetChange(value);
        }}
        sx={{
          "& .MuiToggleButton-root": {
            px: 1.5,
            py: 0.25,
            fontSize: 12,
            textTransform: "none",
            fontWeight: 500,
            // Keep multi-word labels (e.g. the "Aug 2026" month pill) on one
            // line instead of wrapping to two.
            whiteSpace: "nowrap",
          },
          // Highlighted preset gets the primary tint (matches the rest of
          // the nav controls) instead of MUI's default grey.
          "& .MuiToggleButton-root.Mui-selected": {
            backgroundColor: "primary.light",
            color: "primary.main",
            fontWeight: 700,
            "&:hover": { backgroundColor: "primary.light" },
          },
        }}
      >
        {(hideYear ? PRESETS.filter((p) => p.id !== "year") : PRESETS).map(
          (p) => {
            const useMonthMenu = p.id === "month" && monthMenuEnabled;
            return (
              <ToggleButton
                key={p.id}
                value={p.id}
                disabled={p.disabled}
                onClick={
                  useMonthMenu
                    ? (e) => {
                        setMonthAnchor(e.currentTarget);
                        if (preset !== "month") onPresetChange("month");
                      }
                    : undefined
                }
              >
                {useMonthMenu && preset === "month"
                  ? selectedMonthLabel
                  : (presetLabels?.[p.id] ?? p.label)}
                {useMonthMenu && (
                  <KeyboardArrowDownIcon
                    sx={{ fontSize: 16, ml: 0.25, mr: -0.75 }}
                  />
                )}
              </ToggleButton>
            );
          },
        )}
      </ToggleButtonGroup>

      <Menu
        anchorEl={monthAnchor}
        open={Boolean(monthAnchor)}
        onClose={() => setMonthAnchor(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
        transformOrigin={{ vertical: "top", horizontal: "left" }}
      >
        {monthOptions.map((o) => (
          <MenuItem
            key={o.key}
            selected={o.key === selectedMonthKey}
            onClick={() => {
              onMonthChange(o.key);
              setMonthAnchor(null);
            }}
            sx={{ fontSize: 13, py: 0.5 }}
          >
            {o.label}
          </MenuItem>
        ))}
      </Menu>

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

const PLACEHOLDER = "DD-MM-YYYY";

function formatRangeLabel(fromDate, toDate) {
  if (!fromDate && !toDate) return "Filter Date";
  const f = fromDate ? format(fromDate, "dd-MM-yyyy") : PLACEHOLDER;
  const t = toDate ? format(toDate, "dd-MM-yyyy") : PLACEHOLDER;
  return `${f} – ${t}`;
}

export default TimeRangeSelect;
