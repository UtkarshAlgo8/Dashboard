import { Stack } from "@mui/material";
import FtdDrillPanel from "@/components/drills/quality/FtdDrillPanel.jsx";
import ScrapDrillPanel from "@/components/drills/quality/ScrapDrillPanel.jsx";
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
}) {
  // Per spec §10, drill rows must be filtered to the active section
  // before aggregation. Absenteeism is plant-level (section=NULL/"nan")
  // — it bypasses this filter inside its own panel.
  const sectionFiltered = (drillRows ?? []).filter(
    (r) => r.section === sectionName,
  );
  switch (kpi?.id) {
    // Quality
    case "ftq":
      return <FtdDrillPanel drillRows={sectionFiltered} />;
    case "ds":
      return <ScrapDrillPanel drillRows={sectionFiltered} />;
    case "rw":
      return <ReworkDrillPanel drillRows={sectionFiltered} />;
    case "ncm":
      return <NcmDrillPanel drillRows={sectionFiltered} />;
    // Cost
    case "spc":
      return <SpecificPowerDrillPanel drillRows={sectionFiltered} />;
    // Morale
    case "ab":
      // Plant-level — pass raw (already filtered to Absenteeism_section
      // children regardless of section by the router).
      return <AbsenteeismDrillPanel drillRows={drillRows} />;
    case "tq":
      return <TqmDrillPanel drillRows={sectionFiltered} />;
    case "sg":
      return <SuggestionsDrillPanel drillRows={sectionFiltered} />;
    case "tr":
      return <TrainingDrillPanel drillRows={sectionFiltered} />;
    // Safety
    case "ri":
      return (
        <ReportableDrillPanel drillRows={sectionFiltered} section={section} />
      );
    case "fa":
      return (
        <FirstAidDrillPanel drillRows={sectionFiltered} section={section} />
      );
    case "nm":
      return <NearMissDrillPanel drillRows={sectionFiltered} />;
    case "sa":
      return (
        <SafetyAuditDrillPanel drillRows={sectionFiltered} section={section} />
      );
    default:
      return (
        <Stack sx={{ py: 3, textAlign: "center", color: "text.disabled" }}>
          No drill panel configured for {kpi?.name}.
        </Stack>
      );
  }
}
