import CtpQualityDashboard from "@/pages/quality/ctp/CtpQualityDashboard.jsx";

/**
 * Route wrapper for the CTP (Chennai) Quality dashboard. Reached from the
 * landing "Quality" function on the Chennai plant. Only the Process tab is
 * live; Product, Customer Complaint and SPC show as Phase 2.
 */
const CTP_PLANT = {
  id: "chennai",
  name: "Chennai Tyre Plant",
  sub: "Chennai, Tamil Nadu",
};

export default function CtpQuality() {
  return <CtpQualityDashboard plant={CTP_PLANT} />;
}
