import { C } from "./theme.js";

/* ─── STATUS PILL ─── */
export function StatusPill({ status }) {
  const map = {
    Green: { bg: C.gn + "18", fg: C.gn, t: "Green" },
    Yellow: { bg: C.am + "18", fg: C.am, t: "Yellow" },
    Red: { bg: C.rd + "18", fg: C.rd, t: "Red" },
    Grey: { bg: "#9CA3AF18", fg: "#6B7280", t: "Manual" },
    Open: { bg: C.am + "18", fg: C.am, t: "Open" },
    Closed: { bg: C.gn + "18", fg: C.gn, t: "Closed" },
    Overdue: { bg: C.rd + "18", fg: C.rd, t: "Overdue" },
    Pending: { bg: C.am + "18", fg: C.am, t: "Pending" },
    Released: { bg: C.gn + "18", fg: C.gn, t: "Released" },
    Hold: { bg: C.rd + "18", fg: C.rd, t: "Hold" },
    Accepted: { bg: C.gn + "18", fg: C.gn, t: "Accepted" },
    Rejected: { bg: C.rd + "18", fg: C.rd, t: "Rejected" },
    Manual: { bg: "#9CA3AF18", fg: "#6B7280", t: "Manual" },
    Insufficient: { bg: "#9CA3AF18", fg: "#6B7280", t: "Insufficient" },
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
