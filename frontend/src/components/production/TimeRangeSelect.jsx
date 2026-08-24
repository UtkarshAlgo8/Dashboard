import { useMemo, useState } from "react";
import { Box, Menu, MenuItem, Stack, useTheme } from "@mui/material";
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
  onPresetChange,
  from,
  to,
  onFromChange,
  onToChange,
  asOf = null,
  month = null,
  onMonthChange,
  size = "md",
}) {
  const theme = useTheme();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [monthAnchor, setMonthAnchor] = useState(null);

  const fromDate = parseSafe(from);
  const toDateVal = parseSafe(to);
  const isCustomRange =
    Boolean(from || to) && preset !== "today" && preset !== "month";
  const customLabel = isCustomRange
    ? formatRangeLabel(fromDate, toDateVal)
    : "Date Range";

  const monthOptions = useMemo(() => buildMonthOptions(asOf), [asOf]);
  const selectedMonthKey = month ?? asOfMonthKey(asOf);

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
        }}
      >
        {/* 1. Today Pill */}
        <Box
          onClick={() =>
            onPresetChange({
              preset: "today",
              from: "",
              to: "",
            })
          }
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
              preset === "today" ? theme.custom.pills.activeBg : "transparent",
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
          Today
        </Box>

        {/* 2. This Month Pill */}
        <Box
          onClick={() =>
            onPresetChange({
              preset: "month",
              from: "",
              to: "",
            })
          }
          sx={{
            ...pad,
            m: preset === "month" ? "-1px" : 0,
            zIndex: preset === "month" ? 1 : 0,
            fontWeight: preset === "month" ? 600 : 500,
            whiteSpace: "nowrap",
            userSelect: "none",
            borderRadius: 999,
            cursor: "pointer",
            border: 1,
            borderColor: preset === "month" ? "primary.main" : "transparent",
            backgroundColor:
              preset === "month" ? theme.custom.pills.activeBg : "transparent",
            color: preset === "month" ? "primary.main" : "text.primary",
            transition: "all 0.15s ease",
            "&:hover": {
              backgroundColor:
                preset === "month"
                  ? theme.custom.pills.activeBg
                  : theme.custom.surface.soft,
            },
          }}
        >
          This Month
        </Box>

        {/* 3. Date Range Dropdown Trigger Pill */}
        <Box
          onClick={(e) => setMonthAnchor(e.currentTarget)}
          sx={{
            display: "inline-flex",
            alignItems: "center",
            gap: 0.5,
            ...pad,
            m: isCustomRange ? "-1px" : 0,
            zIndex: isCustomRange ? 1 : 0,
            fontWeight: isCustomRange ? 600 : 500,
            whiteSpace: "nowrap",
            userSelect: "none",
            borderRadius: 999,
            cursor: "pointer",
            border: 1,
            borderColor: isCustomRange ? "primary.main" : "transparent",
            backgroundColor: isCustomRange
              ? theme.custom.pills.activeBg
              : "transparent",
            color: isCustomRange ? "primary.main" : "text.primary",
            transition: "all 0.15s ease",
            "&:hover": {
              backgroundColor: isCustomRange
                ? theme.custom.pills.activeBg
                : theme.custom.surface.soft,
            },
          }}
        >
          <span>{customLabel}</span>
          <KeyboardArrowDownIcon sx={{ fontSize: 16 }} />
        </Box>
      </Box>

      {/* Date Range Popover Menu */}
      <Menu
        anchorEl={monthAnchor}
        open={Boolean(monthAnchor)}
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
      </Menu>

      <DateRangeFilterDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        fromDate={fromDate}
        toDate={toDateVal}
        onFromChange={(d) => onFromChange(formatSafe(d))}
        onToChange={(d) => onToChange(formatSafe(d))}
      />
    </Stack>
  );
}

function parseSafe(val) {
  if (!val) return null;
  const d = parseISO(val);
  return isValid(d) ? d : null;
}

function formatSafe(d) {
  return d && isValid(d) ? format(d, "yyyy-MM-dd") : "";
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
