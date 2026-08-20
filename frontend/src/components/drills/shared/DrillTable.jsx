import { useRef } from "react";
import {
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import CardDownloadButton from "@/components/CardDownloadButton.jsx";
import TableLegend from "@/components/tables/TableLegend.jsx";

/**
 * Reusable drill data table — matches artifact DTable style.
 * Columns: first column left-aligned, rest right-aligned.
 * Odd rows get a subtle background for readability.
 *
 * Download support (top-left icon, Excel-only by default):
 *   downloadFilename   - when set, a download icon appears next to the title.
 *                        Excel is built from `rows` + `cols` (or
 *                        `downloadHeaders` if the displayed rows are
 *                        pre-formatted strings you don't want in the file).
 *   downloadHeaders    - optional override of `cols` for the Excel export
 *                        only. The rendered table still uses `cols`.
 *   downloadSheetName  - worksheet name (default "Data").
 *   legend             - optional custom legend or false to hide
 *
 * @param {string}   title      - panel title (shown above table)
 * @param {string[]} cols       - column headers
 * @param {object[]} rows       - drill rows (raw or pre-formatted)
 * @param {Function} [rowMapper] - optional: (row) => (cell|string)[]
 * @param {string}   [accent]   - MUI color token for title accent
 */
export function DrillTable({
  title,
  cols,
  rows,
  rowMapper,
  accent,
  downloadFilename,
  downloadHeaders,
  downloadSheetName,
  legend,
}) {
  const tableRef = useRef(null);
  const excelHeaders = downloadHeaders ?? cols ?? [];

  // DrillTable's rows are either rowMapper-shaped arrays of cells (the
  // common case) or pre-resolved arrays/objects. Normalise to
  // { header: cell } for the Excel builder.
  const excelRows = (Array.isArray(rows) ? rows : []).map((row) => {
    const cells = rowMapper
      ? rowMapper(row)
      : Array.isArray(row)
        ? row
        : Object.values(row);
    const out = {};
    excelHeaders.forEach((h, i) => {
      out[h ?? `col_${i}`] = cells[i];
    });
    return out;
  });

  return (
    <Stack spacing={1.25} sx={{ position: "relative" }}>
      {title && (
        <Stack
          direction="row"
          alignItems="center"
          justifyContent="space-between"
          spacing={1}
        >
          <Typography
            sx={{
              fontSize: 13,
              fontWeight: 600,
              color: accent ? `${accent}.main` : "text.primary",
            }}
          >
            {title}
          </Typography>
          {downloadFilename && (
            <CardDownloadButton
              cardRef={tableRef}
              rows={excelRows}
              headers={excelHeaders}
              filename={downloadFilename}
              sheetName={downloadSheetName}
            />
          )}
        </Stack>
      )}
      <TableContainer
        ref={tableRef}
        sx={{
          maxHeight: 320,
          border: 1,
          borderColor: "divider",
          borderRadius: 1.25,
        }}
      >
        <Table
          size="small"
          stickyHeader
          sx={(t) => ({
            "& .MuiTableCell-root": {
              borderBottom: "1px solid",
              borderRight: "1px solid",
              borderColor: t.palette.divider,
              "&:last-child": {
                borderRight: "none",
              },
            },
            "& thead .MuiTableCell-root": {
              backgroundColor:
                t.custom?.table?.headerBg ?? t.custom?.surface?.soft,
              borderBottom: "2px solid",
              borderColor: t.palette.divider,
            },
          })}
        >
          <TableHead>
            <TableRow>
              {cols.map((c) => (
                <TableCell
                  key={c}
                  align="center"
                  sx={{
                    fontSize: 11,
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: 0.6,
                    color: "text.primary",
                    backgroundColor: (t) =>
                      t.custom?.table?.headerBg ?? t.custom?.surface?.soft,
                    borderBottom: 2,
                    borderRight: 1,
                    borderColor: "divider",
                    "&:last-child": {
                      borderRight: "none",
                    },
                    whiteSpace: "nowrap",
                  }}
                >
                  {c}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {!rows || rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={cols.length}
                  align="center"
                  sx={{ fontSize: 12, color: "text.disabled", py: 3 }}
                >
                  No data for this period.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row, ri) => {
                const cells = rowMapper
                  ? rowMapper(row, ri)
                  : Array.isArray(row)
                    ? row
                    : Object.values(row);
                return (
                  <TableRow
                    key={ri}
                    hover
                    sx={{
                      backgroundColor: (t) =>
                        ri % 2 === 0
                          ? "background.paper"
                          : (t.custom?.table?.alternateRow ??
                            "rgba(0, 119, 182, 0.04)"),
                      "&:hover": {
                        backgroundColor: (t) => t.palette.action.hover,
                      },
                    }}
                  >
                    {cells.map((cell, ci) => (
                      <TableCell
                        key={ci}
                        align="center"
                        sx={{
                          fontSize: 13,
                          fontWeight: ci === 0 ? 600 : 400,
                          color:
                            typeof cell === "string" &&
                            [
                              "OK",
                              "Closed",
                              "High",
                              "Low",
                              "Scrapped",
                              "Escalate",
                              "Below",
                              "Open",
                            ].includes(cell)
                              ? `${getStatusColor(cell)}.main`
                              : "text.primary",
                        }}
                      >
                        {cell ?? "—"}
                      </TableCell>
                    ))}
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {legend ? (
        typeof legend === "string" ? (
          <TableLegend preset={legend} />
        ) : Array.isArray(legend) ? (
          <TableLegend items={legend} />
        ) : (
          legend
        )
      ) : hasStatusCells(rows, rowMapper) ? (
        <TableLegend preset="status" />
      ) : null}
    </Stack>
  );
}

function hasStatusCells(rows, rowMapper) {
  if (!Array.isArray(rows) || rows.length === 0) return false;
  const statusValues = [
    "OK",
    "Closed",
    "High",
    "Low",
    "Scrapped",
    "Escalate",
    "Below",
    "Open",
    "Alert",
    "Monitor",
  ];
  return rows.some((row, ri) => {
    const cells = rowMapper
      ? rowMapper(row, ri)
      : Array.isArray(row)
        ? row
        : Object.values(row);
    return cells.some(
      (cell) => typeof cell === "string" && statusValues.includes(cell),
    );
  });
}

function getStatusColor(s) {
  if (["OK", "Closed"].includes(s)) return "success";
  if (["High", "Low", "Scrapped", "Escalate", "Below", "Open"].includes(s))
    return "error";
  return "warning";
}
