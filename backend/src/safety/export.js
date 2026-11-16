import { runQuery, UpstreamError } from "../utils/upstream.js";
import { buildExcelExport } from "../utils/excel-export.js";
import { safetyQuery, safetyResult } from "./queries.js";

export const SAFETY_EXPORT_MAX_ROWS = 10000;
const TYPE_COLUMNS = [
  { key: "type", label: "Type" },
  { key: "value", label: "Count" },
];
const REPORT_COLUMNS = [
  { key: "date", label: "Date" },
  { key: "shift", label: "Shift" },
  { key: "section", label: "Department" },
  { key: "machine", label: "Location" },
  { key: "status", label: "Status" },
  { key: "remarks", label: "Details" },
];

/** Separate, bounded export workload: one consistent source read, no paging/caching side effects. */
export function createSafetyExportService(
  query = runQuery,
  {
    maxRows = SAFETY_EXPORT_MAX_ROWS,
    maxActive = 1,
    workbook = buildExcelExport,
  } = {},
) {
  let active = 0;
  return async (input) => {
    if (!["types", "reports"].includes(input.level))
      throw new UpstreamError(
        "Select Safety types or a report type to export.",
        { status: 400, type: "VALIDATION_ERROR" },
      );
    if (active >= maxActive)
      throw new UpstreamError(
        "Safety export capacity reached; please retry shortly.",
        { status: 503, type: "SAFETY_EXPORT_BUSY" },
      );
    active++;
    try {
      // Read all matching rows in one SQL snapshot, not separate potentially drifting pages.
      // The extra row and existing aggregate metadata detect caps/upstream truncation.
      const scope = { ...input, offset: 0, limit: maxRows + 1 };
      const data = safetyResult(
        await query(safetyQuery(scope), { engine: "athena", tables: [] }),
        scope,
      );
      if (data.page.total > maxRows)
        throw new UpstreamError(
          `Safety exports are limited to ${maxRows} rows. Narrow the date range or selected type.`,
          { status: 413, type: "SAFETY_EXPORT_TOO_LARGE" },
        );
      if (data.page.hasMore || data.rows.length !== data.page.total)
        throw new UpstreamError(
          "Safety export is incomplete. No partial file was generated.",
          { status: 502, type: "SAFETY_SOURCE_INVALID" },
        );
      const period = input.from ? `${input.from}-to-${input.to}` : input.date;
      const scopeName =
        input.level === "types" ? "types" : `reports-${input.type}`;
      const filename =
        `btp-safety-${period}-${input.granularity}-${scopeName}`
          .replace(/[^a-z0-9_-]+/gi, "-")
          .slice(0, 180) + ".xlsx";
      const buffer = await workbook({
        columns: input.level === "types" ? TYPE_COLUMNS : REPORT_COLUMNS,
        rows: data.rows,
        sheetName: input.level === "types" ? "Types" : "Reports",
        scope: {
          Plant: "Banmore (BTP)",
          Period: period,
          Granularity: input.granularity,
          Type: input.type ?? "All types",
          "Exported rows": data.rows.length,
          Coverage: "All matching rows; not just the displayed page",
        },
      });
      return { buffer, filename };
    } finally {
      active--;
    }
  };
}
