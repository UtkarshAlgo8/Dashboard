/**
 * Sortable drill table used by the Quality drill panels. `searchable` adds a
 * search box (same look as the shared DataTable search) that keeps the rows
 * whose text cells contain the query. Optional controlled-search props let an
 * export-enabled caller share that filter; legacy callers keep local search state.
 */
import { useEffect, useState } from "react";
import { IconButton, InputAdornment, Stack, TextField } from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import CloseIcon from "@mui/icons-material/Close";
import { C } from "./theme.js";

export function DTable({
  cols,
  rows,
  onRowClick,
  isRowClickable,
  searchable = false,
  searchPlaceholder = "Search…",
  searchValue,
  onSearchValueChange,
  searchDisabled = false,
  renderCell,
  rowKey,
  compareCells,
  sortable = true,
  statusColors = true,
  preserveText = false,
  keyboardRows = false,
}) {
  const [sc, setSc] = useState(null),
    [sd, setSd] = useState("desc"),
    [query, setQuery] = useState("");
  const ck = cols.join("|");
  // Reset the sort and search when the column set changes (a different
  // drill table).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSc(null);
    setSd("desc");
    setQuery("");
  }, [ck]);
  const num = (cell) => {
    let s = cell;
    if (s && typeof s === "object" && s.props) return null;
    s = String(s == null ? "" : s);
    // dd-mm-yyyy display dates sort by calendar order, not by day number.
    const d = /^(\d{2})-(\d{2})-(\d{4})$/.exec(s.trim());
    if (d) return Number(d[3] + d[2] + d[1]);
    const n = parseFloat(s.replace(/[^0-9.-]/g, ""));
    return /[0-9]/.test(s) && !isNaN(n) ? n : null;
  };
  const txt = (cell) => {
    let s = cell;
    if (s && typeof s === "object" && s.props) s = "";
    return String(s == null ? "" : s).toLowerCase();
  };
  const activeQuery = searchValue ?? query;
  const changeQuery = onSearchValueChange ?? setQuery;
  const q = searchable ? activeQuery.trim().toLowerCase() : "";
  let disp = q
    ? rows.filter((row) => row.some((c) => txt(c).includes(q)))
    : rows;
  if (sc != null) {
    disp = [...disp].sort((a, b) => {
      const na = num(a[sc]),
        nb = num(b[sc]);
      let c2;
      if (na != null && nb != null) c2 = na - nb;
      else {
        const ta = txt(a[sc]),
          tb = txt(b[sc]);
        c2 = ta < tb ? -1 : ta > tb ? 1 : 0;
      }
      const comparison = compareCells?.(a[sc], b[sc], sc) ?? c2;
      return sd === "asc" ? comparison : -comparison;
    });
  }
  const onH = (i) => {
    if (sc === i) setSd((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSc(i);
      setSd("desc");
    }
  };
  const searchBar = searchable && (
    <Stack
      direction="row"
      alignItems="center"
      justifyContent="space-between"
      spacing={1}
      sx={{ mb: 1 }}
    >
      <TextField
        size="small"
        disabled={searchDisabled}
        value={activeQuery}
        onChange={(e) => changeQuery(e.target.value)}
        placeholder={searchPlaceholder}
        sx={{ maxWidth: 320, "& .MuiOutlinedInput-root": { fontSize: 13 } }}
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <SearchIcon sx={{ fontSize: 16, color: "text.disabled" }} />
            </InputAdornment>
          ),
          endAdornment: activeQuery ? (
            <InputAdornment position="end">
              <IconButton
                size="small"
                disabled={searchDisabled}
                onClick={() => changeQuery("")}
              >
                <CloseIcon sx={{ fontSize: 14 }} />
              </IconButton>
            </InputAdornment>
          ) : null,
        }}
      />
      <span style={{ fontSize: 12, color: C.mu, whiteSpace: "nowrap" }}>
        {q ? `${disp.length} of ${rows.length}` : `${rows.length} rows`}
      </span>
    </Stack>
  );
  if (q && disp.length === 0)
    return (
      <>
        {searchBar}
        <div
          style={{
            padding: 12,
            textAlign: "center",
            color: C.mu,
            fontSize: 14,
          }}
        >
          No rows match “{activeQuery.trim()}”.
        </div>
      </>
    );
  return (
    <>
      {searchBar}
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
                    onClick={sortable ? () => onH(i) : undefined}
                    title={sortable ? "Click to sort" : undefined}
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
                      cursor: sortable ? "pointer" : "default",
                      userSelect: "none",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {c}
                    {sortable && (
                      <span
                        style={{
                          marginLeft: 4,
                          fontSize: 9,
                          opacity: a ? 1 : 0.3,
                        }}
                      >
                        {a ? (sd === "asc" ? "▲" : "▼") : "⇅"}
                      </span>
                    )}
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
                  key={rowKey ? rowKey(row) : ri}
                  onClick={clickable ? () => onRowClick(row) : undefined}
                  tabIndex={clickable && keyboardRows ? 0 : undefined}
                  onKeyDown={
                    clickable && keyboardRows
                      ? (event) => {
                          if (event.target !== event.currentTarget) return;
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            onRowClick(row);
                          }
                        }
                      : undefined
                  }
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
                      statusColors &&
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
                            ci === row.length - 1
                              ? "none"
                              : "1px solid " + C.bd,
                          textAlign: "center",
                          whiteSpace: preserveText ? "pre-wrap" : undefined,
                          overflowWrap: preserveText ? "anywhere" : undefined,
                          color: stC || C.tx,
                          fontWeight: ci === 0 || stC ? 600 : 400,
                        }}
                      >
                        {renderCell ? (
                          renderCell(cell, ci, row)
                        ) : isS ? (
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
    </>
  );
}
