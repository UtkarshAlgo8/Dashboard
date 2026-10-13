/* eslint-disable */
/**
 * Zero Breakdown Machines behind its trend icon.
 *
 * Look and interaction are the mock's `TrendPanel` for a `chart: "progress"`
 * KPI, block for block: a 740px card centred on screen, a TIME RANGE row
 * under the header, then "Progress to Target" — 0 on the left and the amber
 * target on the right, a rounded bar with the count inside it and an amber
 * tick where the target falls, "84% of target" underneath with an ON TRACK
 * chip once the bar clears it — and finally the TRAJECTORY line.
 *
 * The mock's range presets are Today/Week/Month/Year. Gold publishes DAY and
 * MONTH rows only (backend `ALLOWED_GRANULARITIES`), so the row carries the
 * two the data can actually answer: Daily walks the last 30 days, Monthly the
 * last 12 months.
 *
 * Data follows the KPI spec:
 *   - the count and the trajectory are `ZeroBreakdownMachines_Section`,
 *     summed across each period's (status, section) rows — rule 3b, "sum
 *     their rows for the unfiltered figure"; a count is additive.
 *   - the target is the mock's ≥50, carried in reliabilityTargets.js. The
 *     spec publishes no `threshold_value` for this KPI.
 *   - the headline count stays at DAY grain to agree with the card, which is
 *     "as of" a running date rather than "during a month" (see
 *     reliabilityPanels.jsx). Only the trajectory follows the range chips.
 */
import { useEffect, useState } from "react";
import { getReliabilityKpiHistory } from "@/api/engineering.js";
import JKLoader from "@/components/JKLoader.jsx";
import { C, TrendChart, fmtNum } from "./reliabilityShared.jsx";
import {
  reliabilityTrendHistory,
  useReliabilityTrendRange,
} from "./reliabilityTrendRange.jsx";
import { AnalysisModal, Block } from "./reliabilityChrome.jsx";
import { TARGETS } from "./reliabilityTargets.js";

/**
 * @param {{ open: boolean, onClose: () => void, total: number|null, asOf: string|null }} props
 */
function ZeroBreakdownTrendModal({ open, onClose, total, asOf }) {
  const [points, setPoints] = useState([]);
  const [loading, setLoading] = useState(true);
  const trend = useReliabilityTrendRange({ open });
  const history = reliabilityTrendHistory({
    preset: trend.preset,
    from: trend.from,
    to: trend.to,
    asOf,
  });
  const target = TARGETS.zeroBreakdownMachines;

  useEffect(() => {
    if (!open || !asOf || !history.from || !history.to) return;
    let cancelled = false;
    setLoading(true);
    setPoints([]);
    getReliabilityKpiHistory({
      kpiName: "ZeroBreakdownMachines_Section",
      dateFrom: history.from,
      dateTo: history.to,
      granularity: history.granularity,
    })
      .then((hist) => {
        if (cancelled) return;
        const perPeriod = new Map();
        for (const p of Array.isArray(hist?.points) ? hist.points : []) {
          if (p.value == null) continue;
          const key = String(p.date).slice(0, 10);
          perPeriod.set(key, (perPeriod.get(key) ?? 0) + p.value);
        }
        setPoints(
          [...perPeriod.entries()].sort((a, b) => a[0].localeCompare(b[0])),
        );
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [open, asOf, history.from, history.to, history.granularity]);

  const selectedTotal = points.length ? points[points.length - 1][1] : total;
  const selectedAsOf = points.length ? points[points.length - 1][0] : asOf;
  const pct =
    selectedTotal == null
      ? null
      : Math.min(150, Math.max(0, (selectedTotal / target) * 100));
  const onTarget = pct != null && pct >= 100;
  // The tick sits where the target falls on a bar scaled to whichever of the
  // two is larger — the mock's rule, so the target never runs off the end.
  const tickPct = Math.min(
    100,
    (target / Math.max(selectedTotal ?? 0, target)) * 100,
  );

  return (
    <AnalysisModal
      open={open}
      onClose={onClose}
      eyebrow="KPI Trend Analysis"
      title="Zero Breakdown Machines"
      headerExtra={trend.control}
      maxWidth={740}
      align="center"
    >
      <Block
        title={`Progress to Target${selectedAsOf ? ` — as of ${selectedAsOf}` : ""}`}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            fontSize: 13,
            color: C.mu,
            marginBottom: 8,
          }}
        >
          <span style={{ fontWeight: 600 }}>0</span>
          <span style={{ fontWeight: 700, color: C.am }}>
            Target: {target} machines
          </span>
        </div>
        <div
          style={{
            position: "relative",
            height: 36,
            background: C.cd,
            borderRadius: 18,
            border: "1px solid " + C.bd,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${Math.min(100, pct ?? 0)}%`,
              minWidth: 64,
              height: "100%",
              background: onTarget ? C.gn : C.bl,
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-end",
              paddingRight: 14,
              transition: "width .4s",
            }}
          >
            <span
              style={{
                fontSize: 15,
                fontWeight: 700,
                color: "#fff",
                whiteSpace: "nowrap",
              }}
            >
              {selectedTotal == null
                ? "—"
                : `${fmtNum(selectedTotal)} machines`}
            </span>
          </div>
          <div
            style={{
              position: "absolute",
              left: `${tickPct}%`,
              top: -3,
              bottom: -3,
              width: 2,
              background: C.am,
              transform: "translateX(-1px)",
            }}
          />
        </div>
        <div
          style={{
            textAlign: "center",
            marginTop: 12,
            fontSize: 16,
            fontWeight: 700,
            color: onTarget ? C.gn : C.tx,
          }}
        >
          {pct == null ? "—" : `${Math.round(pct)}% of target`}
          {onTarget && (
            <span
              style={{
                fontSize: 13,
                marginLeft: 6,
                padding: "2px 7px",
                borderRadius: 4,
                background: C.gn + "18",
                color: C.gn,
              }}
            >
              ON TRACK
            </span>
          )}
        </div>
        <div
          style={{
            fontSize: 12,
            color: C.mu,
            fontWeight: 600,
            textTransform: "uppercase",
            marginTop: 14,
            marginBottom: 2,
          }}
        >
          Trajectory
        </div>
        {loading ? (
          <JKLoader message="Loading trajectory" />
        ) : points.length === 0 ? (
          <div style={{ padding: 12, color: C.mu, fontSize: 13 }}>
            No{" "}
            {trend.preset === "today"
              ? "daily"
              : trend.preset === "month"
                ? "monthly"
                : "date range"}{" "}
            rows in this window.
          </div>
        ) : (
          <TrendChart
            labels={points.map(([key]) =>
              history.granularity === "DAY" ? key.slice(5) : key.slice(0, 7),
            )}
            values={points.map(([, value]) => value)}
            unit=""
            target={target}
          />
        )}
      </Block>
    </AnalysisModal>
  );
}

export default ZeroBreakdownTrendModal;
