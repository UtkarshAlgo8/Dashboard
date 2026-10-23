import { useEffect, useState } from "react";
import {
  Box,
  Button,
  CircularProgress,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import { getProductChildren } from "@/api/quality.js";
import {
  PAINT_WEIGHT_COLUMNS,
  PAINT_WEIGHT_DRILL_KPIS,
  PAINT_WEIGHT_OVERALL,
  groupPaintWeightRows,
  paintWeightValue,
} from "@/lib/paintWeight.js";

/**
 * GT Weight Variation drill for the Technical dashboard: overall
 * within-1/2/3% shares plus the per-SKU paint-weight table, read from the
 * same gold KPIs as Quality › Product.
 *
 * @param {object} props
 * @param {string} props.date - snapshot date (ISO)
 * @param {string} props.shift - All / A / B / C
 * @param {string} props.granularity - DAY / MONTH / YEAR / SHIFT X
 * @param {string[]} props.breadcrumb
 * @param {() => void} props.onClose
 */
export default function PaintWeightDrill({
  date,
  shift,
  granularity,
  breadcrumb,
  onClose,
}) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    getProductChildren({
      kpiNames: PAINT_WEIGHT_DRILL_KPIS,
      date,
      shift,
      granularity,
    })
      .then((result) => {
        if (!cancelled) setRows(result?.rows ?? []);
      })
      .catch((requestError) => {
        if (!cancelled) {
          setRows([]);
          setError(requestError);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [date, granularity, shift]);

  const { overall, tableRows } = groupPaintWeightRows(rows ?? []);

  return (
    <Paper component="section" variant="outlined" sx={{ mt: 2, p: 2 }}>
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        sx={{ mb: 0.5 }}
      >
        <Typography sx={{ fontSize: 16, fontWeight: 750 }}>
          GT Weight Variation — Paint Weight
        </Typography>
        <Button size="small" onClick={onClose}>
          Close
        </Button>
      </Stack>
      <Typography sx={{ mb: 1.5, fontSize: 12.5, color: "text.secondary" }}>
        {breadcrumb.join(" › ")}
      </Typography>
      {rows == null ? (
        <Box sx={{ display: "grid", placeItems: "center", minHeight: 160 }}>
          <CircularProgress size={26} aria-label="Loading paint weight data" />
        </Box>
      ) : error ? (
        <Typography
          role="alert"
          sx={{ py: 2, fontSize: 13, color: "error.main" }}
        >
          Unable to load paint weight data.
        </Typography>
      ) : (
        <>
          <Stack
            direction="row"
            useFlexGap
            flexWrap="wrap"
            gap={3}
            sx={{ mb: 2 }}
          >
            {PAINT_WEIGHT_OVERALL.map((column) => (
              <Box key={column.kpi}>
                <Typography sx={{ fontSize: 12.5, color: "text.secondary" }}>
                  {column.label}
                </Typography>
                <Typography sx={{ fontSize: 20, fontWeight: 750 }}>
                  {paintWeightValue(overall.get(column.kpi), 2, true)}
                </Typography>
              </Box>
            ))}
          </Stack>
          {tableRows.length ? (
            <Box sx={{ overflowX: "auto" }}>
              <Table size="small" aria-label="Paint weight by SKU">
                <TableHead>
                  <TableRow>
                    <TableCell>SKU</TableCell>
                    {PAINT_WEIGHT_COLUMNS.map((column) => (
                      <TableCell key={column.kpi} align="right">
                        {column.label}
                      </TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {tableRows.map(([sku, ...cells]) => (
                    <TableRow key={sku}>
                      <TableCell>{sku}</TableCell>
                      {cells.map((cell, index) => (
                        <TableCell
                          key={PAINT_WEIGHT_COLUMNS[index].kpi}
                          align="right"
                        >
                          {cell}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Box>
          ) : (
            <Typography sx={{ py: 2, fontSize: 13, color: "text.secondary" }}>
              No SKU data for this period.
            </Typography>
          )}
        </>
      )}
    </Paper>
  );
}
