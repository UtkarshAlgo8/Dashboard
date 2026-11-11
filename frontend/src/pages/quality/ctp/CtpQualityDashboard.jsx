/**
 * CTP Quality dashboard — Process and Product tabs (CTP Quality gold).
 *
 * One request per tab and view: the summary call returns the tab's cards,
 * their sparklines and every drill table for the selected tyre type and
 * period, so opening a card or a row is instant. The Product request runs
 * only when its tab opens. Views map 1:1 to stored gold grains (Today / a
 * day / a shift of that day, a month, this year); there is no free date
 * range because most KPIs are ratios that cannot be rebuilt from daily rows.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Box, Typography } from "@mui/material";
import JKLoader from "@/components/JKLoader.jsx";
import ProductionHeader from "@/components/production/ProductionHeader.jsx";
import { KpiSplitLayout } from "@/components/quality/shared/KpiSplitLayout.jsx";
import { LiveProcessTrendPanel } from "@/components/quality/shared/LiveProcessTrendPanel.jsx";
import { PrintStyles } from "@/components/quality/shared/PrintStyles.jsx";
import { QKpiCard } from "@/components/quality/shared/QualityKpiCard.jsx";
import { getCtpQualitySummary, getCtpQualityTrend } from "@/api/ctpQuality.js";
import { CTP_TAB_CARDS, buildCtpCards } from "./ctpCards.js";
import CtpProcessDrillPanel from "./CtpProcessDrillPanel.jsx";
import CtpProductDrillPanel from "./CtpProductDrillPanel.jsx";
import CtpSpcDashboard from "./CtpSpcDashboard.jsx";

const MONTH_KEY = /^\d{4}-(0[1-9]|1[0-2])$/;

function todayInIst() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function shiftIso(iso, { days = 0, months = 0, years = 0 }) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y + years, m - 1 + months, d + days))
    .toISOString()
    .slice(0, 10);
}

function formatPeriod(grain, date, shift) {
  const d = new Date(`${date}T00:00:00Z`);
  const opts = { timeZone: "UTC" };
  if (grain === "YEAR") return date.slice(0, 4);
  if (grain === "MONTH")
    return d.toLocaleDateString("en-IN", {
      ...opts,
      month: "short",
      year: "numeric",
    });
  const day = d.toLocaleDateString("en-IN", {
    ...opts,
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  return shift && shift !== "All" ? `Shift ${shift} · ${day}` : day;
}

/**
 * Range the trend pop-up opens with. It matches one of the panel's pills so
 * a pill is lit by default: a day view opens on the "Month" pill (daily
 * points for that month), a month view on the "Year" pill (monthly points
 * for that year). The year view has no wider pill, so it opens on the last
 * five years.
 */
function trendWindow(grain, date) {
  if (grain === "YEAR")
    return { from: shiftIso(date, { years: -4 }), to: date };
  if (grain === "MONTH")
    return {
      from: `${date.slice(0, 4)}-01-01`,
      to: `${date.slice(0, 4)}-12-31`,
    };
  const monthEnd = shiftIso(`${date.slice(0, 7)}-01`, { months: 1, days: -1 });
  return { from: `${date.slice(0, 7)}-01`, to: monthEnd };
}

/**
 * Point grain for a trend range: up to two months reads daily rows, up to
 * three years monthly rows, anything longer yearly rows. So the "Month" pill
 * draws a daily line and the "Year" pill a monthly one.
 */
function trendGranularity(from, to) {
  const days =
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) /
      86_400_000 +
    1;
  if (!(days > 62)) return "DAY";
  if (days <= 3 * 366) return "MONTH";
  return "YEAR";
}

const TAB_VIEW = {
  process: {
    Panel: CtpProcessDrillPanel,
    emptyReason: "No audits for this period",
    errorLabel: "Process",
  },
  product: {
    Panel: CtpProductDrillPanel,
    emptyReason: "No data for this period",
    errorLabel: "Product",
  },
};

const SUB_TABS = [
  { id: "process", label: "Process" },
  { id: "product", label: "Product" },
  { id: "complaint", label: "Customer Complaint", enabled: false },
  { id: "spc", label: "SPC" },
];

export default function CtpQualityDashboard({ plant }) {
  const today = todayInIst();
  const [tab, setTab] = useState("process");
  const [tyre, setTyre] = useState("All");
  // "today" | "day" | "month" | "year" — BTP opens on the current month.
  const [preset, setPreset] = useState("month");
  const [day, setDay] = useState(today);
  const [monthKey, setMonthKey] = useState(null);
  const [shift, setShift] = useState("All");
  const [openKpi, setOpenKpi] = useState(null);
  const [trendKpi, setTrendKpi] = useState(null);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState(null);

  const isDayView = preset === "today" || preset === "day";
  const grain = isDayView ? "DAY" : preset === "year" ? "YEAR" : "MONTH";
  const date =
    preset === "today"
      ? today
      : preset === "day"
        ? day
        : preset === "year"
          ? `${today.slice(0, 4)}-01-01`
          : `${monthKey ?? today.slice(0, 7)}-01`;
  const activeShift = isDayView ? shift : "All";
  const periodLabel = formatPeriod(grain, date, activeShift);

  useEffect(() => {
    if (tab === "spc") return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);
    getCtpQualitySummary(tab, {
      tyre,
      granularity: grain,
      date,
      shift: activeShift,
    })
      .then((res) => {
        if (cancelled) return;
        setSummary(res);
        setLastUpdatedAt(new Date());
      })
      .catch((err) => {
        if (!cancelled) setError(err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tab, tyre, grain, date, activeShift]);

  const view = TAB_VIEW[tab];
  const cards = useMemo(
    () =>
      tab === "spc"
        ? []
        : buildCtpCards(CTP_TAB_CARDS[tab], summary?.cards, {
            grain,
            isShift: activeShift !== "All",
            periodLabel,
            emptyReason: TAB_VIEW[tab].emptyReason,
          }),
    [tab, summary, grain, activeShift, periodLabel],
  );
  const openObj = openKpi
    ? cards.find((k) => k.id === openKpi && !k.greyed)
    : null;

  const fetchTrend = useCallback(
    (params) => getCtpQualityTrend(tab, { ...params, tyre }),
    [tab, tyre],
  );

  const onTabChange = (next) => {
    if (next === tab || (next !== "spc" && !TAB_VIEW[next])) return;
    setTab(next);
    setSummary(null);
    setLoading(true);
    setOpenKpi(null);
    setTrendKpi(null);
  };

  const timeRangeForHeader = {
    preset: preset === "day" ? "day" : preset,
    from: null,
    to: null,
    month: preset === "month" ? monthKey : null,
  };
  const onTimeRangeChange = (updater) => {
    const next =
      typeof updater === "function" ? updater(timeRangeForHeader) : updater;
    if (next?.preset === "month" && MONTH_KEY.test(next.month ?? "")) {
      setPreset("month");
      setMonthKey(next.month === today.slice(0, 7) ? null : next.month);
      setShift("All");
    } else if (["today", "month", "year"].includes(next?.preset)) {
      setPreset(next.preset);
      setMonthKey(null);
      if (next.preset !== "today") setShift("All");
    }
  };

  const renderCard = (kpi) =>
    kpi.greyed ? (
      <Box key={kpi.id} sx={{ opacity: 0.55 }} title={kpi.emptyReason}>
        <QKpiCard kpi={kpi} isOpen={false} onToggle={() => {}} />
      </Box>
    ) : (
      <QKpiCard
        key={kpi.id}
        kpi={kpi}
        isOpen={openKpi === kpi.id}
        onToggle={() => setOpenKpi(openKpi === kpi.id ? null : kpi.id)}
        onTrend={setTrendKpi}
      />
    );

  if (tab === "spc") {
    return (
      <CtpSpcDashboard
        plant={plant}
        initialTyre={tyre}
        categoryTabs={SUB_TABS}
        onCategoryChange={onTabChange}
      />
    );
  }

  const trendRange = trendWindow(grain, date);
  // Pills inside the trend pop-up centre on the selected day; for a month or
  // year view, on its last day, or today while it is still running.
  const periodEnd =
    grain === "YEAR"
      ? `${date.slice(0, 4)}-12-31`
      : shiftIso(`${date.slice(0, 7)}-01`, { months: 1, days: -1 });
  const trendAnchor =
    grain === "DAY" ? date : periodEnd < today ? periodEnd : today;

  return (
    <Box
      sx={{
        minHeight: "100vh",
        backgroundColor: "background.default",
        color: "text.primary",
        fontFamily:
          'Montserrat, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
      }}
    >
      <PrintStyles />
      <ProductionHeader
        plant={plant}
        timeRange={timeRangeForHeader}
        onTimeRangeChange={onTimeRangeChange}
        shift={activeShift.toLowerCase()}
        onShiftChange={
          isDayView
            ? (value) =>
                setShift(value === "all" ? "All" : String(value).toUpperCase())
            : undefined
        }
        singleDay={isDayView ? date : ""}
        onSingleDayChange={(value) => {
          setPreset("day");
          setDay(value);
        }}
        showYearPreset
        hideCustomRange
        dayPickerInMenu
        onExport={() => window.print?.()}
        // "This Month" is the calendar month (IST), so the month menu is
        // built from today too, even when the gold lags behind.
        asOf={today}
        lastUpdatedAt={lastUpdatedAt}
        categoryTabs={SUB_TABS}
        activeCategory={tab}
        onCategoryChange={onTabChange}
        tyreTypes={["All", "PCR", "TBR"]}
        tyreType={tyre}
        onTyreTypeChange={setTyre}
      />

      <Box
        sx={{
          px: { xs: 2, md: 3 },
          py: 2,
          display: "flex",
          flexDirection: "column",
          gap: 2,
        }}
      >
        {loading ? (
          <Box
            sx={{
              minHeight: "calc(100vh - 220px)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <JKLoader message="Please wait" />
          </Box>
        ) : error ? (
          <Typography color="error" sx={{ p: 2 }}>
            Could not load {view.errorLabel} data:{" "}
            {error.message || "Request failed"}
          </Typography>
        ) : (
          <KpiSplitLayout
            open={Boolean(openObj)}
            cards={<>{cards.map(renderCard)}</>}
            panel={
              <view.Panel
                kpi={openObj}
                drills={summary?.drills}
                periodLabel={periodLabel}
                tyre={tyre}
              />
            }
          />
        )}
      </Box>

      {trendKpi && (
        <LiveProcessTrendPanel
          kpi={trendKpi}
          onClose={() => setTrendKpi(null)}
          dateFrom={trendRange.from}
          dateTo={trendRange.to}
          anchorDate={trendAnchor}
          hiddenPresets={["day"]}
          shift={activeShift}
          granularity={grain}
          granularityForRange={trendGranularity}
          fetchHistory={fetchTrend}
        />
      )}
    </Box>
  );
}
