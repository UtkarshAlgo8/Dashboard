/**
 * The Breakdown/MTBF/MTTR/Zero-Breakdown(/Top-Machine-Breakdowns) KPI card
 * grid shared by the Overview and Reliability tabs (spec 16/17). One-value
 * tile: uppercase label, big value+unit, colored left border, trend-icon
 * button, chevron that expands a drill panel inline below the grid —
 * mirrors the design mockup's `EKpiCard` interaction.
 *
 * Each card's trend icon opens the chart the KPI SPEC gives that KPI:
 *
 *   Breakdown                → Breakdown chart: Pareto (Machine · Failure)
 *                              and the monthly Breakdown % line, toggled
 *   MTBF / MTTR              → that measure's own bar chart, View by
 *                              Section (pooled) or Machine
 *   Zero Breakdown Machines  → daily line of the clean-run count
 *   Top Machine Breakdowns   → Pareto of BreakdownMin_m by machine, top 10
 */
import { useEffect, useState } from "react";
import { getReliabilityLatestDate } from "@/api/engineering.js";
import {
  Card,
  ChevronIcon,
  TrendIcon,
  ReliabilityDrillPanel,
  BREAKDOWN_LEVELS,
  MTBF_LEVELS,
  MTTR_LEVELS,
  C,
  fmtNum,
  fmtMinHrs,
} from "./reliabilityShared.jsx";
import {
  ZeroBreakdownPanel,
  TopMachineBreakdownsPanel,
  useZeroBreakdownTotal,
} from "./reliabilityPanels.jsx";
import BreakdownChartModal from "./BreakdownChartModal.jsx";
import MtbfMttrChartModal from "./MtbfMttrChartModal.jsx";
import ZeroBreakdownTrendModal from "./ZeroBreakdownTrendModal.jsx";

function SummaryCard({
  label,
  value,
  unit,
  accent,
  onTrend,
  expanded,
  onToggle,
}) {
  return (
    <div
      onClick={onToggle}
      style={{
        background: C.cd,
        borderRadius: 10,
        border: "1px solid " + C.bd,
        borderLeft: "4px solid " + accent,
        padding: "14px 16px",
        boxShadow: C.sh,
        display: "flex",
        flexDirection: "column",
        gap: 6,
        cursor: "pointer",
        minHeight: 96,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
        }}
      >
        <div
          style={{
            fontSize: 11.5,
            fontWeight: 700,
            letterSpacing: ".05em",
            textTransform: "uppercase",
            color: C.mu,
          }}
        >
          {label}
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          {onTrend && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onTrend();
              }}
              title="Trend"
              style={{
                border: "1px solid " + C.bd,
                background: C.c2,
                borderRadius: 4,
                width: 22,
                height: 22,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: C.bl,
                cursor: "pointer",
              }}
            >
              <TrendIcon />
            </button>
          )}
          <span style={{ color: C.mu }}>
            <ChevronIcon open={expanded} />
          </span>
        </div>
      </div>
      <div style={{ fontSize: 24, fontWeight: 700, color: C.tx }}>
        {value}
        {unit && (
          <span
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: C.mu,
              marginLeft: 4,
            }}
          >
            {unit}
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * @param {{ values: Record<string, number|null>, period: { kind: string, date: string, granularity: string }, periodLabel: string, includeTopMachines?: boolean }} props
 */
function ReliabilityCardsGrid({
  values,
  period,
  periodLabel,
  includeTopMachines = false,
}) {
  const { date, granularity } = period;
  // Breakdown/MTBF/MTTR/Top-Machine drills and charts read ONE published row
  // per section/machine; those rates cannot be summed across the days of an
  // arbitrary window, so for a custom range they are withheld rather than
  // shown for the window's first day only. Headline values are rebuilt
  // server-side and stay correct.
  const isRange = period.kind === "range";
  const perRowCardIds = new Set(["breakdown", "mtbf", "mttr", "topMachines"]);
  const [expanded, setExpanded] = useState(null);
  // Which card's trend icon is open, by card id — every card's icon opens a
  // different analysis, so one id covers all of them. Chevrons are separate
  // (`expanded`) and still open the inline drill panels.
  const [trendCard, setTrendCard] = useState(null);
  const zeroBreakdown = useZeroBreakdownTotal();
  const [trendAsOf, setTrendAsOf] = useState(null);

  useEffect(() => {
    let cancelled = false;
    getReliabilityLatestDate({
      kpiNames: [
        "Breakdown_Pct_Overall",
        "BreakdownMin_Overall",
        "MTBF_Overall",
        "MTTR_Overall",
      ],
      granularity: "DAY",
    })
      .then((res) => !cancelled && setTrendAsOf(res?.date ?? null))
      .catch(() => !cancelled && setTrendAsOf(null));
    return () => {
      cancelled = true;
    };
  }, []);

  const trendAnchor = trendAsOf ?? date;

  const toggle = (id) => setExpanded((e) => (e === id ? null : id));
  const closeTrend = () => setTrendCard(null);

  const cards = [
    {
      id: "breakdown",
      label: "Breakdown",
      accent: C.rd,
      value: fmtNum(values?.Breakdown_Pct_Overall, 2),
      unit: "%",
      sub: fmtMinHrs(values?.BreakdownMin_Overall),
    },
    {
      id: "mtbf",
      label: "MTBF",
      accent: C.bl,
      value: fmtMinHrs(values?.MTBF_Overall),
      unit: "",
    },
    {
      id: "mttr",
      label: "MTTR",
      accent: C.am,
      value: fmtMinHrs(values?.MTTR_Overall),
      unit: "",
    },
    {
      id: "zeroBreakdown",
      label: "Zero Breakdown Machines",
      accent: C.gn,
      value: zeroBreakdown.total == null ? "—" : fmtNum(zeroBreakdown.total),
      unit: zeroBreakdown.asOf ? `as of ${zeroBreakdown.asOf}` : "",
    },
  ];
  if (includeTopMachines) {
    cards.push({
      id: "topMachines",
      label: "Top Machine Breakdowns",
      accent: C.pp,
      value: "Top 10",
      unit: "",
    });
  }

  return (
    <div>
      <div
        style={{
          display: "grid",
          gap: 12,
          gridTemplateColumns: `repeat(${cards.length >= 5 ? 5 : 4}, minmax(0, 1fr))`,
        }}
      >
        {cards.map((c) => (
          <SummaryCard
            key={c.id}
            label={c.label}
            value={c.value}
            unit={c.unit}
            accent={c.accent}
            expanded={expanded === c.id}
            onToggle={() => toggle(c.id)}
            // Every Reliability card has an analysis behind its icon —
            // except the per-row ones, which a custom range cannot serve.
            onTrend={
              isRange && perRowCardIds.has(c.id)
                ? undefined
                : () => setTrendCard(c.id)
            }
          />
        ))}
      </div>

      {expanded && (
        <div style={{ marginTop: 14 }}>
          <Card title={cards.find((c) => c.id === expanded)?.label}>
            {isRange && perRowCardIds.has(expanded) ? (
              <div style={{ fontSize: 13, color: C.mu, padding: "8px 0" }}>
                Section and machine breakdowns are available for a single day or
                a whole month. Pick Today, This Month, a month, or a one-day /
                full-month range to drill down — the headline value above covers{" "}
                {periodLabel}.
              </div>
            ) : (
              <>
                {expanded === "breakdown" && (
                  <ReliabilityDrillPanel
                    levels={BREAKDOWN_LEVELS}
                    date={date}
                    granularity={granularity}
                    rootLabel="Breakdown"
                  />
                )}
                {expanded === "mtbf" && (
                  <ReliabilityDrillPanel
                    levels={MTBF_LEVELS}
                    date={date}
                    granularity={granularity}
                    rootLabel="MTBF"
                  />
                )}
                {expanded === "mttr" && (
                  <ReliabilityDrillPanel
                    levels={MTTR_LEVELS}
                    date={date}
                    granularity={granularity}
                    rootLabel="MTTR"
                  />
                )}
                {expanded === "zeroBreakdown" && <ZeroBreakdownPanel />}
                {expanded === "topMachines" && (
                  <TopMachineBreakdownsPanel
                    date={date}
                    granularity={granularity}
                    totalMinutes={values?.BreakdownMin_Overall}
                  />
                )}
              </>
            )}
          </Card>
        </div>
      )}

      <BreakdownChartModal
        open={trendCard === "breakdown"}
        onClose={closeTrend}
        date={date}
        granularity={granularity}
        asOf={trendAnchor}
      />

      {/* Spec KPI 7: "Pareto (bar + cum. line) | machine | downtime (min) |
          BreakdownMin_m, current period, sorted desc, top 10" — the same
          chart as Breakdown's, pinned to the Machine lens and capped at 10. */}
      <BreakdownChartModal
        open={trendCard === "topMachines"}
        onClose={closeTrend}
        date={date}
        granularity={granularity}
        asOf={trendAnchor}
        title="Top Machine Breakdowns"
        initialViewBy="machine"
        maxBars={10}
      />

      {/* A panel per measure — MTBF and MTTR each open their own, with the
          spec's View by (Section · Machine) as the only control inside. */}
      <MtbfMttrChartModal
        open={trendCard === "mtbf" || trendCard === "mttr"}
        onClose={closeTrend}
        date={date}
        granularity={granularity}
        asOf={trendAnchor}
        measure={trendCard === "mttr" ? "mttr" : "mtbf"}
      />

      <ZeroBreakdownTrendModal
        open={trendCard === "zeroBreakdown"}
        onClose={closeTrend}
        total={zeroBreakdown.total}
        asOf={zeroBreakdown.asOf ?? trendAnchor}
      />
    </div>
  );
}

export default ReliabilityCardsGrid;
