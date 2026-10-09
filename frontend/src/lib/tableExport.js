/**
 * Turn a `{ key, label, render }` column table into the headers + keyed rows
 * `exportRowsAsExcel` takes, cell for cell as the table shows them.
 *
 * A cell is what its column renders when that is plain text or a number, so
 * the sheet matches the screen (units, rounding, em-dashes included). A
 * column that renders an element (a status chip, say) falls back to the
 * row's raw value for its key.
 *
 * @param {{ key?: string, label: unknown, render?: (row: object, rows: object[]) => unknown }[]} columns
 * @param {object[]} rows rows in the order to export (the table's current sort)
 * @param {object[]} [allRows] the full row set `render` receives as context (defaults to `rows`)
 * @returns {{ headers: string[], rows: Record<string, string|number|null>[] }}
 */
export function toExportTable(columns, rows, allRows = rows) {
  const headers = columns.map((col) => String(col.label ?? col.key ?? ""));
  const out = rows.map((row) => {
    const record = {};
    columns.forEach((col, i) => {
      const shown = col.render ? col.render(row, allRows) : row?.[col.key];
      record[headers[i]] = isPlain(shown) ? shown : plainOrNull(row?.[col.key]);
    });
    return record;
  });
  return { headers, rows: out };
}

function isPlain(value) {
  return (
    typeof value === "string" ||
    (typeof value === "number" && Number.isFinite(value))
  );
}

function plainOrNull(value) {
  return isPlain(value) ? value : null;
}

/** "engineering-Machine · Curing" → "engineering-machine-curing" — safe for any download name. */
export function toFileSlug(name) {
  const slug = String(name ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "download";
}
