import { alpha } from "@mui/material/styles";
import theme from "@/theme.js";
import { C } from "./theme.js";

const manualColors = {
  bg: alpha(theme.palette.text.disabled, 0.094),
  fg: theme.palette.text.secondary,
};

/* ─── STATUS PILL ─── */
export function StatusPill({ status }) {
  const map = {
    Green: { bg: C.gn + "18", fg: C.gn, t: "Green" },
    Yellow: { bg: C.am + "18", fg: C.am, t: "Yellow" },
    Red: { bg: C.rd + "18", fg: C.rd, t: "Red" },
    Grey: { ...manualColors, t: "Manual" },
    Open: { bg: C.am + "18", fg: C.am, t: "Open" },
    Closed: { bg: C.gn + "18", fg: C.gn, t: "Closed" },
    Overdue: { bg: C.rd + "18", fg: C.rd, t: "Overdue" },
    Pending: { bg: C.am + "18", fg: C.am, t: "Pending" },
    Released: { bg: C.gn + "18", fg: C.gn, t: "Released" },
    Hold: { bg: C.rd + "18", fg: C.rd, t: "Hold" },
    Accepted: { bg: C.gn + "18", fg: C.gn, t: "Accepted" },
    Rejected: { bg: C.rd + "18", fg: C.rd, t: "Rejected" },
    Manual: { ...manualColors, t: "Manual" },
    Insufficient: { ...manualColors, t: "Insufficient" },
    Marginal: { bg: C.ac + "18", fg: C.ac, t: "Marginal" },
  };
  const s = map[status] || { bg: C.bd, fg: C.mu, t: status };
  return (
    <span
      style={{
        padding: "2px 8px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 700,
        background: s.bg,
        color: s.fg,
        whiteSpace: "nowrap",
      }}
    >
      {s.t}
    </span>
  );
}
