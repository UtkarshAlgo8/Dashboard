/* eslint-disable */
/**
 * Zero Breakdown Machines behind its trend icon.
 *
 * Look and interaction follow the mock's `chart: "progress"` treatment for
 * this KPI — a rounded count bar with the figure inside it, the share
 * underneath, then a "TRAJECTORY" line (reliabilityChrome.jsx carries the
 * shell and blocks).
 *
 * Data follows the KPI spec:
 *   - the count and the trajectory are `ZeroBreakdownMachines_Section` at
 *     DAY grain, summed across each day's (status, section) rows — rule 3b,
 *     "sum their rows for the unfiltered figure"; a count is additive.
 *   - the spec's card reads "17 / 221 machines", so the bar is measured
 *     against the machine fleet — one published `ScheduledMin_m` row per
 *     machine scheduled in the period. There is no target for this KPI in
 *     the spec, so none is drawn.
 *   - DAY grain throughout, to agree with the card: both are "as of" a
 *     running date, not "during a month" (see reliabilityPanels.jsx).
 */
import { useEffect, useState } from "react";
import {
  getReliabilityKpiChildren,
  getReliabilityKpiHistory,
} from "@/api/engineering.js";
import JKLoader from "@/components/JKLoader.jsx";
import { C, TrendChart, fmtNum } from "./reliabilityShared.jsx";
import { AnalysisModal, Block } from "./reliabilityChrome.jsx";

/**
 * @param {{ open: boolean, onClose: () => void, total: number|null, asOf: string|null,
 *           date: string, granularity: string }} props
 */
function ZeroBreakdownTrendModal({ open, onClose, total, asOf, date, granularity }) {
  const [points, setPoints] = useState([]);
  const [fleet, setFleet] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!open || !asOf) return;
    let cancelled = false;
    setLoading(true);
    const from = new Date(asOf + "T00:00:00Z");
    from.setUTCDate(from.getUTCDate() - 29);
    Promise.all([
      getReliabilityKpiHistory({
        kpiName: "ZeroBreakdownMachines_Section",
        dateFrom: from.toISOString().slice(0, 10),
        dateTo: asOf,
        granularity: "DAY",
      }),
      getReliabilityKpiChildren({
        kpiNames: ["ScheduledMin_m"],
        date,
        granularity,
        groupBy: "machine",
      }),
    ])
      .then(([hist, fleetRes]) => {
        if (cancelled) return;
        const perDay = new Map();
        for (const p of Array.isArray(hist?.points) ? hist.points : []) {
          if (p.value == null) continue;
          const day = String(p.date).slice(0, 10);
          perDay.set(day, (perDay.get(day) ?? 0) + p.value);
        }
        setPoints([...perDay.entries()].sort((a, b) => a[0].localeCompare(b[0])));
        setFleet(Array.isArray(fleetRes?.rows) ? fleetRes.rows.length : null);
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [open, asOf, date, granularity]);

  const share = total != null && fleet ? (total / fleet) * 100 : null;

  return (
    <AnalysisModal
      open={open}
      onClose={onClose}
      eyebrow="KPI Trend Analysis"
      title="Zero Breakdown Machines"
      maxWidth={740}
    >
      <Block
        title={`Machines running clean${asOf ? ` — as of ${asOf}` : ""}`}
        note="Counted from ZeroBreakdownMachines_Section at DAY grain, summed across that day's section rows, against the machines scheduled to run in this period. No target is published for this KPI, so the bar carries no goal line."
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
          <span style={{ fontWeight: 600 }}>
            {fleet == null ? "—" : `${fmtNum(fleet)} machines scheduled`}
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
              width: `${Math.min(100, Math.max(share ?? 0, 0))}%`,
              minWidth: 64,
              height: "100%",
              background: C.gn,
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-end",
              paddingRight: 14,
              transition: "width .4s",
            }}
          >
            <span style={{ fontSize: 15, fontWeight: 700, color: "#fff", whiteSpace: "nowrap" }}>
              {total == null ? "—" : fmtNum(total)}
            </span>
          </div>
        </div>
        <div
          style={{ textAlign: "center", marginTop: 12, fontSize: 16, fontWeight: 700, color: C.tx }}
        >
          {share == null ? "—" : `${fmtNum(share, 1)}% of the fleet`}
          <span style={{ fontSize: 13, fontWeight: 600, color: C.mu, marginLeft: 8 }}>
            {fleet == null ? "" : `${fmtNum(total ?? 0)} of ${fmtNum(fleet)} machines`}
          </span>
        </div>
      </Block>

      <div style={{ marginTop: 14 }}>
        <Block title="Trajectory — last 30 days">
          {loading ? (
            <JKLoader message="Loading trajectory" />
          ) : points.length === 0 ? (
            <div style={{ padding: 12, color: C.mu, fontSize: 13 }}>
              No daily rows in this window.
            </div>
          ) : (
            <TrendChart
              labels={points.map(([day]) => day.slice(5))}
              values={points.map(([, value]) => value)}
              unit=""
            />
          )}
        </Block>
      </div>
    </AnalysisModal>
  );
}

export default ZeroBreakdownTrendModal;
