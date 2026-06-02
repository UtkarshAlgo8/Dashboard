import { Box, Typography } from "@mui/material";
import { DrillTable } from "@/components/drills/shared/DrillTable.jsx";

/**
 * Shift Comparison card — appears below KPI grid, Productivity tab only.
 * Columns: Shift | Plan | Actual | FTQ% | OEE%
 *
 * Derives values from the same rows the KPI grid uses. Filters by
 * `row.granularity === "Shift A/B/C"` then averages across whatever
 * date range is currently selected. If a shift has no rows for the
 * range, that row reads "—".
 *
 * @param {string} section - gold_dummy section ("Mixing"/"TBM"/"Curing"/"Stock")
 * @param {object[]} rows  - raw dashboard rows for the active section + range
 * @param {string|null} [subSection] - Stock sub-section to scope to (BRD §13.2)
 * @param {string|null} [productType] - product type / "Overall" (BRD §13.3)
 */
export default function ShiftComparisonCard({
  section,
  rows = [],
  subSection = null,
  productType = null,
}) {
  const unit =
    section === "Mixing" ? "MT" : section === "Stock" ? "units" : "nos";

  const shifts = ["Shift A", "Shift B", "Shift C"];
  const tableRows = shifts.map((g) => {
    const shiftRows = rows.filter(
      (r) =>
        r.section === section &&
        r.granularity === g &&
        (!subSection || r.sub_section === subSection) &&
        // product_type scoping: keep rows with no product_type (OEE/FTQ)
        // or matching the selected one (Production with "Overall"/specific).
        (!productType ||
          r.product_type == null ||
          r.product_type === "" ||
          r.product_type === "nan" ||
          r.product_type === productType),
    );
    const plan = avgField(shiftRows, "Production", "threshold_value");
    const actual = avgField(shiftRows, "Production", "actual_value");
    const ftq = avgField(shiftRows, "FTQ", "actual_value");
    const oee = avgField(shiftRows, "OEE_o", "actual_value");
    return [
      g,
      fmtInt(plan),
      fmtInt(actual),
      fmtPct(ftq),
      fmtPct(oee),
    ];
  });

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
          mb: 1.5,
        }}
      >
        Shift Comparison
      </Typography>
      <DrillTable
        cols={["Shift", `Plan (${unit})`, `Actual (${unit})`, "FTQ%", "OEE%"]}
        rows={tableRows}
      />
    </Box>
  );
}

function avgField(rows, kpiName, field) {
  const vals = rows
    .filter((r) => r.kpi_name === kpiName)
    .map((r) => r[field])
    .filter((v) => typeof v === "number" && Number.isFinite(v));
  if (vals.length === 0) return null;
  return vals.reduce((s, v) => s + v, 0) / vals.length;
}

function fmtInt(v) {
  return v == null ? "—" : String(Math.round(v));
}

function fmtPct(v) {
  return v == null ? "—" : `${v.toFixed(1)}%`;
}
