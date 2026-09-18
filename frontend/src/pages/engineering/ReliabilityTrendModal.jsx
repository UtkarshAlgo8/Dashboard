/* eslint-disable */
/**
 * "KPI TREND ANALYSIS" modal chrome plus the Zero Breakdown Machines trend.
 *
 * The KPI spec's plot table gives this KPI exactly one chart:
 *
 *   Zero Breakdown Machines | line | day | machines >= 30 days |
 *   `ZeroBreakdownMachines_Section`, `granularity = DAY`
 *
 * So that is all this renders — a daily line, nothing computed. The count per
 * day is the SUM of that day's section rows, which rule 3b calls for
 * ("zero-breakdown tiles ... sum their rows for the unfiltered figure"); the
 * KPI is published per (status, section) and counts are additive.
 *
 * DAY grain throughout, to agree with the card: both are "as of" a running
 * date rather than "during a month" (see reliabilityPanels.jsx).
 *
 * MTBF/MTTR moved out to MtbfMttrChartModal.jsx, which the spec defines as
 * one Section/Machine chart shared by both cards.
 */
import { useEffect, useState } from "react";
import { getReliabilityKpiHistory } from "@/api/engineering.js";
import JKLoader from "@/components/JKLoader.jsx";
import { C, TrendChart } from "./reliabilityShared.jsx";

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
 * Zero Breakdown Machines — the spec's one chart for this KPI: a daily line
 * of the clean-run count, read from `ZeroBreakdownMachines_Section` at DAY
 * grain and summed per day across its (status, section) rows.
 *
 * DAY grain throughout, to agree with the card: both are "as of" a running
 * date, not "during a month" (see reliabilityPanels.jsx ZeroBreakdownPanel).
 */
export function ZeroBreakdownTrendBody({ asOf }) {
  const [points, setPoints] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!asOf) return;
    let cancelled = false;
    setLoading(true);
    const from = new Date(asOf + "T00:00:00Z");
    from.setUTCDate(from.getUTCDate() - 29);
    getReliabilityKpiHistory({
      kpiName: "ZeroBreakdownMachines_Section",
      dateFrom: from.toISOString().slice(0, 10),
      dateTo: asOf,
      granularity: "DAY",
    })
      .then((res) => {
        if (cancelled) return;
        // One row per (status, section) per day, so a day's figure is the sum
        // of that day's rows — additive, and what rule 3b calls for.
        const perDay = new Map();
        for (const p of Array.isArray(res?.points) ? res.points : []) {
          if (p.value == null) continue;
          const day = String(p.date).slice(0, 10);
          perDay.set(day, (perDay.get(day) ?? 0) + p.value);
        }
        setPoints([...perDay.entries()].sort((a, b) => a[0].localeCompare(b[0])));
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [asOf]);

  return (
    <Block
      title={`Machines running clean — daily${asOf ? `, to ${asOf}` : ""}`}
      note="Counted from ZeroBreakdownMachines_Section at DAY grain, summed across each day's section rows. A count is additive, so the sum is the published figure — nothing here is a rate."
    >
      {loading ? (
        <JKLoader message="Loading trend" />
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
  );
}
