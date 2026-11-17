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
import { Box, Typography } from "@mui/material";
import BuildCircleOutlinedIcon from "@mui/icons-material/BuildCircleOutlined";
import HandymanOutlinedIcon from "@mui/icons-material/HandymanOutlined";
import PrecisionManufacturingOutlinedIcon from "@mui/icons-material/PrecisionManufacturingOutlined";
import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined";
import TaskAltOutlinedIcon from "@mui/icons-material/TaskAltOutlined";
import TimerOutlinedIcon from "@mui/icons-material/TimerOutlined";
import { QKpiCard } from "@/components/quality/shared/QualityKpiCard.jsx";
import { engineeringKpiStatus } from "./engineeringKpiStatus.js";
import { TARGETS } from "./reliabilityTargets.js";
import {
  Card,
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
  formatDayLabel,
  formatMonthLabel,
} from "./reliabilityShared.jsx";
import {
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

const KPI_ICONS = {
  breakdown: BuildCircleOutlinedIcon,
  mtbf: TimerOutlinedIcon,
  mttr: HandymanOutlinedIcon,
  zeroBreakdown: TaskAltOutlinedIcon,
  topMachines: SettingsOutlinedIcon,
  machinesAffected: PrecisionManufacturingOutlinedIcon,
};

const fmtHours = (minutes) =>
  minutes == null ? "—" : `${fmtNum(minutes / 60, 1)} hrs`;

function SummaryMetric({ value, unit, featured, body }) {
  return (
    <div>
      {body ? (
        body
      ) : featured ? (
        <>
          <Typography
            title={featured.machine ?? undefined}
            sx={{
              fontSize: { xs: 24, md: 26, lg: 28 },
              fontWeight: 800,
              lineHeight: 1.1,
              color: "text.primary",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {featured.machine ?? "—"}
          </Typography>
          <Typography
            sx={{
              mt: 0.25,
              fontSize: 11.5,
              fontWeight: 500,
              color: "text.secondary",
            }}
          >
            Downtime{" "}
            {featured.machine ? `${fmtNum(featured.BreakdownMin_m)} min` : "—"}{" "}
            · Occurrences{" "}
            {featured.machine ? fmtNum(featured.BreakdownOcc_m) : "—"}
          </Typography>
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

/** Machines Affected card body: "246 / 314" and the no-breakdown count. */
function MachinesAffectedBody({ headline }) {
  const { affected, total, pct, noBreakdown } = headline;
  return (
    <>
      <Typography
        component="div"
        sx={{
          fontSize: { xs: 24, md: 26, lg: 28 },
          lineHeight: 1.1,
          fontWeight: 800,
          color: "text.primary",
        }}
      >
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
      </Typography>
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
  summaryError = null,
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
  const periodLabel =
    period.kind === "range"
      ? `${formatDayLabel(period.from)} – ${formatDayLabel(period.to)}`
      : period.granularity === "MONTH"
        ? formatMonthLabel(date)
        : formatDayLabel(date);

  const toggle = (id) => setExpanded((e) => (e === id ? null : id));
  const closeTrend = () => setTrendCard(null);

  const affectedHeadline = machinesAffectedHeadline(
    machineGrades.rows,
    values?.TotalMachines_Overall,
  );
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
      body: <MachinesAffectedBody headline={affectedHeadline} />,
    });
  }

  return (
    <div>
      <Box
        sx={{
          display: "grid",
          gap: 2,
          gridTemplateColumns: {
            xs: "1fr",
            sm: "repeat(2, minmax(0, 1fr))",
            lg: `repeat(${cards.length >= 6 ? 3 : 4}, minmax(0, 1fr))`,
          },
        }}
      >
        {cards.map((c) => {
          const cardLoading =
            (c.id === "zeroBreakdown" && zeroBreakdown.loading) ||
            (c.id === "topMachines" && topMachines.loading) ||
            (c.id === "machinesAffected" && machineGrades.loading);
          const cardError =
            c.id === "zeroBreakdown"
              ? zeroBreakdown.error
              : c.id === "topMachines"
                ? topMachines.error
                : c.id === "machinesAffected"
                  ? machineGrades.error
                  : summaryError;
          const metricAvailable =
            Boolean(c.featured?.machine) ||
            (c.id === "machinesAffected" && affectedHeadline.affected != null);
          const emptyReason = cardError
            ? `Data unavailable: ${cardError.message ?? "Request failed"}`
            : c.id === "machinesAffected" && machineGrades.unavailable
              ? "Select a single day or month"
              : c.id === "topMachines"
                ? "No breakdowns recorded for this period"
                : "No published data for this period";
          const rawValue =
            c.id === "breakdown"
              ? values?.Breakdown_Pct_Overall
              : c.id === "mtbf"
                ? values?.MTBF_Overall
                : c.id === "mttr"
                  ? values?.MTTR_Overall
                  : c.id === "zeroBreakdown"
                    ? zeroBreakdown.total
                    : null;
          const { status, info, target } = engineeringKpiStatus(c.id, rawValue);
          const numericValue = rawValue == null ? null : Number(rawValue);
          const validValue =
            numericValue != null && Number.isFinite(numericValue);
          const progressValue =
            c.id === "machinesAffected"
              ? affectedHeadline.pct
              : validValue && c.id === "breakdown"
                ? (numericValue / TARGETS.breakdownPct) * 100
                : validValue && c.id === "mttr"
                  ? (numericValue / (TARGETS.mttrHrs * 60)) * 100
                  : validValue && c.id === "mtbf"
                    ? (numericValue / (TARGETS.mtbfHrs * 60)) * 100
                    : validValue && c.id === "zeroBreakdown"
                      ? (numericValue / TARGETS.zeroBreakdownMachines) * 100
                      : null;
          const progressLabel = cardLoading
            ? "Loading KPI data."
            : c.id === "machinesAffected" && progressValue != null
              ? "Affected machines as a percentage of all machines."
              : (c.id === "mtbf" || c.id === "zeroBreakdown") &&
                  progressValue != null
                ? "Progress toward the provisional target; the target requires plant review."
                : (c.id === "breakdown" || c.id === "mttr") &&
                    progressValue != null
                  ? "Share of the specified threshold; 100% means the threshold is reached, not a success score."
                  : c.id === "breakdown" ||
                      c.id === "mttr" ||
                      c.id === "mtbf" ||
                      c.id === "zeroBreakdown" ||
                      c.id === "machinesAffected"
                    ? "Value unavailable."
                    : "No target is used for this bar; the unfilled track is not a performance measure.";
          const canTrend =
            c.id !== "machinesAffected" &&
            !(isRange && (perRowCardIds.has(c.id) || c.id === "topMachines"));
          const isDuration = c.id === "mtbf" || c.id === "mttr";
          const cardPeriod =
            c.id === "zeroBreakdown"
              ? zeroBreakdown.asOf
                ? `As of ${formatDayLabel(zeroBreakdown.asOf)}`
                : null
              : periodLabel;
          return (
            <QKpiCard
              key={c.id}
              kpi={{
                id: c.id,
                n: c.label,
                v: rawValue,
                u: isDuration
                  ? "min"
                  : c.id === "zeroBreakdown"
                    ? "machines"
                    : c.unit,
                valueDisplay:
                  c.id === "breakdown" && rawValue != null
                    ? `${c.value}%`
                    : isDuration && rawValue != null
                      ? fmtNum(rawValue)
                      : undefined,
                metricLabel:
                  isDuration && rawValue != null
                    ? `${fmtNum(rawValue / 60, 1)} hrs`
                    : undefined,
                periodLabel: cardPeriod,
                metricAvailable: !cardLoading && !cardError && metricAvailable,
                isLoading: cardLoading,
                loadingPresentation: "skeleton",
                cardMinHeight: 160,
                status,
                target,
                footerLabel: target ? undefined : "No status target",
                cardTintPalette: "engineering",
                drill: c.id,
                trendApi: canTrend,
                showProgress: true,
                keepProgressWhenOpen: true,
                alignProgress: true,
                progressValue,
                progressLabel,
                alignMetrics: true,
                ragInfo: info,
                emptyReason,
              }}
              metricContent={
                !cardLoading &&
                !cardError &&
                metricAvailable &&
                (c.featured || c.body) ? (
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <SummaryMetric featured={c.featured} body={c.body} />
                    {cardPeriod && (
                      <Typography
                        title={cardPeriod}
                        sx={{
                          mt: 0.25,
                          fontSize: 11,
                          fontWeight: 500,
                          color: "text.secondary",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {cardPeriod}
                      </Typography>
                    )}
                  </Box>
                ) : undefined
              }
              iconComponent={KPI_ICONS[c.id]}
              isOpen={expanded === c.id}
              onToggle={() => toggle(c.id)}
              onTrend={canTrend ? () => setTrendCard(c.id) : undefined}
            />
          );
        })}
      </Box>

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
