import { UpstreamError } from "./upstream.js";

export const EXCEL_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** Build a typed workbook from an explicit schema; text is literal, never a formula. */
export async function buildExcelExport({
  columns,
  rows,
  scope,
  sheetName = "Data",
}) {
  const imported = await import("xlsx");
  const XLSX = imported.default ?? imported;
  const cells = [
    columns.map(({ label }) => label),
    ...rows.map((row) => columns.map(({ key }) => row[key] ?? "—")),
  ];
  if (
    cells.some((row) =>
      row.some((cell) => typeof cell === "string" && cell.length > 32767),
    )
  ) {
    throw new UpstreamError(
      "An export cell exceeds Excel's text limit. Narrow the selection or contact the data team.",
      {
        status: 413,
        type: "EXPORT_CELL_TOO_LARGE",
      },
    );
  }
  const sheet = XLSX.utils.aoa_to_sheet(cells);
  sheet["!cols"] = columns.map((_, index) => ({
    wch: cells.reduce(
      (width, row) =>
        Math.max(width, Math.min(60, String(row[index]).length + 2)),
      10,
    ),
  }));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, sheetName);
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([["Scope", "Value"], ...Object.entries(scope)]),
    "Scope",
  );
  return XLSX.write(workbook, {
    type: "buffer",
    bookType: "xlsx",
    compression: true,
  });
}
