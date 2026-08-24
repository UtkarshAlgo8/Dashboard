import { Stack } from "@mui/material";
import DrillSkeleton from "@/components/drills/shared/DrillSkeleton.jsx";
import { snapshotLatestPerSeries } from "@/lib/drillDate.js";
import FtdDrillPanel from "@/components/drills/quality/FtdDrillPanel.jsx";
import ScrapDrillPanel from "@/components/drills/quality/ScrapDrillPanel.jsx";
import ScrapRateDrillPanel from "@/components/drills/quality/ScrapRateDrillPanel.jsx";
import NcmDrillPanel from "@/components/drills/quality/NcmDrillPanel.jsx";
import ReworkDrillPanel from "@/components/drills/quality/ReworkDrillPanel.jsx";
import SpecificPowerDrillPanel from "@/components/drills/cost/SpecificPowerDrillPanel.jsx";
import AbsenteeismDrillPanel from "@/components/drills/morale/AbsenteeismDrillPanel.jsx";
import TqmDrillPanel from "@/components/drills/morale/TqmDrillPanel.jsx";
import SuggestionsDrillPanel from "@/components/drills/morale/SuggestionsDrillPanel.jsx";
import TrainingDrillPanel from "@/components/drills/morale/TrainingDrillPanel.jsx";
import ReportableDrillPanel from "@/components/drills/safety/ReportableDrillPanel.jsx";
import FirstAidDrillPanel from "@/components/drills/safety/FirstAidDrillPanel.jsx";
import NearMissDrillPanel from "@/components/drills/safety/NearMissDrillPanel.jsx";
import SafetyAuditDrillPanel from "@/components/drills/safety/SafetyAuditDrillPanel.jsx";

/**
 * Routes "table" drillType to the correct table panel based on kpi.id.
 * Matches artifact buildKpis() table KPI list exactly.
 */
export default function GenericTableDrillPanel({
  kpi,
  drillRows,
  section,
  sectionName,
  mode = "snapshot",
  granularity = "DAY",
  isLoading = false,
  // Passed through to panels that fetch their own DAY rows for a dated view
  // when the card sits on MONTH.
  plantId = "banmore",
  subSection = null,
  productType = null,
  from = null,
  to = null,
}) {
  // While the drill fetch is still in flight and we don't yet have any
  // child rows, render a skeleton. Otherwise the user sees an empty
  // table for the 2–5s of upstream latency.
  if (isLoading && (!drillRows || drillRows.length === 0)) {
    return <DrillSkeleton title rows={5} cols={4} />;
  }
  // Time (journey.md §3): in snapshot mode collapse every series to its
  // latest available date BEFORE the sub-panels aggregate, so a "Today"
  // drill reconciles with the card instead of summing/averaging the
  // trailing window. Done per-series so each entity keeps its own newest
  // row. Aggregate mode (custom range) passes through untouched.
  const windowed = snapshotLatestPerSeries(drillRows ?? [], mode);
  // Per spec §10, drill rows must be filtered to the active section
  // before aggregation. Absenteeism is plant-level (section=NULL/"nan")
  // — it bypasses this filter inside its own panel.
  const sectionFiltered = windowed.filter((r) => r.section === sectionName);
  switch (kpi?.id) {
    // Quality
    case "ftq":
      return (
        <FtdDrillPanel drillRows={sectionFiltered} granularity={granularity} />
      );
    case "ds":
      return (
        <ScrapDrillPanel
          drillRows={sectionFiltered}
          granularity={granularity}
        />
      );
    case "sr":
      return (
        <ScrapRateDrillPanel
          drillRows={sectionFiltered}
          granularity={granularity}
        />
      );
    case "rw":
      return (
        <ReworkDrillPanel
          drillRows={sectionFiltered}
          granularity={granularity}
        />
      );
    case "ncm":
      return (
        <NcmDrillPanel
          drillRows={sectionFiltered}
          granularity={granularity}
          plantId={plantId}
          sectionName={sectionName}
          subSection={subSection}
          productType={productType}
          from={from}
          to={to}
        />
      );
    // Cost
    case "spc":
      return (
        <SpecificPowerDrillPanel
          drillRows={sectionFiltered}
          granularity={granularity}
        />
      );
    // Morale
    case "ab":
      // Plant-level — pass the windowed rows (NOT section-filtered;
      // Absenteeism_section children span every section).
      return (
        <AbsenteeismDrillPanel drillRows={windowed} granularity={granularity} />
      );
    case "tq":
      return (
        <TqmDrillPanel drillRows={sectionFiltered} granularity={granularity} />
      );
    case "sg":
      return (
        <SuggestionsDrillPanel
          drillRows={sectionFiltered}
          granularity={granularity}
        />
      );
    case "tr":
      return (
        <TrainingDrillPanel
          drillRows={sectionFiltered}
          granularity={granularity}
        />
      );
    // Safety
    case "ri":
      return (
        <ReportableDrillPanel
          drillRows={sectionFiltered}
          section={section}
          granularity={granularity}
        />
      );
    case "fa":
      return (
        <FirstAidDrillPanel
          drillRows={sectionFiltered}
          section={section}
          granularity={granularity}
        />
      );
    case "nm":
      return (
        <NearMissDrillPanel
          drillRows={sectionFiltered}
          granularity={granularity}
        />
      );
    case "sa":
      return (
        <SafetyAuditDrillPanel
          drillRows={sectionFiltered}
          section={section}
          granularity={granularity}
        />
      );
    default:
      return (
        <Stack sx={{ py: 3, textAlign: "center", color: "text.disabled" }}>
          No drill panel configured for {kpi?.name}.
        </Stack>
      );
  }
}
