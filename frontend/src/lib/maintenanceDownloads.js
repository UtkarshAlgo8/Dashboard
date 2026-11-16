import { toExportTable, toFileSlug } from "./tableExport.js";

export const MAINTENANCE_HEADERS = {
  calibration: [
    "Machine No",
    "Machine Name",
    "Instruments",
    "Due Date",
    "Days Left",
    "Status",
  ],
  stockCost: ["Category", "Cost ₹", "Qty", "₹ / unit"],
  safetyTypes: ["Type", "Count"],
  safetyReports: [
    "Date",
    "Shift",
    "Department",
    "Location",
    "Status",
    "Details",
  ],
};

/** Save a completed server workbook; callers validate scope and handle cancellation first. */
export function saveMaintenanceWorkbook(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${filename}.xlsx`;
  document.body.appendChild(link);
  link.click();
  setTimeout(() => {
    link.remove();
    URL.revokeObjectURL(url);
  }, 0);
}

/** Turn table cells into the existing Excel export contract without stringifying numbers. */
export function maintenanceExportRows(headers, rows) {
  return toExportTable(
    headers.map((label, key) => ({ label, key })),
    rows,
  ).rows;
}

/** Keep the exported metric, period/grain and selected scope identifiable in both formats. */
export function maintenanceExportFilename(metric, period, scope = "") {
  const date = period?.from
    ? `${period.from}-to-${period.to}`
    : (period?.asOfDate ?? period?.date);
  return toFileSlug(
    ["btp", metric, date, period?.granularity ?? "IST", scope]
      .filter(Boolean)
      .join("-"),
  ).slice(0, 180);
}
