import { useRef } from "react";
import {
  Box,
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

const COLS = [
  { key: "fg", label: "FG" },
  { key: "cured", label: "Cured" },
  { key: "green", label: "Green" },
  { key: "tread", label: "Tread" },
  { key: "belt", label: "Belt" },
  { key: "ply", label: "Ply" },
  { key: "capstrip", label: "Capstrip" },
  { key: "sidewall", label: "Sidewall" },
  { key: "iLiner", label: "I.Liner" },
  { key: "bead", label: "Bead" },
  { key: "final", label: "Final" },
  { key: "master", label: "Master" },
];

/**
 * Daily Inventory historical table per BRD FR-P68. Last 7 days
 * across all 12 categories. Newest first.
 */
function DailyInventoryTable({ history }) {
  const cardRef = useRef(null);
  const reversed = [...history].reverse();
  const headers = ["Date", ...COLS.map((c) => c.label)];
  const excelRows = reversed.map((row) => {
    const out = { Date: row.date };
    for (const c of COLS) out[c.label] = row[c.key];
    return out;
  });

  return (
    <Box
      ref={cardRef}
      sx={{
        position: "relative",
        backgroundColor: "background.paper",
        border: 1,
        borderColor: "divider",
        borderRadius: 1.25,
        p: 2,
        mt: 2,
      }}
    >
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1.5 }}>
        {/* Top-left download — menu offers PDF (visual) + Excel (history rows). */}
        <CardDownloadButton
          cardRef={cardRef}
          rows={excelRows}
          headers={headers}
          filename="inventory-daily-7-days"
          sheetName="DailyInventory"
        />
        <Typography sx={{ fontSize: 13, fontWeight: 700 }}>
          Daily Inventory — last 7 days
        </Typography>
      </Stack>
      <TableContainer
        sx={{ border: 1, borderColor: "divider", borderRadius: 1 }}
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
              <Th align="center">Date</Th>
              {COLS.map((c) => (
                <Th key={c.key}>{c.label}</Th>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {reversed.map((row) => (
              <TableRow key={row.date} hover>
                <TableCell
                  sx={{
                    fontSize: 12,
                    fontFamily: "monospace",
                    fontWeight: 600,
                  }}
                >
                  {row.date}
                </TableCell>
                {COLS.map((c) => (
                  <TableCell key={c.key} align="center" sx={{ fontSize: 12 }}>
                    {row[c.key]}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}

function Th({ children, align = "center" }) {
  return (
    <TableCell
      align={align}
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
      {children}
    </TableCell>
  );
}

export default DailyInventoryTable;
