import { useReducer, useRef } from "react";
import { Alert, Box, Button, Stack, Typography, useTheme } from "@mui/material";
import TechDrillCard from "@/components/technical/TechDrillCard.jsx";
import {
  getLiveOverageItems,
  getLiveOverageBarcodes,
} from "@/api/inventory.js";
import { usePolledQuery } from "@/hooks/usePolledQuery.js";
import { formatLiveOverageQty, formatOverageTime } from "@/lib/overage.js";
import { toDisplayDate } from "@/lib/dateFormat.js";

const PAGE_SIZE = 100;
const INITIAL = {
  productType: "All products",
  selected: null,
  itemOffset: 0,
  barcodeOffset: 0,
};
function reducer(state, action) {
  switch (action.type) {
    case "filter":
      return { ...INITIAL, productType: action.value };
    case "select":
      return { ...state, selected: action.row, barcodeOffset: 0 };
    case "back":
      return { ...state, selected: null, barcodeOffset: 0 };
    case "page":
      return {
        ...state,
        [state.selected ? "barcodeOffset" : "itemOffset"]: action.offset,
      };
    default:
      return state;
  }
}
const hours = (value) => (value == null ? "—" : Number(value).toFixed(1));

/** SQL-computed item summaries, followed by lazy, bounded barcode pages. */
function OverageDrill({
  section,
  data,
  areaLabel,
  title,
  breadcrumb,
  onClose,
  onRefresh,
}) {
  const theme = useTheme();
  const [state, dispatch] = useReducer(reducer, INITIAL);
  const forceRefresh = useRef(false);
  const consumeRefresh = () => {
    const value = forceRefresh.current;
    forceRefresh.current = false;
    return value;
  };
  const productType =
    state.productType === "All products" ? undefined : state.productType;
  const items = usePolledQuery(
    () =>
      getLiveOverageItems({
        section,
        productType,
        limit: PAGE_SIZE,
        offset: state.itemOffset,
        refresh: consumeRefresh(),
      }),
    {
      enabled: !state.selected,
      deps: [section, productType, state.itemOffset],
      interval: 0,
      cacheKey: `overage:items:${JSON.stringify([section, productType, state.itemOffset])}`,
      staleTime: 5 * 60_000,
    },
  );
  const selected = state.selected;
  const barcodes = usePolledQuery(
    () =>
      getLiveOverageBarcodes({
        section,
        productType: selected.product_type,
        itemCode: selected.item_code,
        unit: selected.unit,
        limit: PAGE_SIZE,
        offset: state.barcodeOffset,
        refresh: consumeRefresh(),
      }),
    {
      enabled: Boolean(selected),
      deps: [
        section,
        selected?.product_type,
        selected?.item_code,
        selected?.unit,
        state.barcodeOffset,
      ],
      interval: 0,
      cacheKey: `overage:barcodes:${JSON.stringify([section, selected?.product_type, selected?.item_code, selected?.unit, state.barcodeOffset])}`,
      staleTime: 5 * 60_000,
    },
  );
  const query = selected ? barcodes : items;
  const offset = selected ? state.barcodeOffset : state.itemOffset;
  const rawRows = query.error ? [] : (query.data?.rows ?? []);
  const productTypes = [
    ...new Set((data?.products ?? []).map((row) => row.product_type)),
  ];
  const cols = selected
    ? [
        "Barcode",
        "Cassette / Trolley",
        "Machine",
        "Product Type",
        "Item Code",
        "Produced At",
        "Production Date",
        "Shift",
        "Shelf Life (h)",
        "Shelf Life Source",
        "Expired At",
        "Age (h)",
        "Hours Over Limit",
        "Overage Qty",
        "Qty Source",
        "Quality Status",
      ]
    : [
        "Product Type",
        "Item Code",
        "Overage Qty",
        "Assumed Qty",
        "Barcodes",
        "Machines",
        "Shelf Life (h)",
        "Oldest Production Time",
        "Worst Delay (h)",
      ];
  const rows = rawRows.map((row) =>
    selected
      ? [
          row.barcode,
          row.mhe_code ?? "—",
          row.machine,
          row.product_type,
          row.item_code,
          formatOverageTime(row.produced_at),
          toDisplayDate(row.production_date),
          row.shift,
          hours(row.max_aging_hours),
          row.aging_source,
          formatOverageTime(row.expired_at),
          hours(row.age_hours),
          hours(row.hours_over_limit),
          formatLiveOverageQty(row.overage_qty, row.unit),
          row.qty_source,
          row.quality_status,
        ]
      : [
          row.product_type,
          row.item_code,
          formatLiveOverageQty(row.overage_qty, row.unit),
          formatLiveOverageQty(row.assumed_qty, row.unit),
          row.barcodes,
          row.machines,
          hours(row.max_aging_hours),
          formatOverageTime(row.oldest_produced_at),
          hours(row.max_hours_over_limit),
        ],
  );
  const refresh = () => {
    forceRefresh.current = true;
    query.refetch();
    onRefresh?.();
  };

  return (
    <Box sx={{ minWidth: 0 }}>
      {query.error && (
        <Alert severity="error" sx={{ mb: 1 }}>
          {query.error.message}
        </Alert>
      )}
      <TechDrillCard
        actions={
          <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
            {selected && (
              <Button size="small" onClick={() => dispatch({ type: "back" })}>
                Back to item codes
              </Button>
            )}
            <Button size="small" disabled={query.isLoading} onClick={refresh}>
              Refresh overage
            </Button>
          </Stack>
        }
        title={selected ? `${title} · ${selected.item_code}` : title}
        accent={theme.custom.brand.amber}
        breadcrumb={
          selected
            ? [...breadcrumb, selected.product_type, selected.item_code]
            : breadcrumb
        }
        tiles={[
          ...(data?.totals ?? []).map((row) => [
            `Section total (${row.unit ?? "no unit"})`,
            formatLiveOverageQty(row.overage_qty, row.unit),
          ]),
          ...(selected
            ? [
                [
                  "Selected item",
                  formatLiveOverageQty(selected.overage_qty, selected.unit),
                ],
              ]
            : []),
          ["Detail query as of", formatOverageTime(query.data?.as_of)],
        ]}
        chipRows={
          selected
            ? []
            : [
                {
                  label: "Product Type",
                  options: ["All products", ...productTypes],
                  value: state.productType,
                  onChange: (value) => dispatch({ type: "filter", value }),
                },
              ]
        }
        cols={cols}
        rows={rows}
        onRowClick={
          !selected && !query.isLoading && !query.error
            ? (_, index) => dispatch({ type: "select", row: rawRows[index] })
            : undefined
        }
        isLoading={query.isLoading}
        emptyMessage={
          query.error
            ? "Overage source unavailable."
            : `No overage stock for this selection in ${areaLabel}.`
        }
        downloadFilename={`technical-overage-${section}-${selected ? "barcodes" : "items"}-page-${offset / PAGE_SIZE + 1}`.toLowerCase()}
        footnote="Live Silver snapshot · rolling 720 hours · ignores dashboard date and shift filters. Different units are never added. Assumed Qty uses produced quantity when live quantity is not posted. Export contains this page only; independently queried screens may differ as stock changes."
        onClose={onClose}
      />
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mt: 1 }}>
        <Button
          size="small"
          disabled={query.isLoading || offset === 0}
          onClick={() =>
            dispatch({ type: "page", offset: Math.max(0, offset - PAGE_SIZE) })
          }
        >
          Previous
        </Button>
        <Typography sx={{ fontSize: 12 }}>
          Page {offset / PAGE_SIZE + 1} · up to {PAGE_SIZE} rows
        </Typography>
        <Button
          size="small"
          disabled={
            query.isLoading ||
            query.error ||
            !query.data?.has_more ||
            offset + PAGE_SIZE > 100000
          }
          onClick={() => dispatch({ type: "page", offset: offset + PAGE_SIZE })}
        >
          Next
        </Button>
      </Stack>
    </Box>
  );
}

export default OverageDrill;
