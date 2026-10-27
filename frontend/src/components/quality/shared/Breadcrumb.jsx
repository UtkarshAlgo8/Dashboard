import { C } from "./theme.js";

/* ─── BREADCRUMB ─── */
export function Breadcrumb({ path, onNav }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        fontSize: 13,
        color: C.mu,
        marginBottom: 8,
        flexWrap: "wrap",
      }}
    >
      {path.map((p, i) => (
        <span key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span
            onClick={() => onNav && onNav(i)}
            style={{
              cursor: onNav && i < path.length - 1 ? "pointer" : "default",
              color: i === path.length - 1 ? C.tx : C.mu,
              fontWeight: i === path.length - 1 ? 700 : 400,
              textDecoration:
                onNav && i < path.length - 1 ? "underline" : "none",
            }}
          >
            {p}
          </span>
          {i < path.length - 1 && <span style={{ color: C.bd }}>{"›"}</span>}
        </span>
      ))}
    </div>
  );
}
