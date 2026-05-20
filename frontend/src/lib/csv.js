/**
 * RFC 4180 CSV builder + browser download.
 *
 * Per BRD FR-X28: every CSV produced by the dashboard prepends a
 * UTF-8 BOM so Microsoft Excel opens it without character corruption.
 *
 * Per BRD FR-P59: values containing comma, double quote, or newline
 * are wrapped in double quotes; internal double quotes are escaped
 * as two double quotes.
 */

const BOM = "﻿";

/**
 * Escape a single value per RFC 4180.
 * @param {unknown} value
 * @returns {string}
 */
export function escapeCsv(value) {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Build a CSV string from headers + rows. Each row is an array of
 * cell values; cells are escaped per RFC 4180. Lines are joined with
 * CRLF for maximum Excel compatibility.
 *
 * @param {string[]} headers
 * @param {Array<Array<unknown>>} rows
 * @returns {string}
 */
export function buildCsv(headers, rows) {
  const lines = [headers.map(escapeCsv).join(",")];
  for (const row of rows) {
    lines.push(row.map(escapeCsv).join(","));
  }
  return lines.join("\r\n");
}

/**
 * Trigger a browser download of `csv` as `filename`. Prepends the
 * UTF-8 BOM. Cleans up the object URL after the click is dispatched.
 *
 * @param {string} filename
 * @param {string} csv
 */
export function downloadCsv(filename, csv) {
  const blob = new Blob([BOM + csv], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Defer revoke so the browser has a tick to start the download.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
