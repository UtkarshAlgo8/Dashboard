import { Box, Typography } from "@mui/material";
import { DrillTable } from "@/components/drills/shared/DrillTable.jsx";
import { usePolledQuery } from "@/hooks/usePolledQuery.js";
import client from "@/api/client.js";
import {
  denanDimension,
  isProductAgnosticKpi,
  preferScopedRows,
} from "@/lib/dashboardRowScopes.js";

/**
 * Shift Comparison card — appears below KPI grid, Productivity tab only.
 *
 * quality-change.md §1: the table shows QUANTITY KPIs only — Production,
 * Scrap, Rework — never rates (OEE/FTQ/%). All three are SUM KPIs, so
 * Shift A + Shift B + Shift C = the Daily total for each column. Shift
 * data exists only at the daily level, so we always compare the LATEST
 * day's shifts (never MTD/YTD — no monthly shift totals exist). When the
 * top filter is Month/Year, we still show the latest day's shifts and
 * label the card accordingly.
 *
 * Production comes from the Productivity rows already in hand (`rows`).
 * Scrap and Rework live under category='Quality' (§7: a Productivity
 * "Scrap" OEE-loss leaf ALSO exists, so we MUST pin category='Quality'),
 * which the Productivity-tab fetch does not return — so this card fetches
 * those two series itself, pinned to the same section/sub_section/product.
 *
 * @param {string} section - gold_dummy section ("Mixing"/"TBM"/"Curing"/"Stock")
 * @param {object[]} rows  - raw dashboard rows for the active section + range
 * @param {string|null} [subSection] - Stock sub-section to scope to
 * @param {string|null} [productType] - product type / "Overall"
 * @param {string|null} [asOf] - latest available date (anchor) ISO yyyy-mm-dd
 * @param {boolean} [periodIsDay] - false when the top filter is Month/Year
 */
export default function ShiftComparisonCard({
  section,
  rows = [],
  subSection = null,
  productType = null,
  asOf = null,
  periodIsDay = true,
}) {
  const unit =
    section === "Mixing" ? "MT" : section === "Stock" ? "units" : "nos";

  // Scrap / Rework live under category='Quality'. Fetch them for this
  // section at all shift granularities on the anchor day. We do NOT send a
  // granularity (we want all three shifts) and pin category via the Quality
  // tab id 'q' → 'Quality' in buildContext server-side.
  const qPayload = {
    context: {
      section,
      category: "Quality",
      ...(subSection ? { sub_section: subSection } : {}),
    },
    date: asOf,
    from: null,
    to: null,
    drillKpis: null,
    parentFilters: {},
    limit: 10000,
  };
  const { data: qRows } = usePolledQuery(
    () =>
      client.post("/dashboard/fetch", qPayload).then((r) => r.data ?? r),
    {
      enabled: Boolean(section),
      interval: 0,
      deps: [JSON.stringify(qPayload)],
    },
  );

  const scopedRows = preferScopedRows(rows, productType);
  // realdata.md §3: shift granularity values are uppercase SHIFT A/B/C in the
  // real data. `gran` matches the row; `label` is the display text.
  const shifts = [
    { gran: "SHIFT A", label: "Shift A" },
    { gran: "SHIFT B", label: "Shift B" },
    { gran: "SHIFT C", label: "Shift C" },
  ];

  // Production: from the Productivity rows in hand, pinned to the selected
  // product. One stored summary row per shift on the latest day.
  const prodByShift = (g) => {
    const matched = scopedRows.filter(
      (r) =>
        r.section === section &&
        r.kpi_name === "Production" &&
        r.granularity === g &&
        r.unit_of_measurement === unit &&
        (!subSection || r.sub_section === subSection) &&
        (!productType ||
          isProductAgnosticKpi(r.kpi_name) ||
          denanDimension(r.product_type) === productType),
    );
    return sumLatestDay(matched);
  };

  // Scrap / Rework: from the Quality fetch. These are single section-level
  // summary rows per shift (no product_type pinning needed — the Quality
  // Scrap/Rework series is per-section, split by shift).
  const qByShift = (kpiName, g) => {
    if (!Array.isArray(qRows)) return null;
    const matched = qRows.filter(
      (r) =>
        r.section === section &&
        r.kpi_name === kpiName &&
        r.granularity === g &&
        (!subSection || r.sub_section === subSection),
    );
    return sumLatestDay(matched);
  };

  const tableRows = shifts.map(({ gran, label }) => [
    label,
    fmtQty(prodByShift(gran), unit),
    fmtQty(qByShift("Scrap", gran), null),
    fmtQty(qByShift("Rework", gran), null),
  ]);

  return (
    <Box
      sx={{
        border: 1,
        borderColor: "divider",
        borderRadius: 1.25,
        p: 2,
      }}
    >
      <Typography
        sx={{
          fontSize: 13,
          fontWeight: 600,
          color: "primary.main",
          mb: periodIsDay ? 1.5 : 0.5,
        }}
      >
        Shift Comparison
      </Typography>
      {!periodIsDay && (
        <Typography sx={{ fontSize: 11, color: "text.disabled", mb: 1.5 }}>
          Showing the latest day&rsquo;s shifts — shift totals exist only at
          the daily level, so they cannot be compared to a month/year total.
        </Typography>
      )}
      <DrillTable
        cols={["Shift", `Production (${unit})`, "Scrap", "Rework"]}
        rows={tableRows}
      />
    </Box>
  );
}

/**
 * Sum a shift's rows on the LATEST available date only. Shift KPIs are
 * stored as one summary row per (shift, day); collapsing to the latest day
 * keeps the comparison on a single day so A+B+C reconcile with that day's
 * Daily total. Defensive sum in case more than one row maps to a shift.
 */
function sumLatestDay(rows) {
  const dated = rows.filter(
    (r) => typeof r.actual_value === "number" && Number.isFinite(r.actual_value),
  );
  if (dated.length === 0) return null;
  const latest = dated.reduce(
    (max, r) => (dateKey(r.date) > max ? dateKey(r.date) : max),
    "",
  );
  const onLatest = dated.filter((r) => dateKey(r.date) === latest);
  return onLatest.reduce((s, r) => s + r.actual_value, 0);
}

/** ISO yyyy-mm-dd or DD-MM-YYYY → sortable YYYYMMDD. */
function dateKey(d) {
  if (typeof d !== "string") return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d.replaceAll("-", "");
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(d);
  return m ? `${m[3]}${m[2]}${m[1]}` : "";
}

function fmtQty(v, unit) {
  if (v == null) return "—";
  if (unit === "MT" && v < 1000) return v.toFixed(1);
  return Math.round(v).toLocaleString();
}
