import { useState } from "react";
import TimeRangeSelect from "@/components/production/TimeRangeSelect.jsx";

/**
 * Shared date-range state for Engineering KPI trend modals.
 *
 * This intentionally mirrors the BTP production trend modal: Daily and
 * Monthly are named by granularity, Yearly remains disabled until the gold
 * feed publishes yearly rows, and Date Range is an exact custom window.
 */
export function useReliabilityTrendRange({ open, hiddenPresets = [] }) {
  const [preset, setPreset] = useState("month");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  // Match the existing BTP trend modal: reset during the discrete open
  // transition so the first request after opening cannot use stale dates.
  const [previousOpen, setPreviousOpen] = useState(false);
  if (open !== previousOpen) {
    setPreviousOpen(open);
    if (open) {
      setPreset("month");
      setFrom("");
      setTo("");
    }
  }

  const control = (
    <TimeRangeSelect
      preset={preset}
      variant="trend"
      presetLabels={{ today: "Daily", month: "Monthly", year: "Yearly" }}
      hiddenPresets={hiddenPresets}
      from={from}
      to={to}
      onPresetChange={(next) => {
        setPreset(typeof next === "string" ? next : (next?.preset ?? "month"));
        setFrom("");
        setTo("");
      }}
      onFromChange={(value) => {
        setFrom(value);
        setPreset("custom");
      }}
      onToChange={(value) => {
        setTo(value);
        setPreset("custom");
      }}
    />
  );

  return { preset, from, to, control };
}

/**
 * Translate a BTP trend selection into Engineering's cross-sectional query.
 * Daily/custom windows use additive DAY rows and are summed by group. Monthly
 * uses the published MONTH row, which is the only valid source for rate KPIs.
 */
export function reliabilityTrendRequest({ preset, from, to, asOf }) {
  const anchor = asOf || to || from;
  if (preset === "custom" && from && to) {
    return {
      date: from,
      from,
      to,
      granularity: "DAY",
      aggregate: true,
    };
  }

  if (preset === "today") {
    const dailyFrom = anchor ? `${anchor.slice(0, 7)}-01` : null;
    return {
      date: anchor,
      from: dailyFrom,
      to: anchor,
      granularity: "DAY",
      aggregate: true,
    };
  }

  const monthDate = anchor ? `${anchor.slice(0, 7)}-01` : anchor;
  return {
    date: monthDate,
    from: undefined,
    to: undefined,
    granularity: "MONTH",
    aggregate: false,
  };
}

/** Date window for a time-series history request. */
export function reliabilityTrendHistory({ preset, from, to, asOf }) {
  const anchor = asOf || to || from;
  if (preset === "custom" && from && to) {
    return { from, to, granularity: "DAY" };
  }
  if (preset === "today") {
    return {
      from: anchor ? `${anchor.slice(0, 7)}-01` : anchor,
      to: anchor,
      granularity: "DAY",
    };
  }
  return {
    from: anchor ? `${anchor.slice(0, 4)}-01-01` : anchor,
    to: anchor,
    granularity: "MONTH",
  };
}
