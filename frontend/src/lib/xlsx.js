/**
 * Build an .xlsx file from rows + headers and trigger a browser download.
 *
 * Lazy-loads the `xlsx` package so it stays out of the main bundle
 * (it's ~50 KB gzipped). Numbers are kept as numbers (not coerced to
 * strings), dates pass through as the raw cell text the caller hands us.
 *
 * @param {object} opts
 * @param {string[]} opts.headers     column headers in display order
 * @param {object[]} opts.rows        each row is an object keyed by header
 * @param {string}   opts.filename    file name (without extension)
 * @param {string}   [opts.sheetName] worksheet name (default "Data")
 * @returns {Promise<void>}
 */
export async function exportRowsAsExcel({
  headers,
  rows,
  filename,
  sheetName = "Data",
}) {
  if (!Array.isArray(headers) || headers.length === 0) return;
  if (!Array.isArray(rows)) return;
  const name = (filename ?? "data").replace(/[^a-z0-9-_]+/gi, "-");

  const { utils, writeFile } = await import("xlsx");

  // Build an array-of-arrays. xlsx's json_to_sheet infers types but only
  // from a flat object shape; aoa keeps the column order under our control.
  const aoa = [headers, ...rows.map((row) => headers.map((h) => row?.[h]))];
  const ws = utils.aoa_to_sheet(aoa);

  // Auto-size each column to the widest cell value (capped so absurd cells
  // don't blow out the width).
  const widths = headers.map((h) => {
    let w = String(h ?? "").length;
    for (const row of rows) {
      const v = row?.[h];
      const len = v == null ? 0 : String(v).length;
      if (len > w) w = len;
    }
    return { wch: Math.min(Math.max(w + 2, 8), 60) };
  });
  ws["!cols"] = widths;

  const wb = utils.book_new();
  utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
  writeFile(wb, `${name}.xlsx`);
}
