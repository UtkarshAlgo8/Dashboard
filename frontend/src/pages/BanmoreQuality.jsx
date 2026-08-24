import { useNavigate } from "react-router-dom";
import QualityDashboard from "@/pages/quality/QualityDashboard.jsx";

/**
 * Route wrapper for the Quality Head dashboard (Banmore). Reached from the
 * landing "Quality" function. The self-contained QualityDashboard component
 * (ported from the design jsx) renders the Process / Product / Customer
 * Complaint / SPC tabs; `onBack` returns to the landing plant selector.
 */
const BANMORE_PLANT = {
  id: "banmore",
  name: "Banmore Tyre Plant",
  sub: "Gwalior, Madhya Pradesh",
  oe: 91.5,
  otif: 94.3,
  yield: 97.8,
};

export default function BanmoreQuality() {
  const navigate = useNavigate();
  return (
    <QualityDashboard plant={BANMORE_PLANT} onBack={() => navigate("/")} />
  );
}
