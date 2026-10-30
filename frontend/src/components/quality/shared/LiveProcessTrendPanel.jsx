/** Trend pop-up for one Quality KPI, fed by an injectable history fetcher. */
import { useEffect, useState } from "react";
import JKLoader from "@/components/JKLoader.jsx";
import { getProcessKpiHistory } from "@/api/quality.js";
import { toDisplayDate } from "@/lib/dateFormat.js";
import { C } from "./theme.js";
import { monthRangeFromKey, QUALITY_DATA_DATE } from "./dates.js";
import { TrendChart } from "./TrendCharts.jsx";
import { _genInsight } from "./trendUtils.js";

const MONTHS = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(" ");

/** Compact x-axis label: "01 Oct" daily, "Oct 26" monthly, "2026" yearly. */
function shortAxisLabel(iso, granularity) {
  if (typeof iso !== "string" || iso.length < 10)
    return toDisplayDate(iso) ?? "";
  const month = MONTHS[Number(iso.slice(5, 7)) - 1];
  if (granularity === "YEAR") return iso.slice(0, 4);
  if (granularity === "MONTH") return `${month} ${iso.slice(2, 4)}`;
  return `${iso.slice(8, 10)} ${month}`;
}

export function LiveProcessTrendPanel({
  kpi,
  onClose,
  dateFrom,
  dateTo,
  // Day the Day / Month / Year pills are built around. Defaults to dateTo;
  // pass it when dateTo is a period end that can lie in the future.
  anchorDate,
  // Range pills this caller does not offer, e.g. ["day"].
  hiddenPresets = [],
  // Optional (from, to) → granularity, so the point grain follows the
  // selected range instead of staying fixed to `granularity`.
  granularityForRange,
  shift,
  granularity,
  fetchHistory = getProcessKpiHistory,
}) {
  // Presets resolve around the date the panel was opened for, not a fixed
  // workbook snapshot, so "Month" means the month the user is looking at.
  const presetAnchor = anchorDate || dateTo || QUALITY_DATA_DATE;
  const presetMonth = monthRangeFromKey(presetAnchor.slice(0, 7));
  const presetYear = {
    from: `${presetAnchor.slice(0, 4)}-01-01`,
    to: `${presetAnchor.slice(0, 4)}-12-31`,
  };
  const initialPreset =
    dateFrom === dateTo
      ? "day"
      : dateFrom === presetMonth.from && dateTo === presetMonth.to
        ? "month"
        : dateFrom === presetYear.from && dateTo === presetYear.to
          ? "year"
          : "";
  const [rangePreset, setRangePreset] = useState(initialPreset);
  const [trendFrom, setTrendFrom] = useState(dateFrom || QUALITY_DATA_DATE);
  const [trendTo, setTrendTo] = useState(dateTo || QUALITY_DATA_DATE);
  const [points, setPoints] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  useEffect(() => {
    const h = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
  const applyTrendPreset = (preset) => {
    setRangePreset(preset);
    if (preset === "day") {
      setTrendFrom(presetAnchor);
      setTrendTo(presetAnchor);
    } else if (preset === "month") {
      setTrendFrom(presetMonth.from);
      setTrendTo(presetMonth.to);
    } else if (preset === "year") {
      setTrendFrom(presetYear.from);
      setTrendTo(presetYear.to);
    }
  };
  const onTrendFromChange = (e) => {
    setRangePreset("");
    setTrendFrom(e.target.value);
  };
  const onTrendToChange = (e) => {
    setRangePreset("");
    setTrendTo(e.target.value);
  };
  const effectiveGranularity = granularityForRange
    ? granularityForRange(trendFrom, trendTo)
    : granularity;
  useEffect(() => {
    if (!kpi?.trendKpiName) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);
    setPoints([]);
    fetchHistory({
      kpiName: kpi.trendKpiName,
      dateFrom: trendFrom,
      dateTo: trendTo,
      shift,
      granularity: effectiveGranularity,
    })
      .then((res) => {
        if (!cancelled)
          setPoints(
            Array.isArray(res?.points)
              ? res.points.filter((p) => p.value != null)
              : [],
          );
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
  }, [
    kpi?.trendKpiName,
    trendFrom,
    trendTo,
    shift,
    effectiveGranularity,
    fetchHistory,
  ]);
  if (!kpi) return null;
  const labels = points.map((p) => toDisplayDate(p.date) ?? "");
  const axisLabels = points.map((p) =>
    shortAxisLabel(p.date, effectiveGranularity),
  );
  const series = points.map((p) => Number(p.value));
  const targetNum =
    kpi.target != null
      ? parseFloat(String(kpi.target).replace(/[^0-9.-]/g, ""))
      : NaN;
  const current = series.length
    ? series[series.length - 1]
    : parseFloat(String(kpi.v).replace(/,/g, ""));
  const target = !isNaN(targetNum) ? targetNum : current;
  const inv =
    kpi.lowerIsBetter === true ||
    /Violation|Scrap|Reject|Loss|Absent|First|Downtime|NCM|Defect|Reduced|Stoppage|Repeat|Hold|Breakdown/i.test(
      kpi.n,
    );
  const stCol = kpi.id === "mqv" ? C.rd : kpi.id === "audit" ? C.bl : C.ac;
  const ins = series.length
    ? _genInsight(series, target, current, inv, kpi.n)
    : { bestIdx: -1, worstIdx: -1 };
  return (
    <div
      onClick={onClose}
      className="no-print"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15,23,42,0.55)",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        animation: "fadeIn .15s ease",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: C.cd,
          borderRadius: 12,
          maxWidth: 740,
          width: "100%",
          maxHeight: "90vh",
          overflow: "auto",
          boxShadow: "0 20px 60px rgba(0,0,0,.25)",
          border: "1px solid " + C.bd,
        }}
      >
        <div
          style={{
            padding: "14px 18px",
            borderBottom: "1px solid " + C.bd,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <div>
            <div
              style={{
                fontSize: 12,
                color: C.mu,
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: ".5px",
              }}
            >
              KPI Trend Analysis
            </div>
            <div
              style={{
                fontSize: 19,
                fontWeight: 700,
                color: C.tx,
                marginTop: 2,
              }}
            >
              {kpi.n}
            </div>
            <div style={{ fontSize: 12, color: C.mu, marginTop: 2 }}>
              {trendFrom} to {trendTo} ·{" "}
              {effectiveGranularity ??
                (shift === "All" ? "DAY" : `SHIFT ${shift}`)}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 30,
              height: 30,
              borderRadius: 8,
              border: "1px solid " + C.bd,
              background: C.c2,
              color: C.mu,
              fontSize: 19,
              cursor: "pointer",
              lineHeight: 1,
            }}
          >
            {"✕"}
          </button>
        </div>
        <div
          style={{
            padding: "12px 18px",
            borderBottom: "1px solid " + C.bd,
            display: "flex",
            alignItems: "center",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          <div
            style={{
              display: "flex",
              gap: 1,
              background: C.bg,
              borderRadius: 10,
              padding: 2,
            }}
          >
            {[
              ["day", "Day"],
              ["month", "Month"],
              ["year", "Year"],
            ]
              .filter(([id]) => !hiddenPresets.includes(id))
              .map(([id, label]) => {
                const active = rangePreset === id;
                return (
                  <button
                    key={id}
                    onClick={() => applyTrendPreset(id)}
                    style={{
                      padding: "4px 12px",
                      borderRadius: 8,
                      border: "none",
                      background: active ? C.cd : "transparent",
                      color: active ? C.tx : C.mu,
                      fontSize: 12,
                      fontWeight: active ? 700 : 500,
                      cursor: "pointer",
                    }}
                  >
                    {label}
                  </button>
                );
              })}
          </div>
          <div
            title="Trend date range"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              padding: "3px 8px",
              border: "1px solid " + C.bd,
              borderRadius: 8,
              background: C.cd,
            }}
          >
            <input
              type="date"
              value={trendFrom}
              onChange={onTrendFromChange}
              style={{
                border: "none",
                outline: "none",
                background: "transparent",
                fontSize: 12,
                fontFamily: "inherit",
                color: C.tx,
                padding: "2px 0",
                width: 116,
              }}
            />
            <span style={{ color: C.bd, fontSize: 12 }}>{"–"}</span>
            <input
              type="date"
              value={trendTo}
              onChange={onTrendToChange}
              style={{
                border: "none",
                outline: "none",
                background: "transparent",
                fontSize: 12,
                fontFamily: "inherit",
                color: C.tx,
                padding: "2px 0",
                width: 116,
              }}
            />
          </div>
        </div>
        <div style={{ padding: "14px 18px" }}>
          <div
            style={{
              background: C.c2,
              borderRadius: 8,
              border: "1px solid " + C.bd,
              padding: "10px 12px 4px",
            }}
          >
            <div
              style={{
                fontSize: 12,
                color: C.mu,
                fontWeight: 600,
                textTransform: "uppercase",
                marginBottom: 4,
                display: "flex",
                alignItems: "center",
                gap: 10,
                flexWrap: "wrap",
              }}
            >
              <span>Actual vs Target — fetched from API</span>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  fontSize: 11,
                }}
              >
                <span
                  style={{
                    width: 14,
                    height: 2,
                    background: stCol,
                    display: "inline-block",
                  }}
                />
                Actual
              </span>
              {!isNaN(targetNum) && (
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    fontSize: 11,
                  }}
                >
                  <span
                    style={{
                      width: 14,
                      height: 0,
                      borderTop: "1.5px dashed " + C.am,
                      display: "inline-block",
                    }}
                  />
                  Target
                </span>
              )}
              {ins.bestIdx >= 0 && (
                <>
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                      fontSize: 11,
                    }}
                  >
                    <span
                      style={{
                        width: 10,
                        height: 10,
                        background: C.gn,
                        display: "inline-block",
                        borderRadius: "50%",
                      }}
                    />
                    Best
                  </span>
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                      fontSize: 11,
                    }}
                  >
                    <span
                      style={{
                        width: 10,
                        height: 10,
                        background: C.rd,
                        display: "inline-block",
                        borderRadius: "50%",
                      }}
                    />
                    Worst
                  </span>
                </>
              )}
            </div>
            {loading && (
              <div
                style={{
                  minHeight: 240,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <JKLoader message="Loading trend" />
              </div>
            )}
            {error && (
              <div
                style={{
                  padding: 24,
                  textAlign: "center",
                  fontSize: 13,
                  color: C.rd,
                }}
              >
                Trend fetch failed: {error.message || "Request failed"}
              </div>
            )}
            {!loading && !error && !series.length && (
              <div
                style={{
                  padding: 24,
                  textAlign: "center",
                  fontSize: 13,
                  color: C.mu,
                }}
              >
                No trend points returned for this date range.
              </div>
            )}
            {!loading && !error && series.length > 0 && (
              <TrendChart
                labels={labels}
                axisLabels={axisLabels}
                series={series}
                target={isNaN(targetNum) ? null : targetNum}
                color={stCol}
                bestIdx={ins.bestIdx}
                worstIdx={ins.worstIdx}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
