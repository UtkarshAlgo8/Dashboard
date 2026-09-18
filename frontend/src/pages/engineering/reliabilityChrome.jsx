/* eslint-disable */
/**
 * The design mock's UI primitives for the Reliability analysis modals, in
 * one place so the three modals cannot drift apart.
 *
 * Every size, radius and weight here is taken from the mock
 * (docs/plant_operations_dashboard, `BreakdownParetoPanel` / `TrendPanel` /
 * `HBarChart`) — chip padding 4×11 at radius 6, control labels 10.5px
 * uppercase with a 56px gutter, the 6×10 scope banner at radius 7, the
 * 620×36 horizontal bar geometry. The mock owns how this looks; the KPI
 * spec owns what goes in it.
 */
import { useEffect } from "react";
import { C, fmtNum } from "./reliabilityShared.jsx";

/** Modal shell: overlay, eyebrow + title, ✕, Escape and click-out. */
export function AnalysisModal({
  open,
  onClose,
  eyebrow,
  title,
  headerExtra,
  maxWidth = 1000,
  children,
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15,23,42,0.55)",
        zIndex: 1000,
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        padding: "40px 18px",
        overflowY: "auto",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: C.cd,
          borderRadius: 12,
          border: "1px solid " + C.bd,
          boxShadow: "0 20px 60px rgba(0,0,0,.25)",
          width: "100%",
          maxWidth,
        }}
      >
        <div
          style={{
            padding: "14px 18px",
            borderBottom: "1px solid " + C.bd,
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          <div>
            <div
              style={{
                fontSize: 12,
                color: C.mu,
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: ".5px",
              }}
            >
              {eyebrow}
            </div>
            <div style={{ fontSize: 19, fontWeight: 700, color: C.tx, marginTop: 2 }}>{title}</div>
          </div>
          {headerExtra}
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              marginLeft: "auto",
              width: 30,
              height: 30,
              borderRadius: 8,
              border: "1px solid " + C.bd,
              background: C.c2,
              color: C.mu,
              fontSize: 19,
              lineHeight: 1,
              cursor: "pointer",
            }}
          >
            {"✕"}
          </button>
        </div>
        <div style={{ padding: "16px 18px" }}>{children}</div>
      </div>
    </div>
  );
}

/** The mock's toggle chip. */
export function Chip({ on, color = C.bl, disabled, children, onClick }) {
  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      style={{
        padding: "4px 11px",
        borderRadius: 6,
        border: "1px solid " + (on ? color : C.bd),
        background: on ? color + "15" : C.cd,
        color: disabled ? C.mu : on ? color : C.tx,
        fontSize: 11.5,
        fontWeight: on ? 700 : 500,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.6 : 1,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </button>
  );
}

/** The mock's control-row label ("VIEW BY", "MEASURE", "FILTER"). */
export function ControlLabel({ children, gutter = true }) {
  return (
    <span
      style={{
        fontSize: 10.5,
        color: C.mu,
        fontWeight: 700,
        textTransform: "uppercase",
        minWidth: gutter ? 56 : undefined,
      }}
    >
      {children}
    </span>
  );
}

/** A row of controls, spaced as the mock spaces them. */
export function ControlRow({ children, last }) {
  return (
    <div
      style={{
        display: "flex",
        gap: 6,
        flexWrap: "wrap",
        alignItems: "center",
        marginBottom: last ? 9 : 7,
      }}
    >
      {children}
    </div>
  );
}

export const selectStyle = {
  padding: "4px 9px",
  borderRadius: 6,
  border: "1px solid " + C.bd,
  background: C.cd,
  color: C.tx,
  fontSize: 11.5,
  fontWeight: 600,
  cursor: "pointer",
};

/** The mock's scope strip above the chart. */
export function ScopeBanner({ children }) {
  return (
    <div
      style={{
        padding: "6px 10px",
        background: C.c2,
        border: "1px solid " + C.bd,
        borderRadius: 7,
        fontSize: 11.5,
        color: C.md,
        marginBottom: 9,
        lineHeight: 1.6,
      }}
    >
      {children}
    </div>
  );
}

/** The mock's bordered analysis block with an uppercase caption. */
export function Block({ title, note, children }) {
  return (
    <div
      style={{
        background: C.c2,
        borderRadius: 8,
        border: "1px solid " + C.bd,
        padding: "10px 12px 12px",
      }}
    >
      {title && (
        <div
          style={{
            fontSize: 12,
            color: C.mu,
            fontWeight: 600,
            textTransform: "uppercase",
            marginBottom: 6,
          }}
        >
          {title}
        </div>
      )}
      {children}
      {note && (
        <div style={{ fontSize: 11.5, color: C.mu, marginTop: 8, lineHeight: 1.5 }}>{note}</div>
      )}
    </div>
  );
}

/** The mock's small caption under a chart. */
export function ChartCaption({ children }) {
  return (
    <div style={{ fontSize: 11.5, color: C.mu, textAlign: "center", lineHeight: 1.5, marginTop: 6 }}>
      {children}
    </div>
  );
}

/**
 * The mock's `HBarChart`: one horizontal bar per row, label left, value at
 * the bar end, a dashed amber target tick per row and the target named
 * underneath. Bars go green or red against the target — `higherIsBetter`
 * says which way round that is — and stay blue when there is no target.
 *
 * `items`: [{ label, value }]. Values are already in the unit shown.
 */
export function HBarChart({ items, unit, target, higherIsBetter, decimals }) {
  const w = 620;
  const rowH = 36;
  const padL = 160;
  const padR = 70;
  const padT = 8;
  const h = padT + items.length * rowH + (target != null ? 24 : 8);
  const vals = items.map((i) => i.value).concat(target != null ? [target] : []);
  const max = Math.max(...vals, 0) * 1.12 || 1;
  const x = (v) => padL + (v / max) * (w - padL - padR);
  const dp = (v) => (decimals != null ? decimals : Math.abs(v) < 10 ? 2 : 0);

  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: "100%", height: "auto" }}>
      {items.map((it, i) => {
        const y0 = padT + i * rowH;
        const ok = target == null ? null : higherIsBetter ? it.value >= target : it.value <= target;
        const col = ok == null ? C.bl : ok ? C.gn : C.rd;
        return (
          <g key={it.label}>
            <text x={padL - 8} y={y0 + rowH / 2 + 4} fontSize="11.5" fill={C.tx} textAnchor="end">
              {it.label}
            </text>
            <rect
              x={padL}
              y={y0 + 8}
              width={w - padL - padR}
              height={rowH - 18}
              rx="4"
              fill={C.bd}
              opacity="0.35"
            />
            <rect
              x={padL}
              y={y0 + 8}
              width={Math.max(x(it.value) - padL, 2)}
              height={rowH - 18}
              rx="4"
              fill={col}
              opacity="0.85"
            />
            {target != null && (
              <line
                x1={x(target)}
                y1={y0 + 4}
                x2={x(target)}
                y2={y0 + rowH - 6}
                stroke={C.am}
                strokeWidth="2"
                strokeDasharray="3 2"
              />
            )}
            <text x={x(it.value) + 6} y={y0 + rowH / 2 + 4} fontSize="11" fontWeight="700" fill={C.tx}>
              {fmtNum(it.value, dp(it.value))}
            </text>
          </g>
        );
      })}
      {target != null && (
        <text
          x={x(target)}
          y={h - 6}
          fontSize="9.5"
          fill={C.am}
          fontWeight="700"
          textAnchor="middle"
        >
          {`Target ${fmtNum(target)}${unit ? " " + unit : ""}`}
        </text>
      )}
    </svg>
  );
}
