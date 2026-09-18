/* eslint-disable */
/**
 * "KPI TREND ANALYSIS" modal for the Reliability cards (spec 16/17), shaped
 * after the design reference's `TrendPanel`: overlay, a header carrying the
 * KPI name, ✕ / Escape / click-out, and one bordered analysis block per
 * chart.
 *
 * The reference gives each Reliability KPI its OWN chart behind the trend
 * icon rather than one line chart for all of them:
 *
 *   Breakdown                 → the Pareto (BreakdownParetoModal.jsx)
 *   MTBF                      → `chart: "hbar"`, "MTBF by Section" only
 *   MTTR                      → `chart: "hbar"`, "MTTR by Section" only
 *   Zero Breakdown Machines   → `chart: "progress"`, a counter against a
 *                               denominator plus its trajectory
 *   Top Machine Breakdowns    → `pareto: true`, machine-wise
 *
 * DEVIATION, deliberate: the reference draws an amber target line on the
 * hbar and measures the counter as "% of target". No Reliability KPI
 * publishes a `threshold_value` — every one is empty in gold — so there is
 * no target to draw, and inventing one would put a number on screen that no
 * system owns. The bars carry values only; the counter is measured against
 * the machine fleet, which IS published (one ScheduledMin_m row per
 * machine). Each block says which it is.
 *
 * Section-level MTBF/MTTR are not published (only `MTBF_Grade_Section`, cut
 * by machine category too, and a rate cannot be averaged across those
 * rows). They are rebuilt here from the machine-level additive components
 * with the same formula the backend uses for a period —
 * `MTBF = ΣOperatingMin / ΣBreakdownOcc`, `MTTR = ΣBreakdownMin /
 * ΣBreakdownOcc` (see queries/reliability.queries.js COMPONENT_KPIS).
 */
import { useEffect, useMemo, useState } from "react";
import {
  getReliabilityKpiChildren,
  getReliabilityKpiHistory,
} from "@/api/engineering.js";
import JKLoader from "@/components/JKLoader.jsx";
import { C, TrendChart, fmtNum } from "./reliabilityShared.jsx";

// The additive machine-level parts every rate on this screen is rebuilt
// from. `section` rides along on each row (carried forward by the backend's
// kpi-children transform), which is what makes the by-section roll-up one
// round trip instead of one per section.
const COMPONENT_KPIS = ["OperatingMin_m", "BreakdownMin_m", "BreakdownOcc_m"];

/** Modal chrome. Escape, ✕ and click-out all close, as in the reference. */
export function TrendAnalysisModal({ open, onClose, title, children }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15,23,42,.55)",
        zIndex: 1000,
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        padding: "40px 18px",
        overflowY: "auto",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: C.cd,
          borderRadius: 12,
          border: "1px solid " + C.bd,
          boxShadow: "0 20px 60px rgba(0,0,0,.25)",
          width: "100%",
          maxWidth: 740,
        }}
      >
        <div
          style={{
            padding: "14px 18px",
            borderBottom: "1px solid " + C.bd,
            display: "flex",
            alignItems: "center",
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
            <div style={{ fontSize: 19, fontWeight: 700, color: C.tx, marginTop: 2 }}>{title}</div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              marginLeft: "auto",
              width: 30,
              height: 30,
              borderRadius: 8,
              border: "1px solid " + C.bd,
              background: C.c2,
              color: C.mu,
              fontSize: 19,
              lineHeight: 1,
              cursor: "pointer",
            }}
          >
            {"✕"}
          </button>
        </div>
        <div style={{ padding: "14px 18px", display: "flex", flexDirection: "column", gap: 14 }}>
          {children}
        </div>
      </div>
    </div>
  );
}

/** One bordered analysis block with an uppercase caption, as in the reference. */
function Block({ title, note, children }) {
  return (
    <div
      style={{
        background: C.c2,
        borderRadius: 8,
        border: "1px solid " + C.bd,
        padding: "10px 12px 12px",
      }}
    >
      <div
        style={{
          fontSize: 12,
          color: C.mu,
          fontWeight: 600,
          textTransform: "uppercase",
          marginBottom: 6,
        }}
      >
        {title}
      </div>
      {children}
      {note && (
        <div style={{ fontSize: 11.5, color: C.mu, marginTop: 8, lineHeight: 1.5 }}>{note}</div>
      )}
    </div>
  );
}

/**
 * Horizontal bars, one per category — the reference's `HBarChart` geometry,
 * without its target rule (nothing publishes a target here).
 */
function HBarChart({ items, unit }) {
  const w = 620;
  const rowH = 36;
  const padL = 150;
  const padR = 84;
  const padT = 8;
  const h = padT + items.length * rowH + 8;
  const max = Math.max(...items.map((i) => i.value), 0) * 1.12 || 1;
  const x = (v) => padL + (v / max) * (w - padL - padR);

  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: "100%", height: "auto" }}>
      {items.map((it, i) => {
        const y0 = padT + i * rowH;
        return (
          <g key={it.label}>
            <text x={padL - 8} y={y0 + rowH / 2 + 4} fontSize="11.5" fill={C.tx} textAnchor="end">
              {it.label}
            </text>
            <rect
              x={padL}
              y={y0 + 8}
              width={w - padL - padR}
              height={rowH - 18}
              rx="4"
              fill={C.bd}
              opacity="0.35"
            />
            <rect
              x={padL}
              y={y0 + 8}
              width={Math.max(x(it.value) - padL, 2)}
              height={rowH - 18}
              rx="4"
              fill={C.bl}
              opacity="0.85"
            />
            <text x={x(it.value) + 6} y={y0 + rowH / 2 + 4} fontSize="11" fontWeight="700" fill={C.tx}>
              {/* Two decimals under 10: MTTR sections sit at 0.58 and 0.64
                  hrs, and rounding both to "0.6" beside visibly different
                  bars reads as a drawing error. */}
              {fmtNum(it.value, it.value < 10 ? 2 : 1)}
              {unit ? ` ${unit}` : ""}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/**
 * The machine-level components of the selected period, rolled up per
 * section. Shared by the MTBF and MTTR modals — one fetch answers both.
 */
function useSectionRates({ date, granularity }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getReliabilityKpiChildren({
      kpiNames: COMPONENT_KPIS,
      date,
      granularity,
      groupBy: "machine",
    })
      .then((res) => !cancelled && setRows(Array.isArray(res?.rows) ? res.rows : []))
      .catch((err) => !cancelled && setError(err))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [date, granularity]);

  const sections = useMemo(() => {
    const acc = new Map();
    for (const r of rows) {
      const key = r.section ?? "Unmapped";
      if (!acc.has(key)) acc.set(key, { section: key, operating: 0, downtime: 0, occurrences: 0 });
      const bucket = acc.get(key);
      bucket.operating += r.OperatingMin_m ?? 0;
      bucket.downtime += r.BreakdownMin_m ?? 0;
      bucket.occurrences += r.BreakdownOcc_m ?? 0;
    }
    return [...acc.values()].map((b) => ({
      ...b,
      // No failures in a section means MTBF/MTTR are undefined there, not 0
      // — the same rule the backend applies to a period.
      mtbf: b.occurrences ? b.operating / b.occurrences : null,
      mttr: b.occurrences ? b.downtime / b.occurrences : null,
    }));
  }, [rows]);

  return { sections, loading, error };
}

/**
 * Shared body for the two rate cards: bars per section, nothing else. The
 * reference's `hbar` KPIs show that one block — no time-range row and no
 * line chart (`catType` in its `TrendPanel`), so neither is added here.
 */
function SectionRateBody({ items, loading, error, unit, blockTitle, note }) {
  return (
    <Block title={blockTitle} note={note}>
      {error ? (
        <div style={{ padding: 12, color: C.rd, fontSize: 13 }}>
          Section roll-up failed: {error.message || "Request failed"}
        </div>
      ) : loading ? (
        <JKLoader message="Loading sections" />
      ) : items.length === 0 ? (
        <div style={{ padding: 12, color: C.mu, fontSize: 13 }}>
          No machine components published for this period.
        </div>
      ) : (
        <HBarChart items={items} unit={unit} />
      )}
    </Block>
  );
}

/** MTBF: hours between failures per section, longest first. Higher is better. */
export function MtbfTrendBody({ date, granularity }) {
  const { sections, loading, error } = useSectionRates({ date, granularity });
  const items = useMemo(
    () =>
      sections
        .filter((s) => s.mtbf != null)
        .sort((a, b) => b.mtbf - a.mtbf)
        .map((s) => ({ label: s.section, value: s.mtbf / 60 })),
    [sections],
  );
  return (
    <SectionRateBody
      items={items}
      loading={loading}
      error={error}
      unit="hrs"
      blockTitle="MTBF by Section (hrs) — higher is better"
      note="Rebuilt per section from published machine rows: Σ operating minutes ÷ Σ breakdown occurrences. No target is published for MTBF, so no target line is drawn."
    />
  );
}

/** MTTR: hours to repair per section, longest first. Lower is better. */
export function MttrTrendBody({ date, granularity }) {
  const { sections, loading, error } = useSectionRates({ date, granularity });
  const items = useMemo(
    () =>
      sections
        .filter((s) => s.mttr != null)
        .sort((a, b) => b.mttr - a.mttr)
        .map((s) => ({ label: s.section, value: s.mttr / 60 })),
    [sections],
  );
  return (
    <SectionRateBody
      items={items}
      loading={loading}
      error={error}
      unit="hrs"
      blockTitle="MTTR by Section (hrs) — lower is better"
      note="Rebuilt per section from published machine rows: Σ breakdown minutes ÷ Σ breakdown occurrences. No target is published for MTTR, so no target line is drawn."
    />
  );
}

/**
 * Zero Breakdown Machines — the reference's "progress" treatment, measured
 * against the machine fleet rather than a target (none is published): how
 * many of the plant's machines ran clean, and the daily trajectory behind
 * that count.
 *
 * DAY grain throughout, to agree with the card: both are "as of" a running
 * date, not "during a month" (see reliabilityPanels.jsx ZeroBreakdownPanel).
 */
export function ZeroBreakdownTrendBody({ total, asOf, date, granularity }) {
  const [points, setPoints] = useState([]);
  const [fleet, setFleet] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!asOf) return;
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
      // The fleet: one ScheduledMin_m row per machine that was scheduled to
      // run in the selected period. That is the denominator the count is a
      // share of — published, not assumed.
      getReliabilityKpiChildren({
        kpiNames: ["ScheduledMin_m"],
        date,
        granularity,
        groupBy: "machine",
      }),
    ])
      .then(([hist, machines]) => {
        if (cancelled) return;
        // One row per section per day, so a day's figure is the sum of its
        // sections — additive, unlike every rate on this screen.
        const perDay = new Map();
        for (const p of Array.isArray(hist?.points) ? hist.points : []) {
          if (p.value == null) continue;
          const day = String(p.date).slice(0, 10);
          perDay.set(day, (perDay.get(day) ?? 0) + p.value);
        }
        setPoints([...perDay.entries()].sort((a, b) => a[0].localeCompare(b[0])));
        setFleet(Array.isArray(machines?.rows) ? machines.rows.length : null);
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [asOf, date, granularity]);

  const share = total != null && fleet ? (total / fleet) * 100 : null;

  return (
    <>
      <Block
        title={`Machines running clean${asOf ? ` — as of ${asOf}` : ""}`}
        note="Share of the machines scheduled to run in this period. No target is published for this KPI, so the bar is measured against the fleet, not against a goal."
      >
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
        <div style={{ textAlign: "center", marginTop: 12, fontSize: 16, fontWeight: 700, color: C.tx }}>
          {share == null ? "—" : `${fmtNum(share, 1)}% of the fleet`}
          <span style={{ fontSize: 13, fontWeight: 600, color: C.mu, marginLeft: 8 }}>
            {fleet == null ? "" : `${fmtNum(total ?? 0)} of ${fmtNum(fleet)} machines`}
          </span>
        </div>
      </Block>

      <Block title="Trajectory — last 30 days">
        {loading ? (
          <JKLoader message="Loading trajectory" />
        ) : points.length === 0 ? (
          <div style={{ padding: 12, color: C.mu, fontSize: 13 }}>No daily rows in this window.</div>
        ) : (
          <TrendChart
            labels={points.map(([day]) => day.slice(5))}
            values={points.map(([, value]) => value)}
            unit=""
          />
        )}
      </Block>
    </>
  );
}
