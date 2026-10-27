/** Sortable drill table used by the Quality drill panels. */
import { useEffect, useState } from "react";
import { C } from "./theme.js";

export function DTable({ cols, rows, onRowClick, isRowClickable }) {
  const [sc, setSc] = useState(null),
    [sd, setSd] = useState("desc");
  const ck = cols.join("|");
  // Reset the sort when the column set changes (a different drill table).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSc(null);
    setSd("desc");
  }, [ck]);
  const num = (cell) => {
    let s = cell;
    if (s && typeof s === "object" && s.props) return null;
    s = String(s == null ? "" : s);
    const n = parseFloat(s.replace(/[^0-9.-]/g, ""));
    return /[0-9]/.test(s) && !isNaN(n) ? n : null;
  };
  const txt = (cell) => {
    let s = cell;
    if (s && typeof s === "object" && s.props) s = "";
    return String(s == null ? "" : s).toLowerCase();
  };
  let disp = rows;
  if (sc != null) {
    disp = [...rows].sort((a, b) => {
      const na = num(a[sc]),
        nb = num(b[sc]);
      let c2;
      if (na != null && nb != null) c2 = na - nb;
      else {
        const ta = txt(a[sc]),
          tb = txt(b[sc]);
        c2 = ta < tb ? -1 : ta > tb ? 1 : 0;
      }
      return sd === "asc" ? c2 : -c2;
    });
  }
  const onH = (i) => {
    if (sc === i) setSd((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSc(i);
      setSd("desc");
    }
  };
  return (
    <div
      style={{
        overflowX: "auto",
        border: "1px solid " + C.bd,
        borderRadius: 10,
        maxHeight: 320,
      }}
    >
      <table
        style={{
          width: "100%",
          borderCollapse: "separate",
          borderSpacing: 0,
          fontSize: 13,
        }}
      >
        <thead>
          <tr>
            {cols.map((c, i) => {
              const a = sc === i;
              return (
                <th
                  key={i}
                  onClick={() => onH(i)}
                  title="Click to sort"
                  style={{
                    textAlign: "center",
                    padding: "8px 10px",
                    background: C.thBg,
                    color: a ? C.bl : C.tx,
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: ".6px",
                    borderBottom: "2px solid " + C.bd,
                    borderRight:
                      i === cols.length - 1 ? "none" : "1px solid " + C.bd,
                    fontSize: 11,
                    cursor: "pointer",
                    userSelect: "none",
                    whiteSpace: "nowrap",
                  }}
                >
                  {c}
                  <span
                    style={{ marginLeft: 4, fontSize: 9, opacity: a ? 1 : 0.3 }}
                  >
                    {a ? (sd === "asc" ? "▲" : "▼") : "⇅"}
                  </span>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {disp.map((row, ri) => {
            const clickable =
              typeof onRowClick === "function" &&
              (typeof isRowClickable !== "function" || isRowClickable(row));
            return (
              <tr
                key={ri}
                onClick={clickable ? () => onRowClick(row) : undefined}
                style={{
                  background: ri % 2 === 0 ? C.cd : C.rowAlt,
                  transition: "background .15s ease",
                  cursor: clickable ? "pointer" : "default",
                }}
                onMouseEnter={(event) => {
                  if (clickable) event.currentTarget.style.background = C.aL;
                }}
                onMouseLeave={(event) => {
                  if (clickable)
                    event.currentTarget.style.background =
                      ri % 2 === 0 ? C.cd : C.rowAlt;
                }}
              >
                {row.map((cell, ci) => {
                  const isS =
                    typeof cell === "string" &&
                    [
                      "OK",
                      "High",
                      "Low",
                      "Alert",
                      "Below",
                      "Monitor",
                      "Escalate",
                      "Open",
                      "Closed",
                      "Scrapped",
                      "Electrical",
                      "Mechanical",
                      "Instrumentation",
                    ].includes(cell);
                  const stC = isS
                    ? ["OK", "Closed"].includes(cell)
                      ? C.gn
                      : [
                            "High",
                            "Low",
                            "Scrapped",
                            "Escalate",
                            "Below",
                            "Open",
                          ].includes(cell)
                        ? C.rd
                        : [
                              "Electrical",
                              "Mechanical",
                              "Instrumentation",
                            ].includes(cell)
                          ? C.bl
                          : C.am
                    : null;
                  return (
                    <td
                      key={ci}
                      style={{
                        padding: "8px 10px",
                        borderBottom: "1px solid " + C.bd,
                        borderRight:
                          ci === row.length - 1 ? "none" : "1px solid " + C.bd,
                        textAlign: "center",
                        color: stC || C.tx,
                        fontWeight: ci === 0 || stC ? 600 : 400,
                      }}
                    >
                      {isS ? (
                        <span
                          style={{
                            padding: "2px 6px",
                            borderRadius: 999,
                            fontSize: 12,
                            fontWeight: 700,
                            background: (stC || C.am) + "18",
                            color: stC || C.am,
                          }}
                        >
                          {cell}
                        </span>
                      ) : (
                        cell
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
