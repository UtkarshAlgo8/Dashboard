import { useRef } from "react";
import { Alert, Button, Paper, Stack, Typography } from "@mui/material";
import MaintenanceDownloadButton from "@/components/engineering/MaintenanceDownloadButton.jsx";
import {
  MAINTENANCE_HEADERS,
  maintenanceExportFilename,
} from "@/lib/maintenanceDownloads.js";
import JKLoader from "@/components/JKLoader.jsx";
import { DTable } from "@/components/quality/shared/DTable.jsx";
import {
  stockCategoryCells,
  stockCostSnapshot,
  stockCostCategorySummary,
  stockMoney,
} from "@/lib/stockCost.js";

/** One date, one material-category level; row shortcuts open category trends, never items. */
export default function StockCostDrillPanel({ query, onClose, onTrend }) {
  const panelRef = useRef(null);
  const { current, rows } = stockCostSnapshot(query.data);
  const { costRows, total, topThree } = stockCostCategorySummary(rows);
  const tableRows = [
    ...rows.map((row) => stockCategoryCells(row)),
    ["Total", stockMoney(total), "—", ""],
  ];
  const mismatch = query.data?.reconciliation.some(
    (item) => item.date === current?.date,
  );
  return (
    <Paper
      ref={panelRef}
      component="section"
      variant="outlined"
      aria-label="Stock Cost by Category"
      sx={{ p: 2, borderRadius: 2 }}
    >
      <Stack
        direction="row"
        justifyContent="space-between"
        alignItems="center"
        spacing={1}
        sx={{ mb: 1 }}
      >
        <Typography component="h2" sx={{ fontSize: 17, fontWeight: 700 }}>
          Stock Cost by Category
        </Typography>
        <Stack direction="row" alignItems="center" spacing={1}>
          <MaintenanceDownloadButton
            cardRef={panelRef}
            headers={MAINTENANCE_HEADERS.stockCost}
            rows={[
              ...rows.map((row) =>
                stockCategoryCells(row, { rawNumbers: true }),
              ),
              ["Total", total, "—", ""],
            ]}
            filename={maintenanceExportFilename("stock-cost", {
              date: current?.date,
              granularity: "DAY",
            })}
            disabled={
              Boolean(query.error) ||
              query.isLoading ||
              !current ||
              !rows.length
            }
          />
          <Button size="small" onClick={onClose}>
            Close
          </Button>
        </Stack>
      </Stack>
      <Typography sx={{ mb: 1, fontSize: 12, color: "text.secondary" }}>
        {current?.date ?? "Selected period"} · BTP · DAY · All shifts
      </Typography>
      {query.error ? (
        <Alert severity="error">
          Stock Cost unavailable: {query.error.message}
        </Alert>
      ) : query.isLoading ? (
        <JKLoader message="Loading Stock Cost categories" />
      ) : !current ? (
        <Alert severity="info">
          No published Stock Cost day in this selection.
        </Alert>
      ) : (
        <Stack spacing={2}>
          {mismatch && (
            <Alert severity="warning">
              Published category costs do not reconcile with the plant total for
              this date. Values are shown as published.
            </Alert>
          )}
          {costRows.length > 0 && (
            <Typography sx={{ fontWeight: 600 }}>
              Top 3 categories ={" "}
              {total ? stockMoney((topThree / total) * 100) : "—"}% of cost
            </Typography>
          )}
          {rows.length ? (
            <>
              <DTable
                cols={MAINTENANCE_HEADERS.stockCost}
                rows={tableRows}
                sortable={false}
                statusColors={false}
                preserveText
                keyboardRows
                isRowClickable={(cells) =>
                  tableRows.indexOf(cells) < rows.length
                }
                onRowClick={(cells) => {
                  const index = tableRows.indexOf(cells);
                  if (index >= 0 && index < rows.length)
                    onTrend(rows[index].category);
                }}
              />
              <Typography sx={{ fontSize: 12, color: "text.secondary" }}>
                Select a category row to view its trend. Quantities are not
                totalled across units or categories. No item-level data is
                published.
              </Typography>
            </>
          ) : (
            <Alert severity="info">
              No published category rows for this date.
            </Alert>
          )}
        </Stack>
      )}
    </Paper>
  );
}
