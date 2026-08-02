import { Box, Tooltip, Typography } from "@mui/material";
import { DrillTable } from "@/components/drills/shared/DrillTable.jsx";
import { usePolledQuery } from "@/hooks/usePolledQuery.js";
import client from "@/api/client.js";
import {
  canonicalizeProductType,
  canonicalizeSubSection,
} from "@/lib/dashboardRowScopes.js";
import {
  AGGREGATE_PRODUCT,
  aggregateForRange,
  canonicalUnit,
  resolveProductionKpi,
} from "@/lib/kpi-transformer.js";
import { buildDatePayload } from "@/lib/timeRange.js";

/**
 * Shift Comparison card — appears below KPI grid, Productivity tab only.
 *
 * quality-change.md §1: the table shows QUANTITY KPIs only — Production,
 * Scrap, Rework — never rates (OEE/FTQ/%).
 *
 * new_change.md C11: shifts are VALUES OF `granularity` (SHIFT A/B/C) and
 * exist at DAY level ONLY — there is no MONTH-level shift row. So:
 *   • Today / day-wise → read the three SHIFT A/B/C rows for that `date`
 *   • Month-wise / custom range → SUM each shift's DAILY rows over the window
 * `DAY` and `SHIFT *` are never summed together (A + B + C = DAY exactly).
 *
 * new_change.md C12: every shift query inherits the whole dashboard scope —
 * section, sub_section, machine, product_type, unit_of_measurement — and
 * uses the same per-section kpi_name + product pin as the Production card
 * (C7: Curing/TBM product-wise read `Production_product`).
 *
 * new_change.md C14: a shift with no row shows "—", NEVER 0 (0 means "ran
 * and produced nothing"); the latest day is flagged when its shifts are
 * incomplete, so a partial in-progress day is not read as a real drop.
 *
 */

/**
 * One shift band: the rows for ONE `granularity` (SHIFT A/B/C) over the
 * active window, for ONE category.
 *
 * new_change.md C2/C11: the granularity predicate is ALWAYS pinned. This
 * card used to read the shift rows out of the granularity-less landing
 * fetch, but an absent granularity now resolves to DAY server-side — that
 * fetch carries no SHIFT row at all, so every cell rendered "—". One
 * request per shift is the only way to read `granularity = 'SHIFT x'`.
 */
function useShiftBand({
  plantId = "banmore",
  shift,
  category,
  section,
  subSection,
  isRange,
  date,
  from,
  to,
  extraKpis = null,
}) {
  const payload = {
    plantId,
    context: {
      section,
      category,
      granularity: shift,
      ...(subSection ? { sub_section: subSection } : {}),
    },
    // new_change.md C1: range OR single date, never both.
    ...buildDatePayload(isRange ? { from, to } : { date }),
    // new_change.md C7/C12: Production_product is NOT a landing-level row,
    // so a product-wise Curing/TBM shift cell needs it requested by name.
    // Without `drillOnly` the landing band still comes back alongside it,
    // and product_type stays unpinned server-side so the aggregate and its
    // children both arrive — exactly one of them is picked below (C4).
    drillKpis: extraKpis,
    parentFilters: {},
    limit: 10000,
  };
  const hasWindow = isRange ? Boolean(from || to) : Boolean(date);
  const { data } = usePolledQuery(
    () => client.post("/dashboard/kpi-data", payload).then((r) => r.data ?? r),
    {
      // Never call kpi-data without a resolved window.
      enabled: Boolean(section) && hasWindow,
      interval: 0,
      deps: [JSON.stringify(payload)],
    },
  );
  return Array.isArray(data) ? data : [];
}

/**
 * @param {string} section - gold section ("Mixing"/"TBM"/"Curing"/"Stock")
 * @param {string|null} [subSection] - sub-section pin (required for Stock)
 * @param {string|null} [productType] - selected product type
 * @param {string|null} [unit] - pinned unit_of_measurement
 * @param {string|null} [machine] - machine pin, when a machine filter is active
 * @param {"day"|"range"} [mode] - day-wise vs month-wise / custom range
 * @param {string|null} [date] - the day to read in "day" mode
 * @param {string|null} [from] - range start in "range" mode
 * @param {string|null} [to] - range end in "range" mode
 */
export default function ShiftComparisonCard({
  plantId = "banmore",
  section,
  subSection = null,
  productType = null,
  unit = null,
  machine = null,
  mode = "day",
  date = null,
  from = null,
  to = null,
}) {
  const isRange = mode === "range";

  // realdata.md §3: shift granularity values are uppercase SHIFT A/B/C.
  const shifts = [
    { gran: "SHIFT A", label: "Shift A" },
    { gran: "SHIFT B", label: "Shift B" },
    { gran: "SHIFT C", label: "Shift C" },
  ];

  // One band per shift. Production sits under category='Productivity';
  // Scrap / Rework under category='Quality' — the pin is required because a
  // Productivity "Scrap" OEE-loss leaf ALSO exists (quality-change.md §7).
  const bandArgs = { plantId, section, subSection, isRange, date, from, to };
  const prodArgs = {
    ...bandArgs,
    category: "Productivity",
    extraKpis:
      section === "TBM" || section === "Curing" ? ["Production_product"] : null,
  };
  const prodBands = [
    useShiftBand({ ...prodArgs, shift: "SHIFT A" }),
    useShiftBand({ ...prodArgs, shift: "SHIFT B" }),
    useShiftBand({ ...prodArgs, shift: "SHIFT C" }),
  ];
  const qualBands = [
    useShiftBand({ ...bandArgs, shift: "SHIFT A", category: "Quality" }),
    useShiftBand({ ...bandArgs, shift: "SHIFT B", category: "Quality" }),
    useShiftBand({ ...bandArgs, shift: "SHIFT C", category: "Quality" }),
  ];

  // new_change.md C7/C12: the Production kpi_name + product pin, identical
  // to the Production card. Curing/TBM read Production_product pinned to the
  // selection (or the aggregate Cured Tyre / Green Tyre); Mixing pins the
  // compound; Stock pins sub_section + product (+ unit, below).
  const { kpiName: prodKpi, productPin } = resolveProductionKpi(
    section,
    productType,
  );

  const matchesScope = (r) => {
    if (r.section !== section) return false;
    if (
      subSection &&
      canonicalizeSubSection(r.sub_section) !==
        canonicalizeSubSection(subSection)
    )
      return false;
    if (machine && r.machine !== machine) return false;
    return true;
  };

  const pickProdRows = (bandRows, kpiName, pin) =>
    bandRows.filter((r) => {
      if (r.kpi_name !== kpiName) return false;
      if (!matchesScope(r)) return false;
      // Never combine two units of the same series (C9).
      if (unit && canonicalUnit(r.unit_of_measurement) !== canonicalUnit(unit))
        return false;
      const rowPt = canonicalizeProductType(r.product_type);
      if (pin) return rowPt === canonicalizeProductType(pin);
      // "Overall" on a KPI whose rows carry no product = the empty row.
      return rowPt == null;
    });

  const isAggregatePin =
    productPin != null && productPin === AGGREGATE_PRODUCT[section];

  const prodRowsFor = (i) => {
    const band = prodBands[i];
    const primary = pickProdRows(band, prodKpi, productPin);
    // C12: the OVERALL view of Curing/TBM is the same number under either
    // kpi_name, so when the shift band carries no Production_product row for
    // the aggregate we fall back to the overall `Production` row
    // (product_type = the literal "null") rather than blanking the box.
    if (primary.length === 0 && isAggregatePin) {
      return pickProdRows(band, "Production", null);
    }
    return primary;
  };

  const qRowsFor = (kpiName, i) =>
    qualBands[i].filter((r) => r.kpi_name === kpiName && matchesScope(r));

  // new_change.md C11 + C5: day-wise reads the ONE row on the selected day;
  // month-wise / range SUMS the daily shift rows (additive KPIs) across the
  // window. Returns null — never 0 — when the shift has no row at all (C14).
  const readShift = (rowsForShift, kpiName) => {
    const dated = rowsForShift
      .map((r) => ({ key: dateKey(r.date), v: numOrNull(r.actual_value) }))
      .filter((x) => x.v !== null)
      .sort((a, b) => (a.key < b.key ? 1 : -1)); // newest first
    if (dated.length === 0) return null;
    if (!isRange) {
      const want = dateKey(date);
      const onDay = want
        ? dated.filter((x) => x.key === want)
        : dated.filter((x) => x.key === dated[0].key);
      if (onDay.length === 0) return null;
      return aggregateForRange(
        onDay.map((x) => x.v),
        kpiName,
      );
    }
    return aggregateForRange(
      dated.map((x) => x.v),
      kpiName,
    );
  };

  const prodByShift = shifts.map((_, i) => readShift(prodRowsFor(i), prodKpi));

  // new_change.md C14: flag a partial / in-progress day — at least one shift
  // has data and at least one has none, so the totals cannot reconcile yet.
  const anyProd = prodByShift.some((v) => v != null);
  const someMissing = prodByShift.some((v) => v == null);
  const isPartial = anyProd && someMissing;

  const unitLabel = canonicalUnit(unit) ?? "";
  const tableRows = shifts.map(({ label }, i) => [
    label,
    fmtQty(prodByShift[i]),
    fmtQty(readShift(qRowsFor("Scrap", i), "Scrap")),
    fmtQty(readShift(qRowsFor("Rework", i), "Rework")),
  ]);

  const windowLabel = isRange
    ? `${from ?? "…"} → ${to ?? "…"} · daily shift rows summed`
    : (date ?? "latest day");

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
          mb: 0.5,
        }}
      >
        Shift Comparison
      </Typography>
      <Typography sx={{ fontSize: 11, color: "text.disabled", mb: 1.5 }}>
        {windowLabel}
        {isPartial && (
          <Tooltip
            title="This day is still in progress — one or more shifts have no row yet, so the shifts do not add up to the day total."
            arrow
          >
            <Box component="span" sx={{ ml: 1, color: "warning.main" }}>
              · partial day (in progress)
            </Box>
          </Tooltip>
        )}
      </Typography>
      <DrillTable
        cols={[
          "Shift",
          unitLabel ? `Production (${unitLabel})` : "Production",
          "Scrap",
          "Rework",
        ]}
        rows={tableRows}
      />
    </Box>
  );
}

/** Athena serializes measures as strings; coerce to number|null. */
function numOrNull(v) {
  if (v == null || v === "" || v === "nan" || v === "null") return null;
  const n = typeof v === "number" ? v : Number.parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

/** ISO yyyy-mm-dd or DD-MM-YYYY → sortable YYYYMMDD. */
function dateKey(d) {
  if (typeof d !== "string") return "";
  const s = d.length > 10 ? d.slice(0, 10) : d;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s.replaceAll("-", "");
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(s);
  return m ? `${m[3]}${m[2]}${m[1]}` : "";
}

/** new_change.md C14: no row → "—", never 0. */
function fmtQty(v) {
  if (v == null) return "—";
  return Math.abs(v) < 1000 && !Number.isInteger(v)
    ? v.toFixed(1)
    : Math.round(v).toLocaleString();
}
