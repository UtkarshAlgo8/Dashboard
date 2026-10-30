/**
 * Building blocks shared by the CTP Quality drill panels: hint and empty
 * lines, "View by" pills, a searchable table, a count strip and the
 * group → detail drill (process, machine or SKU rows that open a detail
 * table for the clicked row).
 */
import { useState } from "react";
import { TextField } from "@mui/material";
import { Breadcrumb } from "@/components/quality/shared/Breadcrumb.jsx";
import { Card } from "@/components/quality/shared/Card.jsx";
import { DTable } from "@/components/quality/shared/DTable.jsx";
import { C } from "@/components/quality/shared/theme.js";
import { count } from "./ctpFormat.js";

export function Hint({ children }) {
  return (
    <div style={{ marginTop: 8, fontSize: 12, color: C.mu }}>
      {"▸"} {children}
    </div>
  );
}

export function Empty({ children }) {
  return (
    <div
      style={{ padding: 12, textAlign: "center", color: C.mu, fontSize: 14 }}
    >
      {children}
    </div>
  );
}

/** "View by" pills, same look as the BTP FTQ drill. */
export function ViewPills({ options, value, onChange, accent = C.tl }) {
  return (
    <div
      style={{
        display: "flex",
        gap: 8,
        alignItems: "center",
        marginBottom: 10,
        flexWrap: "wrap",
      }}
    >
      <span
        style={{
          fontSize: 11.5,
          color: C.mu,
          fontWeight: 700,
          textTransform: "uppercase",
        }}
      >
        View by
      </span>
      {options.map(([id, label]) => {
        const active = value === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onChange(id)}
            style={{
              padding: "5px 14px",
              borderRadius: 999,
              border: "1px solid " + (active ? accent : C.bd),
              background: active ? accent + "15" : C.c2,
              color: active ? accent : C.tx,
              fontSize: 12.5,
              fontWeight: active ? 700 : 500,
              cursor: "pointer",
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

/** Totals above a table, e.g. Inspected / Rejected. */
export function CountStrip({ items }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))`,
        gap: 8,
        marginBottom: 10,
      }}
    >
      {items.map(({ label, value, color }) => (
        <div
          key={label}
          style={{
            border: "1px solid " + C.bd,
            borderRadius: 8,
            padding: "8px 10px",
            background: C.c2,
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: C.mu,
              textTransform: "uppercase",
              letterSpacing: ".4px",
            }}
          >
            {label}
          </div>
          <div style={{ fontSize: 18, fontWeight: 800, color: color || C.tx }}>
            {count(value)}
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * DTable with a search box over every cell. Rows arrive pre-sorted (worst
 * first); the CSV export of the enclosing Card takes the rows on screen.
 */
export function SearchTable({ cols, rows, placeholder, onRowClick }) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const shown = q
    ? rows.filter((cells) =>
        cells.some((c) =>
          String(c ?? "")
            .toLowerCase()
            .includes(q),
        ),
      )
    : rows;
  return (
    <>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          marginBottom: 8,
        }}
      >
        <TextField
          size="small"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder}
          sx={{ minWidth: 220, "& input": { fontSize: 13 } }}
        />
        <span style={{ fontSize: 12, color: C.mu }}>
          {q ? `${shown.length} of ${rows.length}` : `${rows.length} rows`}
        </span>
      </div>
      {shown.length === 0 ? (
        <Empty>No rows match “{query}”.</Empty>
      ) : (
        <DTable cols={cols} rows={shown} onRowClick={onRowClick} />
      )}
    </>
  );
}

/**
 * Group table that opens a detail table for the clicked row. The first cell
 * of each group row is its key; `detailRows` are matched on `detailKey`.
 */
export function GroupDrill({
  kpi,
  periodLabel,
  title,
  accent,
  cols,
  rows,
  toCells,
  detailTitle,
  detailCols,
  detailRows,
  toDetailCells,
  emptyDetail,
  groupLabel = "process",
  detailKey = "process",
  emptyRows = "No audits for this period.",
  searchable = false,
}) {
  const [selected, setSelected] = useState("");
  const detail = selected
    ? (detailRows ?? []).filter((d) => d[detailKey] === selected)
    : [];
  const onRowClick = detailRows
    ? (cells) => setSelected(selected === cells[0] ? "" : cells[0])
    : undefined;
  const cells = rows.map(toCells);
  return (
    <div style={{ display: "grid", gap: 10 }}>
      <Card title={`${title} — ${periodLabel}`} accent={accent}>
        <Breadcrumb
          path={selected ? [kpi.n, title, selected] : [kpi.n, title]}
          onNav={(i) => i < 2 && setSelected("")}
        />
        {rows.length === 0 ? (
          <Empty>{emptyRows}</Empty>
        ) : searchable ? (
          <SearchTable
            cols={cols}
            rows={cells}
            placeholder={`Search ${groupLabel}`}
            onRowClick={onRowClick}
          />
        ) : (
          <DTable cols={cols} rows={cells} onRowClick={onRowClick} />
        )}
        {detailRows && rows.length > 0 && (
          <Hint>
            Click a {groupLabel} row to see its {detailTitle.toLowerCase()}
          </Hint>
        )}
      </Card>
      {selected && (
        <Card title={`${detailTitle} — ${selected}`} accent={C.rd}>
          {detail.length === 0 ? (
            <Empty>{emptyDetail}</Empty>
          ) : (
            <DTable cols={detailCols} rows={detail.map(toDetailCells)} />
          )}
        </Card>
      )}
    </div>
  );
}
