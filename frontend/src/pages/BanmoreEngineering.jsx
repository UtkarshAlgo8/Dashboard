import { useEffect, useMemo, useState } from "react";
import { Box, useTheme } from "@mui/material";
import ProductionHeader from "@/components/production/ProductionHeader.jsx";
import EngineeringKpiGrid from "@/components/engineering/EngineeringKpiGrid.jsx";
import JKLoader from "@/components/JKLoader.jsx";
import EngineeringOverviewSection from "@/pages/engineering/EngineeringOverviewSection.jsx";
import EngineeringReliabilitySection from "@/pages/engineering/EngineeringReliabilitySection.jsx";
import {
  currentMonthKeyInIST,
  todayInIST,
  monthRangeFromKey,
  formatDayLabel,
} from "@/pages/engineering/reliabilityShared.jsx";
import { usePolledQuery } from "@/hooks/usePolledQuery.js";
import { getPlant, getEngineeringKpis } from "@/api/plants.js";
import { getReliabilityLatestDate } from "@/api/engineering.js";
import { ENGINEERING_TABS } from "@/lib/mockData.js";
import { useToast } from "@/components/common";

// Real-backend tabs (spec 16/17). The other 4 tabs (maintenance/utilities/
// projects/ops) stay on the mock EngineeringKpiGrid path untouched.
const LIVE_TABS = new Set(["overall", "reliability"]);

// The four summary cards. The page's default report period is the latest date
// on which ALL of them have a value, so the landing view is never a
// half-published day showing one number and three blanks.
const SUMMARY_KPIS = [
  "Breakdown_Pct_Overall",
  "BreakdownMin_Overall",
  "MTBF_Overall",
  "MTTR_Overall",
];

/**
 * Engineering Head dashboard shell for Banmore (spec 16/17). Ships page
 * chrome, the 6-tab strip, and per-tab content: Overview + Reliability are
 * wired to the real Engineering Reliability backend (Loss Tree, Breakdown/
 * MTBF/MTTR/Zero-Breakdown/Top-Machine-Breakdowns drills); the remaining 4
 * tabs keep the mock `EngineeringKpiGrid` shell from spec 16.
 */
function BanmoreEngineering() {
  const theme = useTheme();
  const plantId = "banmore";
  const toast = useToast();

  const [activeTab, setActiveTab] = useState("overall");
  // `preset: null` = "nothing picked yet", NOT "today". The distinction
  // matters: the feed publishes the running day incrementally, so opening
  // straight onto today shows a page of 0.00% and "—" (accurate, but it
  // reads as broken). With no preset the page anchors to the latest COMPLETE
  // period instead; clicking Today still pins to today, empty or not.
  const [timeRange, setTimeRange] = useState({
    preset: null,
    from: "",
    to: "",
  });

  const { data: plant } = usePolledQuery(() => getPlant(plantId), {
    interval: 0,
    deps: [plantId],
  });

  const isLiveTab = LIVE_TABS.has(activeTab);

  const {
    data: kpis,
    isLoading: kpisLoading,
    error: kpisError,
  } = usePolledQuery(() => getEngineeringKpis(plantId, activeTab), {
    interval: 0,
    deps: [plantId, activeTab],
    keepPreviousData: true,
    enabled: !isLiveTab,
  });

  useEffect(() => {
    if (kpisError && !isLiveTab) toast.error("Could not load Engineering dashboard");
  }, [kpisError, isLiveTab, toast]);

  // The excel mock's Engineering Reliability rows are MONTH-grain only
  // (Jan-Sep 2026); the real upstream (`db` mode) carries this category at
  // DAY/SHIFT grain only — there is no MONTH row there. Rather than
  // hardcoding either, default granularity to "MONTH" (matches today's
  // excel-mode behavior so nothing regresses before the fetch below
  // resolves) and let the backend's mode-aware `resolveGranularity`
  // default tell us which one is actually live.
  const [granularity, setGranularity] = useState("MONTH");
  const [defaultDate, setDefaultDate] = useState(null);
  // Until this resolves we don't know the live grain or the anchor date, so
  // the sections are held back behind a loader rather than firing a request
  // with placeholder params — in `db` mode those placeholders (MONTH + the
  // current month) match nothing and would flash a grid of "—" first.
  const [periodResolved, setPeriodResolved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getReliabilityLatestDate({ kpiNames: SUMMARY_KPIS })
      .then((res) => {
        if (cancelled) return;
        if (res?.context?.granularity) setGranularity(res.context.granularity);
        if (res?.date) setDefaultDate(res.date);
      })
      .catch(() => {
        /* keep the MONTH/current-month fallback below on failure */
      })
      // Always release the gate — a failed anchor must fall through to the
      // fallback period, never leave the page spinning forever.
      .finally(() => !cancelled && setPeriodResolved(true));
    return () => {
      cancelled = true;
    };
  }, []);

  // The selected reporting period, as either a single `date` or a `from`/`to`
  // range. A range makes the backend rebuild the headline KPIs from
  // machine-level components, because MTBF/MTTR/Breakdown % are rates that
  // cannot be summed or averaged across days.
  const presetKey = timeRange?.preset ?? null;
  const monthKey = timeRange?.month ?? null;
  //
  // `date` is always present: the drill panels read a single day, so a range
  // selection still needs one (its last day). `from`/`to` are added only for
  // a multi-day period and are what switch the summary/Loss Tree to the
  // aggregated path.
  const period = useMemo(() => {
    // A month picked from the dropdown: that whole calendar month.
    if (monthKey) {
      const { from, to } = monthRangeFromKey(monthKey);
      return { date: to, from, to, label: `${formatDayLabel(from)} – ${formatDayLabel(to)}` };
    }
    // "This Month": the current calendar month so far (month-to-date).
    if (presetKey === "month") {
      const today = todayInIST();
      const from = monthRangeFromKey(today.slice(0, 7)).from;
      return {
        date: today,
        from,
        to: today,
        label: `${formatDayLabel(from)} – ${formatDayLabel(today)} (month to date)`,
      };
    }
    // "Today": literally today, even if the feed has only half-published it.
    if (presetKey === "today") {
      const today = todayInIST();
      return { date: today, label: `${formatDayLabel(today)} (today)` };
    }
    // Nothing chosen yet — the latest period with a COMPLETE set of values.
    const anchored = defaultDate ?? currentMonthKeyInIST();
    return {
      date: anchored,
      label: `${formatDayLabel(anchored)}${defaultDate ? " (latest complete day)" : ""}`,
    };
  }, [presetKey, monthKey, defaultDate]);
  const periodLabel = period.label;

  // ProductionHeader spreads `...prev` on every pill click, so a month left
  // over from the dropdown would survive a later "Today" click and silently
  // pin the page to that stale month. Any preset other than "month" clears it.
  const onTimeRangeChange = (updater) => {
    setTimeRange((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      if (!next || next.preset === "month") return next;
      const withoutMonth = { ...next };
      delete withoutMonth.month;
      return withoutMonth;
    });
  };

  return (
    <Box
      sx={{
        minHeight: "100vh",
        backgroundColor: "background.default",
      }}
    >
      <Box sx={{ flexShrink: 0, zIndex: theme.zIndex.appBar }}>
        <ProductionHeader
          plant={plant}
          timeRange={timeRange}
          onTimeRangeChange={onTimeRangeChange}
          onExport={() => {}}
          categoryTabs={ENGINEERING_TABS}
          activeCategory={activeTab}
          onCategoryChange={setActiveTab}
          tyreTypes={[]}
        />
      </Box>

      <Box sx={{ px: { xs: 2, md: 3 }, py: 2 }}>
        {isLiveTab && !periodResolved && (
          <JKLoader message="Loading Engineering data" />
        )}
        {/* The gold feed runs behind the calendar, so the page is often NOT
            showing today. Say which period is on screen — without it a quiet
            day is indistinguishable from a broken dashboard. */}
        {isLiveTab && periodResolved && (
          <Box
            sx={{
              mb: 1.5,
              fontSize: 13,
              color: "text.secondary",
              fontWeight: 500,
            }}
          >
            Showing {periodLabel}
          </Box>
        )}
        {activeTab === "overall" && periodResolved && (
          <EngineeringOverviewSection
            date={period.date}
            from={period.from}
            to={period.to}
            granularity={granularity}
          />
        )}
        {activeTab === "reliability" && periodResolved && (
          <EngineeringReliabilitySection
            date={period.date}
            from={period.from}
            to={period.to}
            granularity={granularity}
          />
        )}
        {!isLiveTab && (
          <EngineeringKpiGrid
            kpis={kpis}
            isLoading={kpisLoading}
            error={kpisError}
          />
        )}
      </Box>
    </Box>
  );
}

export default BanmoreEngineering;
