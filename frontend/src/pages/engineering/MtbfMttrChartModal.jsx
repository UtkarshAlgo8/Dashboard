/* eslint-disable */
/**
 * The MTBF / MTTR bar chart, opened from either the MTBF or the MTTR card.
 *
 * MTBF and MTTR get a panel each — the card you click decides the measure and
 * the modal does not switch between them, so the only control here is the
 * spec's other one:
 *
 *   VIEW BY   Section · Machine
 *
 * MACHINE VIEW reads its file directly — `MTBF_m` / `MTTR_m`, "sort by
 * actual_value, plot, no calculation in the UI".
 *
 * SECTION VIEW is POOLED FROM THE MACHINE ROWS' OWN `section` COLUMN, because
 * `MTBF_Section` and `MTTR_Section` do not exist. Verified against the live
 * table on 2026-09-18: gold.gold carries 40 Reliability kpi_names for BTP and
 * the only section-grained one is `ZeroBreakdownMachines_Section`. The spec
 * assumes two files the ETL has never produced.
 *
 * The pooling is the spec's own rule — "sum the raw values first, then
 * divide" — applied to components that ARE published at machine grain:
 *
 *   MTBF(section) = Σ OperatingMin_m  ÷ Σ BreakdownOcc_m
 *   MTTR(section) = Σ BreakdownMin_m  ÷ Σ BreakdownOcc_m
 *
 * The spec ruled this out on the premise that "the raw numerator and
 * denominator are not in the Gold row". That premise is wrong —
 * `OperatingMin_m`, `BreakdownMin_m` and `BreakdownOcc_m` are all published
 * per machine — and the arithmetic reproduces the engine's own published
 * section figures to the decimal (Aug 2026, all five sections, both
 * measures):
 *
 *   Curing        7600.3 / 87.2   spec 7600 / 87.2
 *   Stock         7999.3 / 66.6   spec 7999 / 66.6
 *   Tyre Building 2562.8 / 38.3   spec 2563 / 38.3
 *   Mixing         862.9 / 34.8   spec  863 / 34.8
 *
 * (The check originally covered a sixth section, the ETL's 'Unmapped'
 * placeholder, at 7407.8 / 44.3. It reconciled too, but the bucket is a
 * data-quality artefact rather than a plant section and the drill endpoint
 * now filters it out upstream — see excludeUnmappedPredicate in
 * engineering/normalize.js — so it never reaches this chart.)
 *
 * This is NOT the thing rules 3c and 8 forbid. Those forbid averaging the
 * `_Grade_Section` RATE rows, which is a different sum and a wrong one: it
 * puts Curing at 7,554 (the spec's own counter-example) and Tyre Building at
 * 19,806 against a true 2,563, because a three-machine grade-D row gets the
 * same weight as the thirty machines actually failing. Summing components and
 * dividing once is what the engine does, so it lands where the engine lands.
 *
 * Minutes → hours is the one conversion here (rule 1, "divide by 60 wherever
 * the label says hrs"). Targets come from reliabilityTargets.js; the spec
 * publishes no `threshold_value`.
 *
 * Look follows the mock's `TrendPanel` for an `hbar` KPI — a 740px card
 * centred on screen, "KPI TREND ANALYSIS" over the KPI's name, one bordered
 * block holding the mock's `HBarChart` — with the spec's two control rows
 * above it. The mock owns how this looks; the spec owns what is in it.
 */
import { useEffect, useMemo, useState } from "react";
import { getReliabilityKpiChildren } from "@/api/engineering.js";
import JKLoader from "@/components/JKLoader.jsx";
import { C } from "./reliabilityShared.jsx";
import {
  reliabilityTrendRequest,
  useReliabilityTrendRange,
} from "./reliabilityTrendRange.jsx";
import {
  AnalysisModal,
  Block,
  ChartCaption,
  Chip,
  ControlLabel,
  ControlRow,
  HBarChart,
} from "./reliabilityChrome.jsx";
import { TARGETS } from "./reliabilityTargets.js";

const VIEWS_BY = [
  { id: "section", label: "Section" },
  { id: "machine", label: "Machine" },
];

// Every machine that ran publishes OperatingMin_m; only machines that broke
// publish the other two. A machine with no breakdown contributes operating
// minutes and zero events, which is exactly how the engine pools it.
const POOL_KPIS = ["OperatingMin_m", "BreakdownMin_m", "BreakdownOcc_m"];

const MEASURES = [
  {
    id: "mtbf",
    title: "MTBF (Plant)",
    label: "MTBF",
    machineKpi: "MTBF_m",
    // Σ numerator ÷ Σ denominator, per section.
    numerator: "OperatingMin_m",
    denominator: "BreakdownOcc_m",
    targetHrs: TARGETS.mtbfHrs,
    higherIsBetter: true,
  },
  {
    id: "mttr",
    title: "MTTR (Plant)",
    label: "MTTR",
    machineKpi: "MTTR_m",
    numerator: "BreakdownMin_m",
    denominator: "BreakdownOcc_m",
    targetHrs: TARGETS.mttrHrs,
    higherIsBetter: false,
  },
];

// Spec: "default the Machine view to the top 15-20". No pooled "Other" bar —
// MTBF and MTTR are ratios, and rule 8 forbids summing or averaging them, so
// a tail bar could not be computed honestly. There are five sections, so the
// Section view is never cut.
const MAX_BARS = 15;

/**
 * @param {{ open: boolean, onClose: () => void, date: string, granularity: string,
 *           asOf?: string, measure: "mtbf"|"mttr" }} props - one panel per measure: the MTBF
 *   card opens MTBF, the MTTR card opens MTTR, and neither switches to the
 *   other. Only VIEW BY is a control here.
 */
function MtbfMttrChartModal({
  open,
  onClose,
  date,
  granularity,
  asOf,
  measure: measureId,
}) {
  // Section leads — the spec lists it first, and it is the view that answers
  // "where is the problem".
  const [viewId, setViewId] = useState("section");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const isSection = viewId === "section";
  const view = VIEWS_BY.find((v) => v.id === viewId) ?? VIEWS_BY[1];
  const measure = MEASURES.find((m) => m.id === measureId) ?? MEASURES[0];
  const trend = useReliabilityTrendRange({ open });
  const request = reliabilityTrendRequest({
    preset: trend.preset,
    from: trend.from,
    to: trend.to,
    asOf: asOf ?? date,
  });
  const isAggregate = request.aggregate;

  // Both views group by MACHINE. The Machine view plots the published rate
  // straight; the Section view pools those same rows by the `section` each
  // one carries.
  const kpiNames = isSection || isAggregate ? POOL_KPIS : [measure.machineKpi];
  const kpiKey = kpiNames.join(",");

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    getReliabilityKpiChildren({
      kpiNames,
      date: request.date,
      from: request.from,
      to: request.to,
      granularity: request.granularity,
      groupBy: "machine",
      agg: isAggregate ? "sum" : undefined,
    })
      .then(
        (res) =>
          !cancelled && setRows(Array.isArray(res?.rows) ? res.rows : []),
      )
      .catch((err) => !cancelled && setError(err))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [
    open,
    request.date,
    request.from,
    request.to,
    request.granularity,
    isAggregate,
    kpiKey,
  ]);

  const bars = useMemo(() => {
    if (!isSection && !isAggregate) {
      // Spec: "Sort by actual_value, plot. No calculation in the UI." The
      // only arithmetic is min → hrs, because the target is in hours.
      return rows
        .filter((r) => r[measure.machineKpi] != null)
        .sort((a, b) => b[measure.machineKpi] - a[measure.machineKpi])
        .slice(0, MAX_BARS)
        .map((r) => ({
          label: r.machine ?? "—",
          value: r[measure.machineKpi] / 60,
        }));
    }

    if (!isSection && isAggregate) {
      // An arbitrary window cannot sum published MTBF/MTTR rates. Pool the
      // additive components per machine and divide once, exactly as the
      // backend does for the plant summary.
      const pooled = new Map();
      for (const r of rows) {
        if (!r.machine) continue;
        const bucket = pooled.get(r.machine) ?? {
          numerator: 0,
          denominator: 0,
        };
        bucket.numerator += r[measure.numerator] ?? 0;
        bucket.denominator += r[measure.denominator] ?? 0;
        pooled.set(r.machine, bucket);
      }
      return [...pooled.entries()]
        .filter(([, b]) => b.denominator > 0)
        .map(([label, b]) => ({
          label,
          value: b.numerator / b.denominator / 60,
        }))
        .sort((a, b) => b.value - a.value)
        .slice(0, MAX_BARS);
    }

    // Pool the components per section, then divide ONCE — see the header
    // note. The API no longer returns the 'Unmapped' bucket at all, so the
    // only sectionless row that could still arrive is one the ETL left blank;
    // it gets no bar rather than a bucket of its own, because a bar with no
    // name is not something anyone can act on.
    const pooled = new Map();
    for (const r of rows) {
      const key = r.section;
      if (!key) continue;
      const bucket = pooled.get(key) ?? { numerator: 0, denominator: 0 };
      bucket.numerator += r[measure.numerator] ?? 0;
      bucket.denominator += r[measure.denominator] ?? 0;
      pooled.set(key, bucket);
    }
    return (
      [...pooled.entries()]
        // A section with no breakdown has a zero denominator: its rate is
        // undefined, not zero, so it is left out rather than drawn at the
        // bottom of the chart (the spec's "gaps are not zeros" rule).
        .filter(([, b]) => b.denominator > 0)
        .map(([label, b]) => ({
          label,
          value: b.numerator / b.denominator / 60,
        }))
        .sort((a, b) => b.value - a.value)
    );
  }, [rows, isSection, isAggregate, measure]);

  return (
    <AnalysisModal
      open={open}
      onClose={onClose}
      eyebrow="KPI Trend Analysis"
      title={measure.title}
      headerExtra={trend.control}
      maxWidth={740}
      align="center"
    >
      <ControlRow last>
        <ControlLabel>View by</ControlLabel>
        {VIEWS_BY.map((v) => (
          <Chip
            key={v.id}
            on={viewId === v.id}
            color={C.pp}
            onClick={() => setViewId(v.id)}
          >
            {v.label}
          </Chip>
        ))}
      </ControlRow>

      <Block title={`${measure.label} by ${view.label}`}>
        {error ? (
          <div style={{ padding: 8, color: C.rd, fontSize: 13 }}>
            {measure.label} fetch failed: {error.message || "Request failed"}
          </div>
        ) : loading ? (
          <JKLoader message={`Loading ${measure.label}`} />
        ) : bars.length === 0 ? (
          <div
            style={{ padding: 8, color: C.mu, fontSize: 13, lineHeight: 1.6 }}
          >
            No {measure.label} rows published for this period.
          </div>
        ) : (
          <>
            <HBarChart
              items={bars}
              unit="hrs"
              target={measure.targetHrs}
              higherIsBetter={measure.higherIsBetter}
            />
            {isSection && (
              <ChartCaption>
                Pooled per section from {measure.numerator} ÷{" "}
                {measure.denominator} across that section&apos;s machines —
                summed first, divided once, which reproduces the engine&apos;s
                published section figures exactly.
              </ChartCaption>
            )}
          </>
        )}
      </Block>
    </AnalysisModal>
  );
}

export default MtbfMttrChartModal;
