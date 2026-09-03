import { useMemo, useState, useRef } from "react";
import {
  Box,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
  useTheme,
} from "@mui/material";
import DataTable from "@/components/tables/DataTable.jsx";
import TablePager from "@/components/tables/TablePager.jsx";
import CardDownloadButton from "@/components/CardDownloadButton.jsx";
import DrillCloseButton from "@/components/drills/shared/DrillCloseButton.jsx";
import { canonicalizeProductType } from "@/lib/dashboardRowScopes.js";

const SECTION_TITLE = {
  mix: "Mixing",
  tbm: "Tyre Building",
  cur: "Curing",
  stk: "Stock",
};

const SECTION_NAME = {
  mix: "Mixing",
  tbm: "TBM",
  cur: "Curing",
  stk: "Stock",
};

const AGGREGATE_PRODUCT = {
  TBM: "Green Tyre",
  Curing: "Cured Tyre",
};

const STATUS_FILTER_OPTIONS = [
  { value: "all", label: "All" },
  { value: "under", label: "Underproduced (<90%)" },
  { value: "acceptable", label: "Acceptable (90%-105%)" },
  { value: "over", label: "Overproduced (>105%)" },
];

const PAGE_SIZE_OPTIONS = [25, 50, 100];

function getStatusTier(statusPct) {
  if (isNaN(statusPct) || statusPct < 90) return "under";
  if (statusPct <= 105) return "acceptable";
  return "over";
}

function formatDeviation(diff, plan) {
  const diffStr =
    diff >= 0 ? `+${diff.toLocaleString()}` : `${diff.toLocaleString()}`;
  const diffPct = plan > 0 ? (diff / plan) * 100 : 0;
  const pctStr =
    diffPct >= 0 ? `+${diffPct.toFixed(1)}%` : `${diffPct.toFixed(1)}%`;
  return `${diffStr} (${pctStr})`;
}

function DeviationCell({ row }) {
  const theme = useTheme();
  const color =
    row.tier === "under"
      ? theme.palette.error.main
      : row.tier === "acceptable"
        ? theme.palette.success.main
        : theme.palette.warning.main;

  return (
    <Box component="span" sx={{ fontWeight: 600, color }}>
      {formatDeviation(row.diff, row.plan)}
    </Box>
  );
}

function ToggleGroup({ label, value, onChange, options }) {
  return (
    <Stack direction="row" alignItems="center" spacing={1}>
      <Typography
        sx={{
          fontSize: 11.5,
          fontWeight: 700,
          color: "text.secondary",
          textTransform: "uppercase",
          letterSpacing: 0.5,
        }}
      >
        {label}
      </Typography>
      <ToggleButtonGroup
        size="small"
        value={value}
        exclusive
        onChange={(_, next) => {
          if (next) onChange(next);
        }}
        sx={{
          "& .MuiToggleButton-root": {
            px: 1.5,
            py: 0.25,
            fontSize: 12,
            textTransform: "none",
            fontWeight: 500,
          },
        }}
      >
        {options.map((opt) => (
          <ToggleButton key={opt.value} value={opt.value}>
            {opt.label}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>
    </Stack>
  );
}

export default function PlanComplianceDrillPanel({
  section,
  drillRows,
  rawRows,
  productType,
  onClose,
}) {
  const theme = useTheme();
  const cardRef = useRef(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(100);

  const sectionKey = SECTION_NAME[section] ?? section;
  const sectionTitle = (SECTION_TITLE[section] ?? section).toUpperCase();

  const rowsToUse = drillRows?.length ? drillRows : (rawRows ?? []);

  const skuFeedNames =
    sectionKey === "TBM"
      ? {
          fulfilled: "Building_Fulfilled_Qty_sku",
          planned: "Building_Planned_Qty_sku",
        }
      : {
          fulfilled: "Curing_Fulfilled_Qty_sku",
          planned: "Curing_Planned_Qty_sku",
        };

  const parsedSkuData = useMemo(() => {
    // Deduplicate input rows by unique key (date, granularity, kpiName, itemCode, productType, machine)
    const seen = new Set();
    const uniqueRows = [];
    for (const r of rowsToUse) {
      const key = [
        r.date,
        r.granularity,
        r.kpiName || r.kpi_name,
        r.itemCode || r.itemcode,
        r.productType || r.product_type,
        r.machine,
      ].join("||");
      if (seen.has(key)) continue;
      seen.add(key);
      uniqueRows.push(r);
    }

    let fulfilledRows = uniqueRows.filter(
      (r) => (r.kpiName || r.kpi_name) === skuFeedNames.fulfilled,
    );
    let plannedRows = uniqueRows.filter(
      (r) => (r.kpiName || r.kpi_name) === skuFeedNames.planned,
    );

    const aggProduct = AGGREGATE_PRODUCT[sectionKey];
    const isAggProduct =
      !productType ||
      productType === "all" ||
      (aggProduct &&
        canonicalizeProductType(productType) ===
          canonicalizeProductType(aggProduct));

    if (!isAggProduct) {
      const wantPt = canonicalizeProductType(productType);
      fulfilledRows = fulfilledRows.filter(
        (r) =>
          canonicalizeProductType(r.productType || r.product_type) === wantPt,
      );
      plannedRows = plannedRows.filter(
        (r) =>
          canonicalizeProductType(r.productType || r.product_type) === wantPt,
      );
    }

    const itemMap = new Map();

    for (const r of fulfilledRows) {
      const item = r.itemCode || r.itemcode || "UNKNOWN";
      const val = Number(r.actual ?? r.actual_value) || 0;
      const entry = itemMap.get(item) || { item, plan: 0, production: 0 };
      entry.production += val;
      itemMap.set(item, entry);
    }

    for (const r of plannedRows) {
      const item = r.itemCode || r.itemcode || "UNKNOWN";
      const val = Number(r.actual ?? r.actual_value) || 0;
      const entry = itemMap.get(item) || { item, plan: 0, production: 0 };
      entry.plan += val;
      itemMap.set(item, entry);
    }

    // Zero plan + zero production is empty data, not a real comparison —
    // drop it so it never dilutes a tier bucket. Zero plan with ANY
    // production is unplanned output, routed straight to Overproduced
    // instead of through the 90/105 thresholds (which would read the
    // placeholder 100% as Acceptable). Mirrors the same rule in
    // PlanComplianceTrendModal's SKU view.
    return [...itemMap.values()]
      .filter((entry) => entry.plan > 0 || entry.production > 0)
      .map((entry) => {
        const diff = entry.production - entry.plan;
        const hasPlan = entry.plan > 0;
        const statusPct = hasPlan ? (entry.production / entry.plan) * 100 : 100;
        const tier = hasPlan ? getStatusTier(statusPct) : "over";
        return {
          ...entry,
          diff,
          statusPct,
          tier,
        };
      });
  }, [
    rowsToUse,
    skuFeedNames.fulfilled,
    skuFeedNames.planned,
    sectionKey,
    productType,
  ]);

  const filteredRows = useMemo(() => {
    if (statusFilter === "all") return parsedSkuData;
    return parsedSkuData.filter((r) => r.tier === statusFilter);
  }, [parsedSkuData, statusFilter]);

  const totals = useMemo(() => {
    let totalPlan = 0;
    let totalProd = 0;
    for (const r of filteredRows) {
      totalPlan += r.plan;
      totalProd += r.production;
    }
    const totalDiff = totalProd - totalPlan;
    const totalPct = totalPlan > 0 ? (totalProd / totalPlan) * 100 : 0;
    const totalTier = getStatusTier(totalPct);
    return {
      plan: totalPlan,
      production: totalProd,
      diff: totalDiff,
      tier: totalTier,
    };
  }, [filteredRows]);

  const paginatedRows = useMemo(() => {
    const start = page * pageSize;
    return filteredRows.slice(start, start + pageSize);
  }, [filteredRows, page, pageSize]);

  const hasMore = (page + 1) * pageSize < filteredRows.length;

  const handlePageSize = (newSize) => {
    setPageSize(newSize);
    setPage(0);
  };

  const pageStart = page * pageSize;
  const pageEnd = Math.min(pageStart + pageSize, filteredRows.length);

  const columns = [
    {
      key: "item",
      label: "SKU",
      align: "left",
      sortable: true,
      render: (r) => r.item,
    },
    {
      key: "plan",
      label: "PLAN (NOS)",
      align: "right",
      sortable: true,
      value: (r) => r.plan,
      render: (r) => (r.plan != null ? r.plan.toLocaleString() : "—"),
    },
    {
      key: "production",
      label: "PRODUCTION (NOS)",
      align: "right",
      sortable: true,
      value: (r) => r.production,
      render: (r) =>
        r.production != null ? r.production.toLocaleString() : "—",
    },
    {
      key: "diff",
      label: "DEVIATION",
      align: "right",
      sortable: true,
      value: (r) => r.diff,
      render: (r) => <DeviationCell row={r} />,
    },
  ];

  const totalDeviationColor =
    totals.tier === "under"
      ? theme.palette.error.main
      : totals.tier === "acceptable"
        ? theme.palette.success.main
        : theme.palette.warning.main;

  const footerRow = {
    item: `Total (${filteredRows.length} SKUs)`,
    plan: `${totals.plan.toLocaleString()} NOS`,
    production: `${totals.production.toLocaleString()} NOS`,
    diff: (
      <Box
        component="span"
        sx={{ fontWeight: 700, color: totalDeviationColor }}
      >
        {formatDeviation(totals.diff, totals.plan)}
      </Box>
    ),
  };

  const excelHeaders = ["SKU", "Plan", "Production", "Deviation"];
  const excelRows = useMemo(() => {
    return filteredRows.map((r) => ({
      SKU: r.item,
      Plan: `${r.plan.toLocaleString()} NOS`,
      Production: `${r.production.toLocaleString()} NOS`,
      Deviation: formatDeviation(r.diff, r.plan),
    }));
  }, [filteredRows]);

  const legendItems = [
    { label: "Underproduced (<90%)", color: theme.palette.error.main },
    { label: "Acceptable (90%-105%)", color: theme.palette.success.main },
    { label: "Overproduced (>105%)", color: theme.palette.warning.main },
  ];

  const title = `${sectionTitle} — SKU PLAN FULFILLMENT`;

  return (
    <Stack spacing={2} sx={{ position: "relative" }}>
      {/* Row 1: Title and Actions */}
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
          {title}
        </Typography>
        <Stack direction="row" alignItems="center" spacing={1}>
          <CardDownloadButton
            cardRef={cardRef}
            rows={excelRows}
            headers={excelHeaders}
            filename={`Plan_Compliance_${sectionKey}_Drill`}
            sheetName="SKU Plan Fulfillment"
          />
          <DrillCloseButton onClose={onClose} />
        </Stack>
      </Stack>

      {/* Row 2: Status Toggle Group */}
      <Stack direction="row" spacing={3} alignItems="center" flexWrap="wrap">
        <ToggleGroup
          label="Status"
          value={statusFilter}
          onChange={(v) => {
            setStatusFilter(v);
            setPage(0);
          }}
          options={STATUS_FILTER_OPTIONS}
        />
      </Stack>

      {/* Row 3: Meta count info */}
      <Stack direction="row" alignItems="center" spacing={1.5} flexWrap="wrap">
        <Box sx={{ flex: 1 }} />
        <Typography
          sx={{ fontSize: 12, fontWeight: 500, color: "text.secondary" }}
        >
          {filteredRows.length === 0
            ? "0 rows"
            : `${pageStart + 1}–${pageEnd} · page ${page + 1}`}
          {productType ? ` · ${productType}` : ""}
        </Typography>
      </Stack>

      {/* Row 4: Data Table & Pager */}
      <Box ref={cardRef}>
        <DataTable
          columns={columns}
          rows={paginatedRows}
          search={true}
          searchPlaceholder="Search this page..."
          emptyMessage={`No SKU rows for ${sectionKey} matching the selected filter.`}
          legend={legendItems}
          footerRow={filteredRows.length > 0 ? footerRow : null}
        />

        {filteredRows.length > pageSize && (
          <Box sx={{ mt: 1.5 }}>
            <TablePager
              page={page}
              pageSize={pageSize}
              hasMore={hasMore}
              onPageChange={setPage}
              onPageSizeChange={handlePageSize}
              pageSizeOptions={PAGE_SIZE_OPTIONS}
            />
          </Box>
        )}
      </Box>
    </Stack>
  );
}
