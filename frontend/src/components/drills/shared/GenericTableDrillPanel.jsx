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
export default function GenericTableDrillPanel({ kpi, drillRows, section }) {
  switch (kpi?.id) {
    // Quality
    case "ftq":
      return <FtdDrillPanel drillRows={drillRows} />;
    case "ds":
      return <ScrapDrillPanel drillRows={drillRows} />;
    case "rw":
      return <ReworkDrillPanel drillRows={drillRows} />;
    case "ncm":
      return <NcmDrillPanel drillRows={drillRows} />;
    // Cost
    case "spc":
      return <SpecificPowerDrillPanel drillRows={drillRows} />;
    // Morale
    case "ab":
      return <AbsenteeismDrillPanel drillRows={drillRows} />;
    case "tq":
      return <TqmDrillPanel drillRows={drillRows} />;
    case "sg":
      return <SuggestionsDrillPanel drillRows={drillRows} />;
    case "tr":
      return <TrainingDrillPanel drillRows={drillRows} />;
    // Safety
    case "ri":
      return <ReportableDrillPanel drillRows={drillRows} section={section} />;
    case "fa":
      return <FirstAidDrillPanel drillRows={drillRows} section={section} />;
    case "nm":
      return <NearMissDrillPanel drillRows={drillRows} />;
    case "sa":
      return <SafetyAuditDrillPanel drillRows={drillRows} section={section} />;
    default:
      return (
        <Stack sx={{ py: 3, textAlign: "center", color: "text.disabled" }}>
          No drill panel configured for {kpi?.name}.
        </Stack>
      );
  }
}
