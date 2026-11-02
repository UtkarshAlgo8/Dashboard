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
 *   Machines Affected        → no trend; the chevron opens category → section
 *                              bars (Reliability tab only)
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
  BREAKDOWN_RANGE_LEVELS,
  MTBF_RANGE_LEVELS,
  MTTR_RANGE_LEVELS,
  C,
  fmtNum,
  fmtMinHrs,
} from "./reliabilityShared.jsx";
import {
  AffectedBar,
  MachinesAffectedPanel,
  useMachinesAffectedGrades,
  ZeroBreakdownPanel,
  TopMachineBreakdownsPanel,
  useTopMachineBreakdowns,
  useZeroBreakdownTotal,
} from "./reliabilityPanels.jsx";
import BreakdownChartModal from "./BreakdownChartModal.jsx";
import { machinesAffectedHeadline } from "./machinesAffected.js";
import { machineName } from "./machineName.js";
import MtbfMttrChartModal from "./MtbfMttrChartModal.jsx";
import ZeroBreakdownTrendModal from "./ZeroBreakdownTrendModal.jsx";

const fmtHours = (minutes) =>
  minutes == null ? "—" : `${fmtNum(minutes / 60, 1)} hrs`;

function SummaryCard({
  label,
  value,
  unit,
  accent,
  featured,
  body,
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
      {body ? (
        body
      ) : featured ? (
        <>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
              minWidth: 0,
            }}
          >
            <div
              title={featured.machine ?? undefined}
              style={{
                fontSize: 24,
                fontWeight: 700,
                color: C.tx,
                minWidth: 0,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {featured.machine ?? "—"}
            </div>
            <div
              style={{
                flexShrink: 0,
                textAlign: "right",
                fontSize: 12,
                fontWeight: 600,
                color: C.md,
                lineHeight: 1.4,
              }}
            >
              <div>
                Downtime{" "}
                {featured.machine
                  ? `${fmtNum(featured.BreakdownMin_m)} min`
                  : "—"}
              </div>
              <div>
                Occurrences{" "}
                {featured.machine ? fmtNum(featured.BreakdownOcc_m) : "—"}
              </div>
            </div>
          </div>
          {machineName(featured) && (
            <div
              title={machineName(featured)}
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: C.md,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {machineName(featured)}
            </div>
          )}
          <div style={{ fontSize: 11, fontWeight: 600, color: C.mu }}>
            MTBF {fmtHours(featured.MTBF_m)} · MTTR {fmtHours(featured.MTTR_m)}
          </div>
        </>
      ) : (
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
      )}
    </div>
  );
}

/** Machines Affected card body: "246 / 314", the bar, and the no-breakdown count. */
function MachinesAffectedBody({ headline }) {
  const { affected, total, pct, noBreakdown } = headline;
  return (
    <>
      <div style={{ fontSize: 24, fontWeight: 700, color: C.tx }}>
        {fmtNum(affected)}
        <span
          style={{ fontSize: 13, fontWeight: 600, color: C.mu, marginLeft: 4 }}
        >
          / {fmtNum(total)}
        </span>
        {pct != null && (
          <span
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: C.md,
              marginLeft: 8,
            }}
          >
            {fmtNum(pct, 0)}%
          </span>
        )}
      </div>
      <AffectedBar affected={affected ?? 0} total={total} color={C.rd} />
      <div style={{ fontSize: 11, fontWeight: 600, color: C.mu }}>
        {noBreakdown == null
          ? "—"
          : `${fmtNum(noBreakdown)} machines had no breakdown`}
      </div>
    </>
  );
}

/**
 * @param {{ values: Record<string, number|null>, period: { kind: string, date: string, granularity: string, from?: string, to?: string }, includeTopMachines?: boolean, includeMachinesAffected?: boolean }} props
 */
function ReliabilityCardsGrid({
  values,
  period,
  includeTopMachines = false,
  includeMachinesAffected = false,
}) {
  const { date, granularity } = period;
  // A published period drills through the stored rate rows. A custom window
  // has none, so the Breakdown/MTBF/MTTR drills switch to the *_RANGE_LEVELS,
  // which sum additive machine components over it and rebuild each rate —
  // as the Top Machine card/table already do. The trend icons keep the
  // existing page-level range gate.
  const isRange = period.kind === "range";
  const perRowCardIds = new Set(["breakdown", "mtbf", "mttr"]);
  const drillRange = isRange ? { from: period.from, to: period.to } : null;
  const drillAgg = isRange ? "sum" : undefined;
  const [expanded, setExpanded] = useState(null);
  // Which card's trend icon is open, by card id — every card's icon opens a
  // different analysis, so one id covers all of them. Chevrons are separate
  // (`expanded`) and still open the inline drill panels.
  const [trendCard, setTrendCard] = useState(null);
  const zeroBreakdown = useZeroBreakdownTotal();
  const topMachines = useTopMachineBreakdowns(period, includeTopMachines);
  const machineGrades = useMachinesAffectedGrades(
    period,
    includeMachinesAffected,
  );
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
      featured: topMachines.rows[0] ?? {},
    });
  }
  if (includeMachinesAffected) {
    cards.push({
      id: "machinesAffected",
      label: "Machines Affected",
      accent: C.rd,
      body: (
        <MachinesAffectedBody
          headline={machinesAffectedHeadline(
            machineGrades.rows,
            values?.TotalMachines_Overall,
          )}
        />
      ),
    });
  }

  return (
    <div>
      <div
        style={{
          display: "grid",
          gap: 12,
          // Six cards sit as two rows of three rather than six narrow tiles.
          gridTemplateColumns: `repeat(${cards.length >= 6 ? 3 : cards.length >= 5 ? 5 : 4}, minmax(0, 1fr))`,
        }}
      >
        {cards.map((c) => (
          <SummaryCard
            key={c.id}
            label={c.label}
            value={c.value}
            unit={c.unit}
            accent={c.accent}
            featured={c.featured}
            body={c.body}
            expanded={expanded === c.id}
            onToggle={() => toggle(c.id)}
            // Keep the trend icon gated for custom ranges; the inline Top
            // Machine table and card still cover the selected window.
            onTrend={
              c.id === "machinesAffected" ||
              (isRange && (perRowCardIds.has(c.id) || c.id === "topMachines"))
                ? undefined
                : () => setTrendCard(c.id)
            }
          />
        ))}
      </div>

      {expanded && (
        <div style={{ marginTop: 14 }}>
          <Card title={cards.find((c) => c.id === expanded)?.label}>
            {expanded === "breakdown" && (
              <ReliabilityDrillPanel
                levels={isRange ? BREAKDOWN_RANGE_LEVELS : BREAKDOWN_LEVELS}
                date={date}
                granularity={granularity}
                range={drillRange}
                agg={drillAgg}
                rootLabel="Breakdown"
              />
            )}
            {expanded === "mtbf" && (
              <ReliabilityDrillPanel
                levels={isRange ? MTBF_RANGE_LEVELS : MTBF_LEVELS}
                date={date}
                granularity={granularity}
                range={drillRange}
                agg={drillAgg}
                rootLabel="MTBF"
              />
            )}
            {expanded === "mttr" && (
              <ReliabilityDrillPanel
                levels={isRange ? MTTR_RANGE_LEVELS : MTTR_LEVELS}
                date={date}
                granularity={granularity}
                range={drillRange}
                agg={drillAgg}
                rootLabel="MTTR"
              />
            )}
            {expanded === "zeroBreakdown" && <ZeroBreakdownPanel />}
            {expanded === "topMachines" && (
              <TopMachineBreakdownsPanel
                rows={topMachines.rows}
                loading={topMachines.loading}
                error={topMachines.error}
                totalMinutes={values?.BreakdownMin_Overall}
              />
            )}
            {expanded === "machinesAffected" && (
              <MachinesAffectedPanel
                gradeRows={machineGrades.rows}
                loading={machineGrades.loading}
                error={machineGrades.error}
                unavailable={machineGrades.unavailable}
                period={period}
              />
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
