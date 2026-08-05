import { useEffect, useMemo, useState } from "react";
import {
  Box,
  Button,
  Dialog,
  DialogContent,
  MenuItem,
  Select,
  Stack,
  Typography,
  useTheme,
} from "@mui/material";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import {
  addMonths,
  format,
  getDate,
  getMonth,
  getYear,
  isSameDay,
  isWithinInterval,
  parseISO,
  startOfMonth,
  setMonth,
  setYear,
} from "date-fns";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * Custom date-range modal matching the Pwani-SCM-Inbound-FE
 * "Date Filter" UI: title row + Cancel/Apply + two date pills
 * showing the selected start/end, then a single-month calendar
 * with continuous-pill range styling, month/year dropdowns, and
 * prev/next arrows.
 *
 * Parent passes the current `from` / `to` (ISO yyyy-MM-dd strings).
 * The dialog manages a pending selection internally; commits on
 * Apply, discards on Cancel / backdrop / Escape.
 */
function DateRangeFilterDialog({ open, onClose, from, to, onApply }) {
  const theme = useTheme();
  const initialStart = parseSafe(from);
  const initialEnd = parseSafe(to);
  const initialView = initialStart ?? initialEnd ?? new Date();

  const [pendingStart, setPendingStart] = useState(initialStart);
  const [pendingEnd, setPendingEnd] = useState(initialEnd);
  const [viewDate, setViewDate] = useState(initialView);
  const [activePill, setActivePill] = useState("start"); // "start" | "end"

  // Reset pending state when the dialog opens. The set-state-in-effect
  // rule fires here, but the reset is genuinely a "sync external prop
  // changes into local pending state on a discrete event" — not a
  // cascading-render risk in practice.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (open) {
      setPendingStart(parseSafe(from));
      setPendingEnd(parseSafe(to));
      setViewDate(parseSafe(from) ?? parseSafe(to) ?? new Date());
      setActivePill("start");
    }
  }, [open, from, to]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const days = useMemo(() => buildGrid(viewDate), [viewDate]);
  const monthIdx = getMonth(viewDate);
  const yearIdx = getYear(viewDate);
  const yearOptions = useMemo(() => {
    const current = new Date().getFullYear();
    const start = current - 5;
    return Array.from({ length: 11 }, (_, i) => start + i);
  }, []);

  const handleDayClick = (date) => {
    if (date == null) return;
    // If both endpoints exist, start a new range.
    if (pendingStart && pendingEnd) {
      setPendingStart(date);
      setPendingEnd(null);
      setActivePill("end");
      return;
    }
    if (activePill === "start" || !pendingStart) {
      setPendingStart(date);
      setActivePill("end");
      // Auto-clear an existing end if the new start lies after it.
      if (pendingEnd && date > pendingEnd) {
        setPendingEnd(null);
      }
      return;
    }
    // activePill === "end"
    if (date < pendingStart) {
      // Swap: clicked date becomes the new start.
      setPendingEnd(pendingStart);
      setPendingStart(date);
    } else {
      setPendingEnd(date);
    }
  };

  const handleApply = () => {
    onApply({
      from: pendingStart ? format(pendingStart, "yyyy-MM-dd") : "",
      to: pendingEnd ? format(pendingEnd, "yyyy-MM-dd") : "",
    });
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="xs"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: 2.5,
          border: 2,
          borderColor: theme.palette.info.main,
          overflow: "visible",
        },
      }}
    >
      <DialogContent sx={{ p: 2.5 }}>
        {/* Title + actions */}
        <Stack
          direction="row"
          alignItems="center"
          justifyContent="space-between"
          sx={{ mb: 2 }}
        >
          <Typography sx={{ fontSize: 18, fontWeight: 700 }}>
            Date Filter
          </Typography>
          <Stack direction="row" spacing={1}>
            <Button
              size="small"
              variant="outlined"
              onClick={onClose}
              sx={{
                textTransform: "none",
                borderRadius: 1.5,
                px: 2,
                color: "text.primary",
                borderColor: "divider",
              }}
            >
              Cancel
            </Button>
            <Button
              size="small"
              variant="contained"
              onClick={handleApply}
              sx={{
                textTransform: "none",
                borderRadius: 1.5,
                px: 2,
                backgroundColor: theme.palette.info.main,
              }}
            >
              Apply
            </Button>
          </Stack>
        </Stack>

        {/* Two date pills */}
        <Stack
          direction="row"
          spacing={1.5}
          sx={{
            p: 1,
            border: 1,
            borderColor: "divider",
            borderRadius: 1.5,
            backgroundColor: theme.custom.surface.soft,
            mb: 2,
          }}
        >
          <DatePill
            value={pendingStart}
            active={activePill === "start"}
            onClick={() => setActivePill("start")}
          />
          <DatePill
            value={pendingEnd}
            active={activePill === "end"}
            onClick={() => setActivePill("end")}
          />
        </Stack>

        {/* Month + year nav */}
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1.5 }}>
          <Button
            size="small"
            variant="outlined"
            onClick={() => setViewDate((d) => addMonths(d, -1))}
            sx={{
              minWidth: 32,
              p: 0.25,
              borderColor: "divider",
              color: "text.secondary",
            }}
            aria-label="Previous month"
          >
            <ChevronLeftIcon fontSize="small" />
          </Button>

          <Select
            size="small"
            value={monthIdx}
            onChange={(e) => setViewDate((d) => setMonth(d, e.target.value))}
            sx={{ fontSize: 14, flex: 1 }}
          >
            {MONTHS.map((m, i) => (
              <MenuItem key={m} value={i} sx={{ fontSize: 14 }}>
                {m}
              </MenuItem>
            ))}
          </Select>

          <Select
            size="small"
            value={yearIdx}
            onChange={(e) => setViewDate((d) => setYear(d, e.target.value))}
            sx={{ fontSize: 14, minWidth: 96 }}
          >
            {yearOptions.map((y) => (
              <MenuItem key={y} value={y} sx={{ fontSize: 14 }}>
                {y}
              </MenuItem>
            ))}
          </Select>

          <Button
            size="small"
            variant="outlined"
            onClick={() => setViewDate((d) => addMonths(d, 1))}
            sx={{
              minWidth: 32,
              p: 0.25,
              borderColor: "divider",
              color: "text.secondary",
            }}
            aria-label="Next month"
          >
            <ChevronRightIcon fontSize="small" />
          </Button>
        </Stack>

        {/* Weekday header */}
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: "repeat(7, 1fr)",
            mb: 0.5,
          }}
        >
          {WEEKDAYS.map((d) => (
            <Box
              key={d}
              sx={{
                textAlign: "center",
                fontSize: 12,
                fontWeight: 600,
                color: "text.disabled",
                py: 0.75,
              }}
            >
              {d}
            </Box>
          ))}
        </Box>

        {/* Day grid — rendered week-by-week so range pills can span */}
        <Box sx={{ display: "flex", flexDirection: "column", gap: 0.25 }}>
          {chunk(days, 7).map((week, wi) => (
            <Box
              key={wi}
              sx={{
                display: "grid",
                gridTemplateColumns: "repeat(7, 1fr)",
              }}
            >
              {week.map((cell, di) => (
                <DayCell
                  key={`${wi}-${di}`}
                  cell={cell}
                  start={pendingStart}
                  end={pendingEnd}
                  onClick={handleDayClick}
                />
              ))}
            </Box>
          ))}
        </Box>
      </DialogContent>
    </Dialog>
  );
}

function DatePill({ value, active, onClick }) {
  const theme = useTheme();
  return (
    <Box
      onClick={onClick}
      sx={{
        flex: 1,
        py: 1,
        borderRadius: 1,
        border: 2,
        borderColor: active ? theme.palette.info.main : "transparent",
        backgroundColor: "background.paper",
        textAlign: "center",
        fontSize: 14,
        fontWeight: 500,
        color: value ? "text.primary" : "text.disabled",
        cursor: "pointer",
      }}
    >
      {value ? format(value, "dd-MM-yyyy") : "Pick a date"}
    </Box>
  );
}

function DayCell({ cell, start, end, onClick }) {
  const theme = useTheme();
  if (!cell) {
    return <Box sx={{ aspectRatio: "1.4 / 1" }} />;
  }
  const { date, currentMonth } = cell;
  const today = isSameDay(date, new Date());

  const hasRange = start && end;
  const inRange = hasRange && isWithinInterval(date, { start, end });
  const isStart = start ? isSameDay(date, start) : false;
  const isEnd = end ? isSameDay(date, end) : false;
  const isEdge = isStart || isEnd;
  const middle = inRange && !isEdge;

  const accent = theme.palette.info.main;

  // Background rules to form the continuous pill
  let background = "transparent";
  let borderRadius = 999;
  if (isStart && isEnd) {
    background = accent;
    borderRadius = 999;
  } else if (isStart) {
    background = `linear-gradient(to right, transparent 50%, ${accent}33 50%)`;
  } else if (isEnd) {
    background = `linear-gradient(to right, ${accent}33 50%, transparent 50%)`;
  } else if (middle) {
    background = `${accent}33`;
    borderRadius = 0;
  }

  return (
    <Box
      onClick={() => onClick(date)}
      sx={{
        aspectRatio: "1.4 / 1",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: currentMonth ? "pointer" : "default",
        background,
        color: !currentMonth ? "text.disabled" : "text.primary",
      }}
    >
      <Box
        sx={{
          width: "78%",
          height: "78%",
          borderRadius: borderRadius === 0 ? 0 : 999,
          backgroundColor: isEdge ? accent : "transparent",
          color: isEdge ? theme.palette.info.contrastText : undefined,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 14,
          fontWeight: today ? 700 : 500,
          textDecoration: today && !isEdge ? "underline" : "none",
          "&:hover":
            currentMonth && !isEdge
              ? { backgroundColor: `${accent}22` }
              : undefined,
        }}
      >
        {getDate(date)}
      </Box>
    </Box>
  );
}

function parseSafe(iso) {
  if (!iso) return null;
  try {
    const d = parseISO(iso);
    return Number.isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
}

function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

/**
 * Build a 6-week × 7-day grid covering the visible month. Cells
 * outside the current month are still real Date objects but flagged
 * `currentMonth: false` for muted styling.
 */
function buildGrid(viewDate) {
  const first = startOfMonth(viewDate);
  const firstWeekday = first.getDay(); // Sun = 0
  const gridStart = new Date(first);
  gridStart.setDate(first.getDate() - firstWeekday);

  const grid = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    grid.push({
      date: d,
      currentMonth: getMonth(d) === getMonth(viewDate),
    });
  }
  return grid;
}

export default DateRangeFilterDialog;
