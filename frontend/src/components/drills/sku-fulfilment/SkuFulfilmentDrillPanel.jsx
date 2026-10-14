import { useMemo, useRef } from "react";
import { Box, Stack, Typography, useTheme } from "@mui/material";
import DataTable from "@/components/tables/DataTable.jsx";
import CardDownloadButton from "@/components/CardDownloadButton.jsx";
import DrillCloseButton from "@/components/drills/shared/DrillCloseButton.jsx";
import { formatIndianNumber } from "@/lib/numberFormat.js";
import { toDisplayDate } from "@/lib/dateFormat.js";

const fmtQty = (v) => formatIndianNumber(v, { fallback: "–" });
const fmtPct = (v) => (v == null ? "–" : `${v.toFixed(2)}%`);
const fmtSigned = (v) =>
  v > 0 ? `+${fmtQty(v)}` : v < 0 ? `−${fmtQty(-v)}` : "0";

function deviationColor(v, theme) {
  if (v > 0) return theme.custom?.status?.green ?? theme.palette.success.main;
  if (v < 0) return theme.custom?.status?.red ?? theme.palette.error.main;
  return theme.palette.text.secondary;
}

/** Display-only over/under card: quantity, % of schedule, SKU count. */
function OverUnderCard({ card }) {
  return (
    <Box
      sx={{
        border: 1,
        borderColor: "divider",
        borderRadius: 2,
        p: 1.5,
        backgroundColor: "background.paper",
        minWidth: 0,
      }}
    >
      <Typography
        sx={{ fontSize: 12.5, fontWeight: 700, color: "text.secondary" }}
      >
        {card.label}
      </Typography>
      {card.noSchedule ? (
        <Typography
          sx={{
            mt: 0.5,
            fontSize: 15,
            fontWeight: 600,
            color: "text.disabled",
          }}
        >
          No schedule
        </Typography>
      ) : (
        <>
          <Typography sx={{ mt: 0.25, fontSize: 20, fontWeight: 800 }}>
            {fmtQty(card.qty)}{" "}
            <Box
              component="span"
              sx={{ fontSize: 12, fontWeight: 500, color: "text.secondary" }}
            >
              tyres
            </Box>
          </Typography>
          <Typography
            sx={{ fontSize: 12, fontWeight: 500, color: "text.secondary" }}
          >
            {fmtPct(card.pct)} of schedule · {card.skuCount} SKU
            {card.skuCount === 1 ? "" : "s"}
          </Typography>
        </>
      )}
    </Box>
  );
}

/**
 * Right-hand drill for the SKU Fulfillment card: the Over/Under cards
 * (4 for a day, 2 for a month or range) and the SKU-wise table.
 */
export default function SkuFulfilmentDrillPanel({
  sectionTitle,
  productType,
  model,
  isLoading,
  error,
  onClose,
}) {
  const theme = useTheme();
  const cardRef = useRef(null);
  const rows = useMemo(() => model?.table ?? [], [model]);

  const totals = useMemo(() => {
    let scheduled = 0;
    let actual = 0;
    for (const r of rows) {
      scheduled += r.scheduled;
      actual += r.actual;
    }
    return { scheduled, actual, deviation: actual - scheduled };
  }, [rows]);

  const columns = [
    { key: "sku", label: "SKU CODE", align: "left" },
    {
      key: "scheduled",
      label: "SCHEDULED QTY",
      align: "right",
      render: (r) => fmtQty(r.scheduled),
    },
    {
      key: "actual",
      label: "ACTUAL QTY",
      align: "right",
      render: (r) => fmtQty(r.actual),
    },
    {
      key: "deviation",
      label: "DEVIATION",
      align: "right",
      filterable: false,
      render: (r) => (
        <Box
          component="span"
          sx={{ fontWeight: 600, color: deviationColor(r.deviation, theme) }}
        >
          {fmtSigned(r.deviation)}
        </Box>
      ),
    },
  ];

  const footerRow = {
    sku: `Total (${rows.length} SKUs)`,
    scheduled: fmtQty(totals.scheduled),
    actual: fmtQty(totals.actual),
    deviation: (
      <Box
        component="span"
        sx={{
          fontWeight: 700,
          color: deviationColor(totals.deviation, theme),
        }}
      >
        {fmtSigned(totals.deviation)}
      </Box>
    ),
  };

  const excelHeaders = ["SKU Code", "Scheduled Qty", "Actual Qty", "Deviation"];
  const excelRows = useMemo(
    () => [
      ...rows.map((r) => ({
        "SKU Code": r.sku,
        "Scheduled Qty": r.scheduled,
        "Actual Qty": r.actual,
        Deviation: r.deviation,
      })),
      ...(rows.length
        ? [
            {
              "SKU Code": "Total",
              "Scheduled Qty": totals.scheduled,
              "Actual Qty": totals.actual,
              Deviation: totals.deviation,
            },
          ]
        : []),
    ],
    [rows, totals],
  );

  const asOf = model?.main?.asOf;
  const meta = [
    productType,
    model?.tableLabel,
    asOf ? `as of ${toDisplayDate(asOf.date)} · Shift ${asOf.shift}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const cards = model?.cards ?? [];

  return (
    <Stack spacing={2} sx={{ position: "relative" }}>
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        spacing={1}
      >
        <Typography
          sx={{
            fontSize: 15,
            fontWeight: 700,
            color: "primary.main",
            textTransform: "uppercase",
            letterSpacing: 0.6,
          }}
        >
          {`${sectionTitle} — SKU Fulfillment`}
        </Typography>
        <Stack direction="row" alignItems="center" spacing={1}>
          <CardDownloadButton
            cardRef={cardRef}
            rows={excelRows}
            headers={excelHeaders}
            filename={`SKU_Fulfillment_${sectionTitle}`}
            sheetName="SKU Fulfillment"
          />
          <DrillCloseButton onClose={onClose} />
        </Stack>
      </Stack>

      {meta && (
        <Typography
          sx={{ fontSize: 12, fontWeight: 500, color: "text.secondary" }}
        >
          {meta}
        </Typography>
      )}

      <Box ref={cardRef}>
        {error ? (
          <Typography sx={{ fontSize: 13, color: "error.main" }}>
            Could not load SKU Fulfillment data.
          </Typography>
        ) : isLoading || !model ? (
          <Typography sx={{ fontSize: 13, color: "text.secondary" }}>
            Loading…
          </Typography>
        ) : (
          <Stack spacing={2}>
            <Box
              sx={{
                display: "grid",
                gap: 1.5,
                gridTemplateColumns: {
                  xs: "repeat(2, minmax(0, 1fr))",
                  xl: `repeat(${cards.length}, minmax(0, 1fr))`,
                },
              }}
            >
              {cards.map((c) => (
                <OverUnderCard key={c.id} card={c} />
              ))}
            </Box>
            <DataTable
              columns={columns}
              rows={rows}
              getRowKey={(r) => r.sku}
              searchPlaceholder="Search SKU code…"
              emptyMessage={
                model.main.note ?? "No SKU rows for this selection."
              }
              footerRow={rows.length ? footerRow : null}
            />
          </Stack>
        )}
      </Box>
    </Stack>
  );
}
