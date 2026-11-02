/** Value, tier and icon helpers for the Quality KPI card. */
import AssignmentLateOutlinedIcon from "@mui/icons-material/AssignmentLateOutlined";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import FactCheckOutlinedIcon from "@mui/icons-material/FactCheckOutlined";
import ReportProblemOutlinedIcon from "@mui/icons-material/ReportProblemOutlined";
import ScaleOutlinedIcon from "@mui/icons-material/ScaleOutlined";
import { C } from "./theme.js";

export const numericKpiValue = (value) => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const n = parseFloat(String(value ?? "").replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
};

// The Production KpiCard's tier (green / amber / red) for a Quality card.
// An explicit accent wins over the status, as it always has here; anything
// else (counts, missing values) is the neutral card.
export function qualityCardTier(kpi) {
  const color = kpi.accentColor;
  if (color === C.gn || (!color && kpi.status === "Green")) return "green";
  if (color === C.am || (!color && kpi.status === "Yellow")) return "amber";
  if (color === C.rd || (!color && kpi.status === "Red")) return "red";
  return null;
}

export const QUALITY_KPI_ICON = {
  pqr: FactCheckOutlinedIcon,
  audit: FactCheckOutlinedIcon,
  mqv: ReportProblemOutlinedIcon,
  ndev: ReportProblemOutlinedIcon,
  capa: AssignmentLateOutlinedIcon,
  eg: ReportProblemOutlinedIcon,
  sc: DeleteOutlineIcon,
  gtw: ScaleOutlinedIcon,
};
