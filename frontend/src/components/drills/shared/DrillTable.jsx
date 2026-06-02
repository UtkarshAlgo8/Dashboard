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

/**
 * Reusable drill data table — matches artifact DTable style.
 * Columns: first column left-aligned, rest right-aligned.
 * Odd rows get a subtle background for readability.
 *
 * @param {string}   title      - panel title (shown above table)
 * @param {string[]} cols       - column headers
 * @param {object[]} rows       - drill rows (raw or pre-formatted)
 * @param {Function} [rowMapper] - optional: (row) => (cell|string)[]
 * @param {string}   [accent]   - MUI color token for title accent
 */
export function DrillTable({ title, cols, rows, rowMapper, accent }) {
  return (
    <Stack spacing={1.25}>
      {title && (
        <Typography
          sx={{
            fontSize: 13,
            fontWeight: 600,
            color: accent ? `${accent}.main` : "text.primary",
          }}
        >
          {title}
        </Typography>
      )}
      <TableContainer
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
            border: "1px solid",
            borderColor: t.palette.divider,
          },
          "& thead .MuiTableCell-root": {
            backgroundColor: t.custom.surface.soft,
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
                    color: "text.disabled",
                    backgroundColor: "background.paper",
                    borderBottom: 1,
                    borderColor: "divider",
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
                    sx={{
                      backgroundColor:
                        ri % 2 === 0 ? "transparent" : "action.hover",
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
    </Stack>
  );
}

function getStatusColor(s) {
  if (["OK", "Closed"].includes(s)) return "success";
  if (["High", "Low", "Scrapped", "Escalate", "Below", "Open"].includes(s))
    return "error";
  return "warning";
}
