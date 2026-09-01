import { useState, useMemo } from "react";
import {
  Box,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  TextField,
  Typography,
  useTheme,
  Autocomplete,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import client from "@/api/client.js";
import { usePolledQuery } from "@/hooks/usePolledQuery.js";
import JKLoader from "@/components/JKLoader.jsx";
import TimeRangeSelect from "@/components/production/TimeRangeSelect.jsx";
import PlanComplianceTrendChart from "./PlanComplianceTrendChart.jsx";
import { presetToDateRange } from "@/lib/timeRange.js";
import { canonicalizeProductType, canonicalizeSubSection } from "@/lib/dashboardRowScopes.js";

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function sectionIdToName(id) {
  return { mix: "Mixing", stk: "Stock", tbm: "TBM", cur: "Curing" }[id] ?? id;
}

function dateKey(d) {
  if (typeof d !== "string") return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d.replaceAll("-", "");
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(d);
  return m ? `${m[3]}${m[2]}${m[1]}` : "";
}

function monthKey(d) {
  const k = dateKey(d);
  return k ? `${k.slice(0, 4)}-${k.slice(4, 6)}` : "";
}

function toDisplayMonth(mKey) {
  if (!mKey || !mKey.includes("-")) return mKey;
  const parts = mKey.split("-");
  const monthIdx = Number.parseInt(parts[1], 10) - 1;
  return MONTH_NAMES[monthIdx] || mKey;
}

function toDisplayDate(d) {
  if (!d) return "";
  const parts = d.split("-");
  if (parts.length === 3) {
    if (parts[0].length === 4) {
      // YYYY-MM-DD
      const day = Number.parseInt(parts[2], 10);
      const monthIdx = Number.parseInt(parts[1], 10) - 1;
      return `${day} ${MONTH_NAMES[monthIdx] || parts[1]}`;
    }
  }
  return d;
}

function ChartSkeleton() {
  return (
    <Box
      sx={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: 280,
      }}
    >
      <JKLoader />
    </Box>
  );
}

function FilterRow({ label, options, value, onChange, placeholder }) {
  return (
    <Stack
      direction="row"
      alignItems="center"
      spacing={1.5}
      sx={{ flexWrap: "wrap" }}
    >
      <Typography
        sx={{
          fontSize: 11,
          fontWeight: 700,
          color: "text.disabled",
          textTransform: "uppercase",
          letterSpacing: 0.6,
          minWidth: 76,
        }}
      >
        {label}
      </Typography>
      <Autocomplete
        multiple
        size="small"
        sx={{ minWidth: 240, maxWidth: 380 }}
        options={options}
        value={value}
        onChange={(_, next) => onChange(next)}
        disableCloseOnSelect
        disabled={options.length === 0}
        renderInput={(params) => (
          <TextField
            {...params}
            placeholder={value.length === 0 ? placeholder : ""}
            variant="outlined"
          />
        )}
      />
    </Stack>
  );
}

function ChartPanel({ theme, title, loading, empty, emptyMessage, children }) {
  return (
    <Box>
      <Typography
        sx={{
          fontSize: 13,
          fontWeight: 700,
          color: "primary.main",
          textTransform: "uppercase",
          letterSpacing: 0.5,
          mb: 1,
        }}
      >
        {title}
      </Typography>
      <Box
        sx={{
          backgroundColor: theme.custom.surface.soft,
          border: 1,
          borderColor: "divider",
          borderRadius: 1.25,
          p: 2,
          minHeight: 340,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {loading && empty ? (
          <ChartSkeleton />
        ) : empty ? (
          <Typography sx={{ fontSize: 13, color: "text.disabled" }}>
            {emptyMessage}
          </Typography>
        ) : (
          children
        )}
      </Box>
    </Box>
  );
}

export default function PlanComplianceTrendModal({
  open,
  onClose,
  plantId,
  kpi,
  section,
  subSection = null,
  productType = null,
  asOf = null,
  range = "month",
  from = "",
  to = "",
  onRangeChange,
  onFromChange,
  onToChange,
}) {
  const theme = useTheme();
  const [selectedSkus, setSelectedSkus] = useState([]);

  // Date range resolution (mirrors the other trend modals)
  const resolved = presetToDateRange({ preset: range, from, to }, asOf);
  const anchorIso = asOf ?? resolved.to ?? null;

  // Monthly: YYYY-01-01 to Today (aggregated month-by-month)
  // Daily: YYYY-MM-01 to Today (aggregated day-by-day in current month)
  // Custom: from to to (aggregated day-by-day)
  const isMonthly = range === "month" && !from && !to;
  const isDailyTrend = range === "today" && !from && !to;

  const monthlyFrom = anchorIso ? `${anchorIso.slice(0, 4)}-01-01` : resolved.from;
  const monthlyTo = anchorIso ?? resolved.to;
  const dailyFrom = anchorIso ? `${anchorIso.slice(0, 7)}-01` : resolved.from;
  const dailyTo = anchorIso ?? resolved.to;

  const rangeFrom = isDailyTrend ? dailyFrom : isMonthly ? monthlyFrom : resolved.from;
  const rangeTo = isDailyTrend ? dailyTo : isMonthly ? monthlyTo : resolved.to;

  const sectionName = sectionIdToName(section);
  const skuFeedNames =
    sectionName === "TBM"
      ? { fulfilled: "Building_Fulfilled_Qty_sku", planned: "Building_Planned_Qty_sku" }
      : { fulfilled: "Curing_Fulfilled_Qty_sku", planned: "Curing_Planned_Qty_sku" };

  const payload = {
    plantId,
    context: {
      section: sectionName,
      category: "Productivity",
      granularity: "DAY",
      ...(subSection ? { sub_section: subSection } : {}),
      ...(productType ? { product_type: productType } : {}),
    },
    from: rangeFrom,
    to: rangeTo,
    drillKpis: [skuFeedNames.fulfilled, skuFeedNames.planned],
    drillOnly: true,
    limit: 10000,
  };

  const { data: rawRows, isLoading } = usePolledQuery(
    () => client.post("/dashboard/kpi-data", payload).then((r) => r.data ?? r),
    {
      enabled: open,
      interval: 0,
      deps: [JSON.stringify(payload), open],
      // Do not render the previous range while the new date/filter request
      // is pending. It can look like a dense or incorrect trend.
      keepPreviousData: false,
    },
  );

  // Extract all unique SKUs and default unit from backend rows
  const { allSkus, backendUnit, perDateData } = useMemo(() => {
    const rows = Array.isArray(rawRows) ? rawRows : [];
    const skuSet = new Set();
    let detectedUnit = kpi?.unit || "NOS";

    // Deduplicate input rows
    const seen = new Set();
    const uniqueRows = [];
    for (const r of rows) {
      const key = [
        r.date,
        r.granularity,
        r.kpi_name || r.kpiName,
        r.itemcode || r.itemCode,
        r.product_type || r.productType,
        r.machine,
      ].join("||");
      if (seen.has(key)) continue;
      seen.add(key);
      uniqueRows.push(r);
    }

    const groupMap = new Map();

    for (const r of uniqueRows) {
      const sku = r.itemcode || r.itemCode;
      if (sku && sku !== "nan" && sku !== "UNKNOWN") {
        skuSet.add(sku);
      }
      if (r.unit_of_measurement && r.unit_of_measurement !== "nan") {
        detectedUnit = r.unit_of_measurement;
      }

      // Filter by selected SKUs if specified
      if (selectedSkus.length > 0 && (!sku || !selectedSkus.includes(sku))) {
        continue;
      }

      const d = r.date;
      if (!d) continue;

      const groupKey = isMonthly ? monthKey(d) : d;
      if (!groupKey) continue;

      const kpiName = r.kpi_name || r.kpiName;
      const val = Number(r.actual_value ?? r.actual) || 0;

      const entry = groupMap.get(groupKey) || {
        key: groupKey,
        displayLabel: isMonthly ? toDisplayMonth(groupKey) : toDisplayDate(groupKey),
        planned: 0,
        produced: 0,
      };
      if (kpiName === skuFeedNames.fulfilled) {
        entry.produced += val;
      } else if (kpiName === skuFeedNames.planned) {
        entry.planned += val;
      }
      groupMap.set(groupKey, entry);
    }

    // Sort chronologically
    const sortedKeys = [...groupMap.keys()].sort((a, b) => a.localeCompare(b));
    const sortedData = sortedKeys.map((k) => {
      const item = groupMap.get(k);
      const fulfillmentPct = item.planned > 0 ? (item.produced / item.planned) * 100 : 0;
      return {
        ...item,
        fulfillmentPct: Math.round(fulfillmentPct * 10) / 10,
      };
    });

    return {
      allSkus: [...skuSet].sort(),
      backendUnit: detectedUnit,
      perDateData: sortedData,
    };
  }, [rawRows, skuFeedNames.fulfilled, skuFeedNames.planned, selectedSkus, kpi?.unit, isMonthly]);

  // Chart parallel arrays
  const chartLabels = useMemo(() => perDateData.map((d) => d.displayLabel), [perDateData]);
  const plannedValues = useMemo(() => perDateData.map((d) => d.planned), [perDateData]);
  const producedValues = useMemo(() => perDateData.map((d) => d.produced), [perDateData]);
  const fulfillmentValues = useMemo(() => perDateData.map((d) => d.fulfillmentPct), [perDateData]);

  const scopeLabel = [
    canonicalizeSubSection(subSection),
    canonicalizeProductType(productType),
  ]
    .filter(Boolean)
    .join(" · ");

  const hasData = perDateData.length > 0;
  const chartTitle = isMonthly
    ? "Plan vs Production Trend — Monthly"
    : "Plan vs Production Trend — Daily";

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth={false}
      fullWidth
      PaperProps={{
        sx: {
          width: { xs: "95vw", sm: "85vw", md: "75vw" },
          maxWidth: "75vw",
          borderRadius: 2,
        },
      }}
    >
      <DialogTitle sx={{ pr: 6, pb: 1 }}>
        <Typography
          sx={{
            fontSize: 11,
            color: "text.disabled",
            textTransform: "uppercase",
            letterSpacing: 0.8,
            fontWeight: 700,
          }}
        >
          KPI Trend Analysis
        </Typography>
        <Stack direction="row" alignItems="baseline" spacing={1}>
          <Typography sx={{ fontSize: 22, fontWeight: 700 }}>
            {kpi?.name || "SKU Plan Fulfillment"}
          </Typography>
          <Typography sx={{ fontSize: 14, color: "text.disabled" }}>
            (%)
          </Typography>
        </Stack>
        <IconButton
          aria-label="Close"
          onClick={onClose}
          sx={{ position: "absolute", top: 12, right: 12 }}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent
        dividers
        sx={{ display: "flex", flexDirection: "column", gap: 2 }}
      >
        <TimeRangeSelect
          preset={range}
          variant="trend"
          presetLabels={{ today: "Daily", month: "Monthly", year: "Yearly" }}
          from={from}
          to={to}
          onPresetChange={(p) => {
            const next = typeof p === "string" ? p : p?.preset ?? "month";
            onRangeChange(next);
            onFromChange("");
            onToChange("");
          }}
          onFromChange={(v) => {
            onFromChange(v);
            onRangeChange("custom");
          }}
          onToChange={(v) => {
            onToChange(v);
            onRangeChange("custom");
          }}
        />

        <Stack spacing={1.25}>
          {scopeLabel && (
            <Typography sx={{ fontSize: 11, color: "text.disabled" }}>
              Scoped to {scopeLabel} — set on the dashboard.
            </Typography>
          )}

          <FilterRow
            label="SKU"
            options={allSkus}
            value={selectedSkus}
            onChange={setSelectedSkus}
            placeholder="All SKUs"
          />
        </Stack>

        <ChartPanel
          theme={theme}
          title={chartTitle}
          loading={isLoading}
          empty={!hasData}
          emptyMessage={
            isLoading
              ? "Loading…"
              : "No trend data for this period — try another date range or SKU."
          }
        >
          {hasData && (
            <PlanComplianceTrendChart
              labels={chartLabels}
              plannedValues={plannedValues}
              producedValues={producedValues}
              fulfillmentValues={fulfillmentValues}
              unit={backendUnit}
            />
          )}
        </ChartPanel>
      </DialogContent>
    </Dialog>
  );
}
