import { useState } from "react";
import { Box, Typography, useTheme } from "@mui/material";
import TechDrillCard from "@/components/technical/TechDrillCard.jsx";
import { toDisplayDate } from "@/lib/dateFormat.js";
import { formatIndianInteger } from "@/lib/numberFormat.js";
import {
  areaComponents,
  areaTotals,
  componentSkus,
  formatOverageQty,
} from "@/lib/overage.js";

const ALL_COMPONENTS = "All components";

/** Chip label for one component row — unit included, since a component
 *  can hold stock in more than one unit. */
function componentLabel(row) {
  return `${row.product_type ?? "—"} · ${row.unit ?? "—"}`;
}

function rowCells(first, row) {
  return [
    first ?? "—",
    formatOverageQty(row.overage_qty, row.unit),
    toDisplayDate(row.oldest_lot_date) ?? "—",
    formatIndianInteger(row.production_days),
  ];
}

/**
 * Overage Material drill (specs/17-overage-material.md): the area's
 * components, then one component's SKUs. Fetching is the page's job; this
 * renders the snapshot it is given.
 *
 * @param {object} props
 * @param {{ totals: object[], skus: object[] } | null} props.data
 * @param {Error | null} props.error
 * @param {boolean} props.isLoading
 * @param {{ section: string, subSection: string|null }} props.scope
 * @param {string} props.areaLabel
 * @param {string} props.title
 * @param {string[]} props.breadcrumb
 * @param {string | null} props.asOf latest data date (Q-OVG-02)
 * @param {() => void} props.onClose
 */
function OverageDrill({
  data,
  error,
  isLoading,
  scope,
  areaLabel,
  title,
  breadcrumb,
  asOf,
  onClose,
}) {
  const theme = useTheme();
  const [selected, setSelected] = useState(ALL_COMPONENTS);

  const totals = areaTotals(data?.totals, scope);
  const components = areaComponents(data?.totals, scope);
  const component =
    components.find((row) => componentLabel(row) === selected) ?? null;
  const skus = component
    ? componentSkus(data?.skus, scope, {
        productType: component.product_type,
        unit: component.unit,
      })
    : [];

  const cols = component
    ? ["SKU", "Overage Qty", "Oldest Lot", "Production Days"]
    : ["Component", "Overage Qty", "Oldest Lot", "Production Days"];
  const rows = component
    ? skus.map((row) => rowCells(row.itemcode, row))
    : components.map((row) => rowCells(row.product_type, row));

  const oldest =
    totals
      .map((row) => row.oldest_lot_date)
      .filter(Boolean)
      .sort()[0] ?? null;
  const tiles = [
    ...totals.map((row) => [
      `Overage (${row.unit ?? "—"})`,
      formatOverageQty(row.overage_qty, row.unit),
    ]),
    ["Oldest lot", oldest ? toDisplayDate(oldest) : "—"],
    ["Last refreshed", asOf ? toDisplayDate(asOf) : "—"],
  ];

  const empty =
    !error && data && rows.length === 0
      ? component
        ? ` No SKU rows for ${component.product_type ?? "this component"}.`
        : ` No overage stock in ${areaLabel}.`
      : "";

  return (
    <Box sx={{ mt: 2 }}>
      {error && (
        <Typography
          role="alert"
          sx={{ mb: 1, color: "error.main", fontSize: 12.5 }}
        >
          Inventory source unavailable: {error.message}
        </Typography>
      )}
      <TechDrillCard
        title={title}
        accent={theme.custom.brand.amber}
        breadcrumb={
          component
            ? [...breadcrumb, component.product_type ?? "—"]
            : breadcrumb
        }
        tiles={data ? tiles : []}
        chipRows={[
          {
            label: "Component",
            options: [ALL_COMPONENTS, ...components.map(componentLabel)],
            value: component ? selected : ALL_COMPONENTS,
            onChange: setSelected,
          },
        ]}
        cols={cols}
        rows={rows}
        isLoading={!data && isLoading}
        downloadFilename={`technical-overage-${areaLabel}`.toLowerCase()}
        footnote={`Current snapshot — ignores the date and shift filters. Largest first; each unit is shown separately.${empty}`}
        onClose={onClose}
      />
    </Box>
  );
}

export default OverageDrill;
