import { useMemo, useState } from "react";
import {
  Box,
  Menu,
  MenuItem,
  Popover,
  Select,
  Stack,
  TextField,
  useTheme,
} from "@mui/material";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import { format, parseISO, isValid } from "date-fns";
import { DateRangeFilterDialog } from "@/components/common";
import { asOfMonthKey, buildMonthOptions } from "@/lib/timeRange.js";

/**
 * Adobe XD Time-range selector.
 * Renders as a single rounded segmented pill group:
 * [ Today | This Month | Date Range ▾ ]
 */
function TimeRangeSelect({
  preset,
  variant = "default",
  presetLabels,
  onPresetChange,
  from,
  to,
  onFromChange,
  onToChange,
  shift = "all",
  onShiftChange,
  asOf = null,
  month = null,
  onMonthChange,
  // Preset ids the host page does not support (e.g. SPC has no month view).
  // Rendered greyed out and non-clickable, like the Yearly pill.
  disabledPresets = [],
  // Preset ids the host page should not render at all.
  hiddenPresets = [],
  // Opt-in "This Year" pill (preset "year") for pages backed by a YEAR grain.
  showYearPreset = false,
  // Drop "Custom Date Range…" from the month menu, for pages that can only
  // serve stored periods (Day / Month / Year).
  hideCustomRange = false,
  // Move the single-day picker from an inline field into the Date Range
  // menu, as its last item ("Select a Day…").
  dayPickerInMenu = false,
  singleDay = null,
  onSingleDayChange,
  size = "md",
}) {
  const theme = useTheme();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [monthAnchor, setMonthAnchor] = useState(null);
  const [dayAnchor, setDayAnchor] = useState(null);

  const fromDate = parseSafe(from);
  const toDateVal = parseSafe(to);
  const isCustomRange =
    Boolean(from || to) && preset !== "today" && preset !== "month";

  const monthOptions = useMemo(() => buildMonthOptions(asOf), [asOf]);
  const defaultMonthKey = asOfMonthKey(asOf);
  const selectedMonthKey = month ?? defaultMonthKey;
  // A PAST month picked from the dropdown. Without this the control gave the
  // choice no feedback at all: "This Month" stayed lit and the dropdown pill
  // still read "Date Range", so a page correctly showing Aug looked like it
  // had ignored the click and stayed on the current month. The pinned month
  // now owns the dropdown pill (lit, labelled "Aug 2026") and releases the
  // "This Month" pill, which is what "this month" actually means.
  const isPinnedMonth =
    preset === "month" && selectedMonthKey !== defaultMonthKey;
  const isMonthPreset = preset === "month" && !isPinnedMonth;
  const hasSingleDayPicker = typeof onSingleDayChange === "function";
  const dayInMenu = dayPickerInMenu && hasSingleDayPicker;
  const isPickedDay = dayInMenu && preset === "day";
  const dropdownActive = isCustomRange || isPinnedMonth || isPickedDay;
  const customLabel = isPickedDay
    ? (formatDayLabel(parseSafe(singleDay)) ?? "Date Range")
    : isCustomRange
      ? formatRangeLabel(fromDate, toDateVal)
      : isPinnedMonth
        ? (monthOptions.find((o) => o.key === selectedMonthKey)?.label ??
          selectedMonthKey)
        : "Date Range";
  const monthDisabled = disabledPresets.includes("month");
  const showTodayPreset = !hiddenPresets.includes("today");
  const showMonthPreset = !hiddenPresets.includes("month");
  const showRangePreset = !hiddenPresets.includes("range");
  const isYearPreset = preset === "year";
  const singleDayActive = hasSingleDayPicker && preset === "day";
  const showShift =
    (preset === "today" || hasSingleDayPicker) &&
    typeof onShiftChange === "function";
  const isTrendVariant = variant === "trend";
  const presetLabel = (id, fallback) => presetLabels?.[id] ?? fallback;
  const selectPreset = (nextPreset) => {
    if (isTrendVariant) {
      onPresetChange(nextPreset);
      return;
    }
    // `month: null` is explicit, not incidental: consumers build their next
    // state by spreading the previous one, so a month left over from the
    // dropdown would survive a pill click and silently pin the page to that
    // past month. Clicking "This Month" has to mean this month.
    onPresetChange({ preset: nextPreset, from: "", to: "", month: null });
  };

  const shiftOptions = [
    { id: "all", label: "All Shifts" },
    { id: "a", label: "Shift A" },
    { id: "b", label: "Shift B" },
    { id: "c", label: "Shift C" },
  ];

  const pad =
    size === "sm"
      ? { px: 1.5, py: 0.4, fontSize: 12.5 }
      : size === "lg"
        ? { px: 2.75, py: 0.85, fontSize: 14.5 }
        : { px: 2.25, py: 0.65, fontSize: 13.5 };

  return (
    <Stack
      direction="row"
      alignItems="center"
      spacing={1}
      sx={{ display: "inline-flex" }}
    >
      <Box
        sx={{
          display: "inline-flex",
          alignItems: "center",
          p: 0,
          borderRadius: 999,
          border: 1,
          borderColor: "divider",
          backgroundColor: "background.paper",
          overflow: "hidden",
        }}
      >
        {showShift && (
          <Select
            size="small"
            value={shift}
            onChange={(event) => onShiftChange(event.target.value)}
            aria-label="Filter by shift"
            variant="outlined"
            sx={{
              minWidth: 112,
              height: 42,
              borderRight: 1,
              borderColor: "divider",
              borderRadius: 0,
              fontSize: 13,
              fontWeight: 600,
              color: "text.primary",
              "& .MuiSelect-select": {
                display: "flex",
                alignItems: "center",
                py: 0,
                pl: 1.75,
                pr: "30px !important",
              },
              "& .MuiOutlinedInput-notchedOutline": { border: 0 },
              "&:hover .MuiOutlinedInput-notchedOutline": { border: 0 },
              "&.Mui-focused .MuiOutlinedInput-notchedOutline": { border: 0 },
            }}
          >
            {shiftOptions.map((option) => (
              <MenuItem
                key={option.id}
                value={option.id}
                sx={{ fontSize: 13, py: 0.75 }}
              >
                {option.label}
              </MenuItem>
            ))}
          </Select>
        )}
        {/* 1. Today Pill */}
        {showTodayPreset && (
          <Box
            onClick={() => selectPreset("today")}
            sx={{
              ...pad,
              m: preset === "today" ? "-1px" : 0,
              zIndex: preset === "today" ? 1 : 0,
              fontWeight: preset === "today" ? 600 : 500,
              whiteSpace: "nowrap",
              userSelect: "none",
              borderRadius: 999,
              cursor: "pointer",
              border: 1,
              borderColor: preset === "today" ? "primary.main" : "transparent",
              backgroundColor:
                preset === "today"
                  ? theme.custom.pills.activeBg
                  : "transparent",
              color: preset === "today" ? "primary.main" : "text.primary",
              transition: "all 0.15s ease",
              "&:hover": {
                backgroundColor:
                  preset === "today"
                    ? theme.custom.pills.activeBg
                    : theme.custom.surface.soft,
              },
            }}
          >
            {presetLabel("today", "Today")}
          </Box>
        )}

        {hasSingleDayPicker && !dayInMenu && (
          <TextField
            type="date"
            size="small"
            value={singleDay || ""}
            inputProps={{
              "aria-label": "Select SPC day",
              title: "Select day",
            }}
            onChange={(event) => {
              if (event.target.value) onSingleDayChange(event.target.value);
            }}
            sx={{
              width: 170,
              "& .MuiInputBase-root": {
                height: 42,
                borderRadius: 0,
                borderLeft: 1,
                borderColor: "divider",
                backgroundColor: singleDayActive
                  ? theme.custom.pills.activeBg
                  : "transparent",
              },
              "& .MuiOutlinedInput-notchedOutline": {
                border: "0 !important",
              },
              "& .MuiOutlinedInput-root.Mui-focused .MuiOutlinedInput-notchedOutline":
                {
                  border: "0 !important",
                },
              "& .MuiInputBase-input": {
                py: 0,
                px: 2,
                fontSize: 13,
                fontWeight: singleDayActive ? 600 : 500,
                color: singleDayActive ? "primary.main" : "text.primary",
                outline: "none",
              },
            }}
          />
        )}

        {showMonthPreset && (
          /* 2. This Month Pill */
          <Box
            onClick={monthDisabled ? undefined : () => selectPreset("month")}
            aria-disabled={monthDisabled || undefined}
            title={monthDisabled ? "Not available on this view" : undefined}
            sx={{
              ...pad,
              m: isMonthPreset ? "-1px" : 0,
              zIndex: isMonthPreset ? 1 : 0,
              fontWeight: isMonthPreset ? 600 : 500,
              whiteSpace: "nowrap",
              userSelect: "none",
              borderRadius: 999,
              cursor: monthDisabled ? "not-allowed" : "pointer",
              border: 1,
              borderColor: isMonthPreset ? "primary.main" : "transparent",
              backgroundColor: isMonthPreset
                ? theme.custom.pills.activeBg
                : "transparent",
              color: monthDisabled
                ? "text.disabled"
                : isMonthPreset
                  ? "primary.main"
                  : "text.primary",
              transition: "all 0.15s ease",
              "&:hover": {
                backgroundColor: monthDisabled
                  ? "transparent"
                  : isMonthPreset
                    ? theme.custom.pills.activeBg
                    : theme.custom.surface.soft,
              },
            }}
          >
            {presetLabel("month", "This Month")}
          </Box>
        )}

        {showYearPreset && !isTrendVariant && (
          /* 2b. This Year Pill (opt-in) */
          <Box
            onClick={() => selectPreset("year")}
            sx={{
              ...pad,
              m: isYearPreset ? "-1px" : 0,
              zIndex: isYearPreset ? 1 : 0,
              fontWeight: isYearPreset ? 600 : 500,
              whiteSpace: "nowrap",
              userSelect: "none",
              borderRadius: 999,
              cursor: "pointer",
              border: 1,
              borderColor: isYearPreset ? "primary.main" : "transparent",
              backgroundColor: isYearPreset
                ? theme.custom.pills.activeBg
                : "transparent",
              color: isYearPreset ? "primary.main" : "text.primary",
              transition: "all 0.15s ease",
              "&:hover": {
                backgroundColor: isYearPreset
                  ? theme.custom.pills.activeBg
                  : theme.custom.surface.soft,
              },
            }}
          >
            {presetLabel("year", "This Year")}
          </Box>
        )}

        {isTrendVariant && (
          <Box
            aria-disabled
            sx={{
              ...pad,
              color: "text.disabled",
              cursor: "not-allowed",
              whiteSpace: "nowrap",
              userSelect: "none",
            }}
          >
            {presetLabel("year", "Yearly")}
          </Box>
        )}

        {showRangePreset && (
          /* 3. Date Range Dropdown Trigger Pill */
          <Box
            onClick={(e) => {
              if (isTrendVariant) setDialogOpen(true);
              else setMonthAnchor(e.currentTarget);
            }}
            sx={{
              display: "inline-flex",
              alignItems: "center",
              gap: 0.5,
              ...pad,
              m: dropdownActive ? "-1px" : 0,
              zIndex: dropdownActive ? 1 : 0,
              fontWeight: dropdownActive ? 600 : 500,
              whiteSpace: "nowrap",
              userSelect: "none",
              borderRadius: 999,
              cursor: "pointer",
              border: 1,
              borderColor: dropdownActive ? "primary.main" : "transparent",
              backgroundColor: dropdownActive
                ? theme.custom.pills.activeBg
                : "transparent",
              color: dropdownActive ? "primary.main" : "text.primary",
              transition: "all 0.15s ease",
              "&:hover": {
                backgroundColor: dropdownActive
                  ? theme.custom.pills.activeBg
                  : theme.custom.surface.soft,
              },
            }}
          >
            <span>{customLabel}</span>
            <KeyboardArrowDownIcon sx={{ fontSize: 16 }} />
          </Box>
        )}
      </Box>

      {/* Date Range Popover Menu */}
      <Menu
        anchorEl={monthAnchor}
        open={!isTrendVariant && Boolean(monthAnchor)}
        onClose={() => setMonthAnchor(null)}
        slotProps={{
          paper: {
            sx: {
              mt: 0.75,
              borderRadius: 2,
              minWidth: 170,
              boxShadow: theme.custom.shadow,
              border: 1,
              borderColor: "divider",
            },
          },
        }}
      >
        {monthOptions.map((opt) => (
          <MenuItem
            key={opt.key}
            selected={preset === "month" && selectedMonthKey === opt.key}
            onClick={() => {
              setMonthAnchor(null);
              onMonthChange?.(opt.key);
            }}
            sx={{ fontSize: 13 }}
          >
            {opt.label}
          </MenuItem>
        ))}
        {!hideCustomRange && (
          <MenuItem
            onClick={() => {
              setMonthAnchor(null);
              setDialogOpen(true);
            }}
            sx={{
              fontSize: 13,
              fontWeight: 600,
              color: "primary.main",
              borderTop: 1,
              borderColor: "divider",
              mt: 0.5,
            }}
          >
            Custom Date Range…
          </MenuItem>
        )}
        {dayInMenu && (
          <MenuItem
            onClick={() => {
              setDayAnchor(monthAnchor);
              setMonthAnchor(null);
            }}
            sx={{
              fontSize: 13,
              fontWeight: 600,
              color: "primary.main",
              borderTop: 1,
              borderColor: "divider",
              mt: 0.5,
            }}
          >
            Select a Day…
          </MenuItem>
        )}
      </Menu>

      {dayInMenu && (
        <Popover
          open={Boolean(dayAnchor)}
          anchorEl={dayAnchor}
          onClose={() => setDayAnchor(null)}
          anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
          transformOrigin={{ vertical: "top", horizontal: "right" }}
          slotProps={{
            paper: {
              sx: {
                mt: 0.75,
                p: 1.5,
                borderRadius: 2,
                boxShadow: theme.custom.shadow,
                border: 1,
                borderColor: "divider",
              },
            },
          }}
        >
          <TextField
            type="date"
            size="small"
            autoFocus
            label="Day"
            value={singleDay || ""}
            slotProps={{ inputLabel: { shrink: true } }}
            onChange={(event) => {
              if (!event.target.value) return;
              onSingleDayChange(event.target.value);
              setDayAnchor(null);
            }}
            sx={{ width: 190 }}
          />
        </Popover>
      )}

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

function parseSafe(val) {
  if (!val) return null;
  const d = parseISO(val);
  return isValid(d) ? d : null;
}

function formatDayLabel(day) {
  return day ? format(day, "dd MMM yyyy") : null;
}

function formatRangeLabel(from, to) {
  if (from && to) {
    return `${format(from, "dd MMM")} – ${format(to, "dd MMM")}`;
  }
  if (from) return `From ${format(from, "dd MMM")}`;
  if (to) return `Until ${format(to, "dd MMM")}`;
  return "Date Range";
}

export default TimeRangeSelect;
