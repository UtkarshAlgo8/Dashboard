import { useMemo, useRef, useState } from "react";
import {
  Box,
  Button,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import CardDownloadButton from "@/components/CardDownloadButton.jsx";
import { formatIndianNumber } from "@/lib/numberFormat.js";

const STATUS_FILTERS = [
  { id: "all", label: "All" },
  { id: "usable", label: "Ready to Use" },
  { id: "banned", label: "Banned to Use" },
  { id: "hold", label: "Hold" },
];

const SUMMARY_CARDS = [
  {
    label: "Categories Under 1 Day Cover",
    value: "2",
    tone: "red",
  },
  {
    label: "Item Codes With Blocked Stock",
    value: "32",
    tone: "amber",
  },
  {
    label: "On Hold",
    value: "12,158",
    tone: "amber",
  },
  {
    label: "Banned to Use",
    value: "12,082",
    tone: "red",
  },
  {
    label: "Oldest Blocked Lot",
    value: "5 days",
    tone: "red",
  },
];

const SECTIONS = [
  {
    id: "mixing",
    title: "Mixing Inventory",
    accent: "#F05A24",
    unit: "kg",
    rows: [
      {
        category: "Master Compound",
        usable: 5414,
        hold: 1724,
        banned: 1872,
        total: 9010,
        daysCover: 0.8,
        daysTone: "red",
        oldestLot: 5,
        alert: true,
      },
      {
        category: "Final Compound",
        usable: 5894,
        hold: 2640,
        banned: 2552,
        total: 11086,
        daysCover: 1.4,
        daysTone: "amber",
        oldestLot: 5,
      },
    ],
  },
  {
    id: "stock",
    title: "Stock Inventory",
    accent: "#159947",
    unit: "kg",
    rows: [
      {
        category: "Precut Cap Strip",
        usable: 2719,
        hold: 822,
        banned: 896,
        total: 4437,
        daysCover: 1.4,
        daysTone: "amber",
        oldestLot: 5,
      },
      {
        category: "Inner Liner",
        usable: 2747,
        hold: 482,
        banned: 268,
        total: 3497,
        daysCover: 1.9,
        daysTone: "amber",
        oldestLot: 5,
      },
      {
        category: "Sidewall",
        usable: 2687,
        hold: 462,
        banned: 258,
        total: 3407,
        daysCover: 1.9,
        daysTone: "amber",
        oldestLot: 5,
      },
      {
        category: "Plies",
        usable: 3187,
        hold: 1142,
        banned: 1216,
        total: 5545,
        daysCover: 2.0,
        daysTone: "amber",
        oldestLot: 5,
      },
      {
        category: "Belt",
        usable: 2649,
        hold: 802,
        banned: 876,
        total: 4327,
        daysCover: 2.1,
        daysTone: "green",
        oldestLot: 5,
      },
      {
        category: "Tread",
        usable: 5138,
        hold: 1743,
        banned: 1854,
        total: 8735,
        daysCover: 2.4,
        daysTone: "green",
        oldestLot: 5,
      },
      {
        category: "Chaffer",
        usable: 3247,
        hold: 1162,
        banned: 1236,
        total: 5645,
        daysCover: 2.5,
        daysTone: "green",
        oldestLot: 5,
      },
    ],
  },
  {
    id: "tyre",
    title: "Tyre Inventory",
    accent: "#147EFB",
    unit: "tyres",
    rows: [
      {
        category: "Carcass",
        usable: 1443,
        hold: 483,
        banned: 364,
        total: 2290,
        daysCover: 1.0,
        daysTone: "red",
        oldestLot: 5,
        alert: true,
      },
      {
        category: "Green Tire",
        usable: 1288,
        hold: 333,
        banned: 420,
        total: 2041,
        daysCover: 1.7,
        daysTone: "amber",
        oldestLot: 5,
      },
      {
        category: "Cured Tire",
        usable: 1558,
        hold: 363,
        banned: 270,
        total: 2191,
        daysCover: 2.9,
        daysTone: "green",
        oldestLot: 5,
      },
    ],
  },
];

const COLUMN_DEFS = [
  { id: "category", label: "Category", align: "left" },
  { id: "usable", label: "Usable", align: "center" },
  { id: "hold", label: "Hold", align: "center" },
  { id: "banned", label: "Banned", align: "center" },
  { id: "total", label: "Total", align: "center" },
  { id: "daysCover", label: "Days Cover", align: "center", sortable: true },
  { id: "oldestLot", label: "Oldest Lot", align: "right" },
];

function InventoryPage({ plantId }) {
  const [status, setStatus] = useState("all");

  if (plantId !== "chennai") {
    return (
      <Box
        sx={{
          height: "100%",
          display: "grid",
          placeItems: "center",
          color: "text.disabled",
        }}
      >
        <Typography sx={{ fontSize: 13 }}>Inventory not configured.</Typography>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        height: "100%",
        overflowY: "auto",
        backgroundColor: "#F3F5F9",
        px: { xs: 1.5, md: 3 },
        py: 2,
      }}
    >
      <Stack spacing={2.25}>
        <Stack
          direction={{ xs: "column", md: "row" }}
          alignItems={{ xs: "stretch", md: "center" }}
          justifyContent="space-between"
          spacing={1.5}
        >
          <Stack
            direction="row"
            alignItems="center"
            spacing={1}
            sx={{ flexWrap: "wrap", rowGap: 1 }}
          >
            <Typography
              sx={{
                color: "text.disabled",
                fontSize: 12,
                fontWeight: 800,
                textTransform: "uppercase",
              }}
            >
              Status
            </Typography>
            {STATUS_FILTERS.map((filter) => (
              <Button
                key={filter.id}
                variant="outlined"
                onClick={() => setStatus(filter.id)}
                sx={{
                  minHeight: 32,
                  px: 1.8,
                  py: 0.45,
                  borderRadius: 1.25,
                  borderColor:
                    status === filter.id ? "#F05A24" : "rgba(126,138,160,.28)",
                  backgroundColor:
                    status === filter.id ? "#FFF0EA" : "background.paper",
                  color: status === filter.id ? "#F05A24" : "text.primary",
                  fontSize: 13,
                  fontWeight: status === filter.id ? 700 : 600,
                  "&:hover": {
                    borderColor: "#F05A24",
                    backgroundColor:
                      status === filter.id ? "#FFF0EA" : "#FFF7F2",
                  },
                }}
              >
                {filter.label}
              </Button>
            ))}
          </Stack>
          <Typography
            sx={{
              color: "text.secondary",
              fontSize: 13,
              fontWeight: 600,
              textAlign: { xs: "left", md: "right" },
            }}
          >
            Shift: All · Today
          </Typography>
        </Stack>

        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: {
              xs: "1fr",
              sm: "repeat(2, minmax(0, 1fr))",
              lg: "repeat(5, minmax(0, 1fr))",
            },
            gap: 1.5,
          }}
        >
          {SUMMARY_CARDS.map((card) => (
            <SummaryCard key={card.label} card={card} />
          ))}
        </Box>

        {SECTIONS.map((section) => (
          <InventorySection key={section.id} section={section} status={status} />
        ))}
      </Stack>
    </Box>
  );
}

function SummaryCard({ card }) {
  const color = toneColor(card.tone);
  return (
    <Box
      sx={{
        position: "relative",
        minHeight: 68,
        backgroundColor: "background.paper",
        border: 1,
        borderColor: "rgba(126,138,160,.24)",
        borderRadius: 1.25,
        px: 2,
        py: 1.3,
        boxShadow: "0 1px 4px rgba(21,30,45,.06)",
        overflow: "hidden",
        "&:before": {
          content: '""',
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: 3,
          backgroundColor: color,
        },
      }}
    >
      <Typography
        sx={{
          color: "text.disabled",
          fontSize: 11,
          fontWeight: 800,
          textTransform: "uppercase",
        }}
      >
        {card.label}
      </Typography>
      <Typography
        sx={{
          mt: 0.35,
          color,
          fontSize: 22,
          lineHeight: 1.05,
          fontWeight: 800,
        }}
      >
        {card.value}
      </Typography>
    </Box>
  );
}

function InventorySection({ section, status }) {
  const cardRef = useRef(null);
  const rows = useMemo(() => section.rows, [section.rows]);
  const excelRows = rows.map((row) => ({
    Category: row.category,
    Usable: row.usable,
    Hold: row.hold,
    Banned: row.banned,
    Total: row.total,
    "Days Cover": `${row.daysCover.toFixed(1)} d`,
    "Oldest Lot": `${row.oldestLot} d`,
  }));

  return (
    <Box
      ref={cardRef}
      sx={{
        position: "relative",
        backgroundColor: "background.paper",
        border: 1,
        borderColor: "rgba(126,138,160,.22)",
        borderTop: `3px solid ${section.accent}`,
        borderRadius: 1.25,
        px: { xs: 1.25, md: 2 },
        pt: 1.8,
        pb: 1.35,
        boxShadow: "0 2px 8px rgba(21,30,45,.09)",
      }}
    >
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        spacing={1}
        sx={{ mb: 1.5 }}
      >
        <Typography
          sx={{
            color: "#556075",
            fontSize: 15,
            fontWeight: 800,
            textTransform: "uppercase",
          }}
        >
          {section.title}
        </Typography>
        <CardDownloadButton
          cardRef={cardRef}
          rows={excelRows}
          headers={[
            "Category",
            "Usable",
            "Hold",
            "Banned",
            "Total",
            "Days Cover",
            "Oldest Lot",
          ]}
          filename={`ctp-${section.id}-inventory`}
          sheetName={section.title}
          sx={{
            width: 28,
            height: 28,
            color: "text.disabled",
            boxShadow: "none",
            borderColor: "rgba(126,138,160,.24)",
          }}
        />
      </Stack>

      <TableContainer sx={{ overflowX: "auto" }}>
        <Table
          size="small"
          sx={{
            minWidth: 900,
            tableLayout: "fixed",
            "& .MuiTableCell-root": {
              borderRight: "none",
              borderColor: "rgba(126,138,160,.23)",
              px: 1.1,
              py: 0.85,
            },
          }}
        >
          <TableHead>
            <TableRow>
              {COLUMN_DEFS.map((column) => (
                <TableCell
                  key={column.id}
                  align={column.align}
                  sx={{
                    width: column.id === "category" ? "27%" : "12%",
                    color: "#8D98AD",
                    backgroundColor: "background.paper",
                    fontSize: 11,
                    fontWeight: 800,
                    textTransform: "uppercase",
                  }}
                >
                  <Stack
                    direction="row"
                    alignItems="center"
                    justifyContent={
                      column.align === "left"
                        ? "flex-start"
                        : column.align === "right"
                          ? "flex-end"
                          : "center"
                    }
                    spacing={0.25}
                  >
                    <span>{column.label}</span>
                    {column.sortable && (
                      <ArrowUpwardIcon
                        sx={{ fontSize: 13, color: "#F05A24" }}
                      />
                    )}
                  </Stack>
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((row) => (
              <TableRow
                key={row.category}
                hover
                sx={{
                  backgroundColor: row.alert
                    ? "rgba(255,59,48,.045)"
                    : "background.paper",
                  "&:hover": {
                    backgroundColor: "rgba(20,126,251,.05)",
                  },
                }}
              >
                <BodyCell align="left" strong>
                  {row.category}
                </BodyCell>
                <BodyCell strong muted={status !== "all" && status !== "usable"}>
                  {formatIndianNumber(row.usable)}
                </BodyCell>
                <BodyCell
                  tone="amber"
                  muted={status !== "all" && status !== "hold"}
                >
                  {formatIndianNumber(row.hold)}
                </BodyCell>
                <BodyCell
                  tone="red"
                  muted={status !== "all" && status !== "banned"}
                >
                  {formatIndianNumber(row.banned)}
                </BodyCell>
                <BodyCell tone="muted">{formatIndianNumber(row.total)}</BodyCell>
                <BodyCell tone={row.daysTone} strong>
                  {row.daysCover.toFixed(1)} d
                </BodyCell>
                <BodyCell align="right" tone="red">
                  {row.oldestLot} d
                </BodyCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Typography
        sx={{
          color: "text.disabled",
          fontSize: 12,
          mt: 1,
        }}
      >
        All quantities in {section.unit} · click a column head to sort · click a
        row for item codes
      </Typography>
    </Box>
  );
}

function BodyCell({
  children,
  align = "center",
  tone = "default",
  strong = false,
  muted = false,
}) {
  return (
    <TableCell
      align={align}
      sx={{
        color: muted ? "text.disabled" : toneColor(tone),
        fontSize: 13.5,
        fontWeight: strong ? 800 : 600,
        transition: "color 120ms ease, opacity 120ms ease",
      }}
    >
      {children}
    </TableCell>
  );
}

function toneColor(tone) {
  switch (tone) {
    case "red":
      return "#FF3038";
    case "amber":
      return "#D98A00";
    case "green":
      return "#209A4B";
    case "muted":
      return "#8D98AD";
    default:
      return "#2B2F33";
  }
}

export default InventoryPage;
