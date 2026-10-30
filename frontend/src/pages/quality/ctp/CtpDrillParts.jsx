/**
 * Building blocks shared by the CTP Quality drill panels: hint and empty
 * lines, a count strip and the group → detail drill (process, machine or SKU
 * rows that open a detail table for the clicked row). Generic pieces (view
 * toggle, stat tile, filter, searchable table) live in
 * components/quality/shared.
 */
import { useState } from "react";
import { Breadcrumb } from "@/components/quality/shared/Breadcrumb.jsx";
import { Card } from "@/components/quality/shared/Card.jsx";
import { DTable } from "@/components/quality/shared/DTable.jsx";
import { StatTile } from "@/components/quality/shared/StatTile.jsx";
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

/** Totals above a table, e.g. Inspected / Rejected. */
export function CountStrip({ items }) {
  return (
    <div
      style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}
    >
      {items.map(({ label, value, color }) => (
        <StatTile
          key={label}
          label={label}
          value={count(value)}
          color={color}
        />
      ))}
    </div>
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
  return (
    <div style={{ display: "grid", gap: 10 }}>
      <Card title={`${title} — ${periodLabel}`} accent={accent}>
        <Breadcrumb
          path={selected ? [kpi.n, title, selected] : [kpi.n, title]}
          onNav={(i) => i < 2 && setSelected("")}
        />
        {rows.length === 0 ? (
          <Empty>{emptyRows}</Empty>
        ) : (
          <DTable
            cols={cols}
            rows={rows.map(toCells)}
            onRowClick={onRowClick}
            searchable={searchable}
            searchPlaceholder={`Search ${groupLabel}`}
          />
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
