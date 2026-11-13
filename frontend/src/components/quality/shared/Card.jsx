/** Quality panel card with a CSV / PNG export button. */
import { useEffect, useRef, useState } from "react";
import { C } from "./theme.js";
import { _dl, _safeName, _svgToPNG, _tableToCSV } from "./exportUtils.js";

export function Card({ title, children, accent, style: s, hideExport }) {
  const ref = useRef(null);
  const [menu, setMenu] = useState(false);
  const [caps, setCaps] = useState({ tbl: false, svg: false });
  useEffect(() => {
    if (ref.current) {
      setCaps({
        tbl: !!ref.current.querySelector("table"),
        svg: !!ref.current.querySelector("svg"),
      });
    }
  }, [children]);
  const fname = _safeName(title);
  const onCSV = (e) => {
    e && e.stopPropagation();
    const t = ref.current && ref.current.querySelector("table");
    if (t)
      _dl(
        new Blob([_tableToCSV(t)], { type: "text/csv;charset=utf-8" }),
        fname + ".csv",
      );
    setMenu(false);
  };
  const onPNG = (e) => {
    e && e.stopPropagation();
    const sv = ref.current && ref.current.querySelector("svg");
    if (sv)
      _svgToPNG(sv, 2, (b) => {
        if (b) _dl(b, fname + ".png");
      });
    setMenu(false);
  };
  const onClick = (e) => {
    e.stopPropagation();
    const only =
      caps.tbl && !caps.svg ? "csv" : !caps.tbl && caps.svg ? "png" : null;
    if (only === "csv") return onCSV();
    if (only === "png") return onPNG();
    if (caps.tbl || caps.svg) setMenu((m) => !m);
  };
  const showBtn = !hideExport && (caps.tbl || caps.svg);
  return (
    <div
      style={{
        background: C.cd,
        borderRadius: 10,
        border: "1px solid " + C.bd,
        padding: "14px 16px",
        boxShadow: "0 1px 3px rgba(0,0,0,.05), 0 2px 8px rgba(0,0,0,.035)",
        minWidth: 0,
        overflow: "hidden",
        borderTop: accent ? "3px solid " + accent : undefined,
        position: "relative",
        ...s,
      }}
    >
      {(title || showBtn) && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 8,
            gap: 8,
          }}
        >
          {title ? (
            <div
              style={{
                fontSize: 15,
                fontWeight: 700,
                color: accent || C.bl,
                textTransform: "uppercase",
                letterSpacing: ".6px",
                flex: 1,
                minWidth: 0,
              }}
            >
              {title}
            </div>
          ) : (
            <div style={{ flex: 1 }} />
          )}
          {showBtn && (
            <div
              className="no-print"
              style={{ position: "relative", flexShrink: 0 }}
            >
              <button
                onClick={onClick}
                title="Download"
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 4,
                  border: "1px solid " + C.bd,
                  background: C.c2,
                  color: C.bl,
                  fontSize: 14,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  lineHeight: 1,
                  padding: 0,
                }}
              >
                {"⤓"}
              </button>
              {menu && caps.tbl && caps.svg && (
                <>
                  <div
                    onClick={() => setMenu(false)}
                    style={{ position: "fixed", inset: 0, zIndex: 200 }}
                  />
                  <div
                    style={{
                      position: "absolute",
                      right: 0,
                      top: "calc(100% + 4px)",
                      background: C.cd,
                      border: "1px solid " + C.bd,
                      borderRadius: 6,
                      boxShadow: "0 4px 12px rgba(0,0,0,.12)",
                      zIndex: 201,
                      minWidth: 140,
                      overflow: "hidden",
                    }}
                  >
                    <button
                      onClick={onCSV}
                      style={{
                        display: "block",
                        width: "100%",
                        padding: "7px 12px",
                        border: "none",
                        background: "transparent",
                        textAlign: "left",
                        fontSize: 13,
                        color: C.tx,
                        cursor: "pointer",
                        borderBottom: "1px solid " + C.bd,
                      }}
                    >
                      {"⤓"} CSV (Table)
                    </button>
                    <button
                      onClick={onPNG}
                      style={{
                        display: "block",
                        width: "100%",
                        padding: "7px 12px",
                        border: "none",
                        background: "transparent",
                        textAlign: "left",
                        fontSize: 13,
                        color: C.tx,
                        cursor: "pointer",
                      }}
                    >
                      {"⤓"} PNG (Chart)
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}
      <div ref={ref}>{children}</div>
    </div>
  );
}
