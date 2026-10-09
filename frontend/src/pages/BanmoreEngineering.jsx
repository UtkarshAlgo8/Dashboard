import { useEffect, useMemo, useRef, useState } from "react";
import { Box, useTheme } from "@mui/material";
import ProductionHeader from "@/components/production/ProductionHeader.jsx";
import EngineeringKpiGrid from "@/components/engineering/EngineeringKpiGrid.jsx";
import EngineeringOverviewSection from "@/pages/engineering/EngineeringOverviewSection.jsx";
import EngineeringReliabilitySection from "@/pages/engineering/EngineeringReliabilitySection.jsx";
import {
  currentMonthKeyInIST,
  todayInIST,
  formatDayLabel,
  formatMonthLabel,
} from "@/pages/engineering/reliabilityShared.jsx";
import { resolveEngineeringPeriod } from "@/lib/engineeringPeriod.js";
import { exportElementToPdf } from "@/lib/exportPdf.js";
import { usePolledQuery } from "@/hooks/usePolledQuery.js";
import { getPlant, getEngineeringKpis } from "@/api/plants.js";
import { ENGINEERING_TABS } from "@/lib/mockData.js";
import { useToast } from "@/components/common";

// Real-backend tabs (spec 16/17). The other 4 tabs (maintenance/utilities/
// projects/ops) stay on the mock EngineeringKpiGrid path untouched.
const LIVE_TABS = new Set(["overall", "reliability"]);

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

  // Header download: one PDF of the dashboard body as it is on screen.
  const bodyRef = useRef(null);
  const onExportPdf = async () => {
    await exportElementToPdf(bodyRef.current, {
      filename: `${plantId}-engineering-${activeTab}.pdf`,
      backgroundColor: theme.palette.background.default,
    });
  };

  const [activeTab, setActiveTab] = useState("overall");
  // The current month is the default filter, and `preset: "month"` is what
  // says so in the UI — the header's "This Month" pill starts lit and its
  // dropdown starts on this month, so the period on screen matches the
  // control that selects it.
  //
  // Deliberately not "today": the feed publishes the running day
  // incrementally, so opening onto today shows a page of 0.00% and "—"
  // (accurate, but it reads as broken). The month row is a rollup that
  // already includes today, so it is complete at every hour of the day.
  // Clicking Today still pins to today, empty or not.
  const [timeRange, setTimeRange] = useState({
    preset: "month",
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

  // The selected reporting period: one `date` plus the `granularity` that
  // date is stored at — or, for an arbitrary custom range, a from/to window.
  // Every section, card and drill level reads that one period, so the
  // headline and the table under it always describe the same span. See
  // lib/engineeringPeriod.js for how each header choice maps onto it.
  const period = useMemo(
    () =>
      resolveEngineeringPeriod(timeRange, {
        today: todayInIST(),
        currentMonth: currentMonthKeyInIST(),
      }),
    [timeRange],
  );
  const periodLabel = labelOf(period);

  // ProductionHeader spreads `...prev` on every pill click, so a month left
  // over from the dropdown would survive a later pill click and silently pin
  // the page to that stale month.
  //
  // Any preset other than "month" clears it outright. "month" is ambiguous —
  // the "This Month" pill and the month dropdown both emit it — so they are
  // told apart by whether `month` actually changed: the dropdown always
  // names the month it selected, while the pill only carries the previous
  // one through the spread. Without this, clicking "This Month" while a past
  // month is pinned leaves the page on that past month.
  const onTimeRangeChange = (updater) => {
    setTimeRange((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      if (!next) return next;
      if (next.preset === "month" && next.month !== prev?.month) return next;
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
          onExport={onExportPdf}
          categoryTabs={ENGINEERING_TABS}
          activeCategory={activeTab}
          onCategoryChange={setActiveTab}
          tyreTypes={[]}
        />
      </Box>

      <Box ref={bodyRef} sx={{ px: { xs: 2, md: 3 }, py: 2 }}>
        {/* The gold feed runs behind the calendar, so the page is often NOT
            showing today. Say which period is on screen — without it a quiet
            day is indistinguishable from a broken dashboard. */}
        {isLiveTab && (
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
        {activeTab === "overall" && (
          <EngineeringOverviewSection period={period} periodLabel={periodLabel} />
        )}
        {activeTab === "reliability" && (
          <EngineeringReliabilitySection period={period} periodLabel={periodLabel} />
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

/** The "Showing …" caption for a resolved period. */
function labelOf(period) {
  if (period.kind === "range") {
    return `${formatDayLabel(period.from)} – ${formatDayLabel(period.to)}`;
  }
  if (period.kind === "day") {
    return period.date === todayInIST()
      ? `${formatDayLabel(period.date)} (today)`
      : formatDayLabel(period.date);
  }
  return period.date === currentMonthKeyInIST()
    ? `${formatMonthLabel(period.date)} (month to date)`
    : formatMonthLabel(period.date);
}

export default BanmoreEngineering;
