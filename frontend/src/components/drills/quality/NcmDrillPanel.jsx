import { useMemo, useRef } from "react";
import { Box, Stack, Typography } from "@mui/material";
import DataTable from "@/components/tables/DataTable.jsx";
import { usePolledQuery } from "@/hooks/usePolledQuery.js";
import client from "@/api/client.js";
import { toDrillRows } from "@/lib/kpi-transformer.js";
import { toDisplayDate } from "@/lib/dateFormat.js";
import { formatIndianNumber } from "@/lib/numberFormat.js";
import CardDownloadButton from "@/components/CardDownloadButton.jsx";

/**
 * NCM Hold drill — item-code-wise hold details (kpi_name = NCM_Hold_sku).
 *
 * quality-change.md §6: columns are Item Code | Date | Hold Quantity | Final
 * Status | Remark / Reason. NCM Hold automatically reflects the currently
 * selected context (section / sub_section / product_type) — the user does
 * NOT re-pick the product type after clicking. That pinning is already
 * applied server-side on the drill fetch (the context carries the active
 * sub_section + product_type).
 *
 * NCM_Hold_sku is ADDITIVE, not a level/snapshot. Verified against the gold
 * table for Mixing / Aug-2026: the MONTH row is the SUM of that month's DAY
 * rows, item by item —
 *   MR156   "Use As"  1640 + 7175 + 1640 + 4920 = 15,375 = the MONTH row
 *   MS1066  "Use As"  3075 + 6150             =  9,225 = the MONTH row
 * The panel used to keep only the LATEST row per (item, reason), which is
 * the rule for a level KPI. That happened to be right on MONTH — one row
 * per item, so nothing was dropped — but over a multi-day DAY window it
 * silently showed one day in place of the range (MR156 would have read
 * 4,920 against a true 15,375). `classifyKpiAggregation` already treats
 * NCM_Hold as SUM; only this panel disagreed.
 *
 * So every stored (item, status, date) is now its own row. Verified: the DAY
 * rows for Mixing / Master Compound / Aug-2026 total 149,669.89, exactly the
 * MONTH total for the same pins.
 *
 * NOTE: that does NOT equal the NCM HOLD card above, and never did. The card
 * reads the parent `NCM_Hold`, whose stored month total for the same pins is
 * 119,534.89 — the parent is not the sum of its _sku children in the gold
 * table. A data-side discrepancy, not a rendering one; flagged, not papered
 * over here.
 *
 * Dated rows on a MONTH card: every MONTH row is stamped the 1st of the
 * month, so a Date column sourced from them would read "01-08-2026" for
 * everything. The real dates live in the DAY rows, which the shared drill
 * fetch does not carry while the card is on MONTH — so fetch them here,
 * scoped to this section and window. Same approach as the OEE drill's
 * date-wise view.
 */

const COLUMNS = [
  { key: "itemCode", label: "Item Code", align: "left", minWidth: 140 },
  {
    key: "date",
    label: "Date",
    minWidth: 120,
    render: (r) => toDisplayDate(r.date) ?? "—",
    // Displayed dd-mm-yyyy, ordered chronologically: YYYYMMDD sorts as a
    // number, whereas the raw ISO string would be read as just its year.
    value: (r) => toDisplayDate(r.date) ?? "",
    sortValue: (r) => Number(String(r.date ?? "").replaceAll("-", "")) || 0,
    filterable: false,
  },
  {
    key: "actual",
    label: "Hold Quantity",
    minWidth: 140,
    // Sort/filter on the number, render the thousands-separated string.
    render: (r) => formatIndianNumber(Math.round(r.actual)),
    value: (r) => r.actual,
    filterable: false,
  },
  { key: "status", label: "Final Status", minWidth: 140 },
  {
    key: "reason",
    label: "Remark / Reason",
    align: "left",
    minWidth: 200,
    render: (r) => r.reason || "—",
  },
];

export default function NcmDrillPanel({
  drillRows,
  granularity = "DAY",
  plantId = "banmore",
  sectionName = null,
  subSection = null,
  productType = null,
  from = null,
  to = null,
}) {
  const onMonth = String(granularity).toUpperCase() === "MONTH";
  const needsDayRows = onMonth && Boolean(sectionName && from && to);

  const dayPayload = needsDayRows
    ? {
        plantId,
        context: {
          section: sectionName,
          category: "Quality",
          granularity: "DAY",
          ...(subSection ? { sub_section: subSection } : {}),
          ...(productType ? { product_type: productType } : {}),
        },
        from,
        to,
        drillKpis: ["NCM_Hold_sku"],
        parentFilters: {},
        drillOnly: true,
        limit: 4000,
      }
    : null;

  const { data: dayData } = usePolledQuery(
    () =>
      dayPayload
        ? client
            .post("/dashboard/kpi-data", dayPayload)
            .then((r) => r.data ?? r)
        : Promise.resolve(null),
    {
      enabled: Boolean(dayPayload),
      interval: 0,
      deps: [JSON.stringify(dayPayload)],
    },
  );

  const rows = useMemo(() => {
    // On MONTH the dated rows come from the panel's own DAY fetch; otherwise
    // the shared drill rows are already at the granularity the card shows.
    const source = needsDayRows
      ? toDrillRows(Array.isArray(dayData) ? dayData : [])
      : (drillRows ?? []);
    const wantGran = needsDayRows ? "DAY" : granularity;
    return source
      .filter(
        (r) =>
          r.kpiName === "NCM_Hold_sku" &&
          r.granularity === wantGran &&
          r.itemCode &&
          typeof r.actual === "number" &&
          r.actual > 0,
      )
      .map((r) => ({
        itemCode: r.itemCode,
        date: r.date,
        actual: r.actual,
        // Final Status is the raw business status (Use As / Rework / Hold /
        // Repass), not the RAG colour (r.status), which is null for these.
        status: r.statusRaw ?? "—",
        reason: r.remarks ?? "—",
      }))
      .sort((a, b) => b.actual - a.actual);
  }, [needsDayRows, dayData, drillRows, granularity]);

  const cardRef = useRef(null);
  const excelRows = rows.map((r) => ({
    "Item Code": r.itemCode,
    Date: toDisplayDate(r.date) ?? "—",
    "Hold Quantity": Math.round(r.actual),
    "Final Status": r.statusRaw ?? "—",
    "Remark / Reason": r.reason ?? "—",
  }));

  return (
    <Stack spacing={1.25}>
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        spacing={1}
      >
        <Typography
          sx={{ fontSize: 13, fontWeight: 600, color: "text.primary" }}
        >
          NCM Hold Details
        </Typography>
        {/* Top-right download — menu offers PDF (visual) + Excel (NCM rows). */}
        <CardDownloadButton
          cardRef={cardRef}
          rows={excelRows}
          headers={[
            "Item Code",
            "Date",
            "Hold Quantity",
            "Final Status",
            "Remark / Reason",
          ]}
          filename="drill-ncm-hold"
          sheetName="NCMHold"
        />
      </Stack>
      <Box ref={cardRef}>
        <DataTable
          columns={COLUMNS}
          rows={rows}
          getRowKey={(r, i) => `${r.itemCode}|${r.reason}|${r.date}|${i}`}
          searchPlaceholder="Search item code or reason…"
          emptyMessage="No NCM hold records for this selection."
        />
      </Box>
    </Stack>
  );
}
