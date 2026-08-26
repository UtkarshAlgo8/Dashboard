import { useState } from "react";
import { Box, Stack, Typography, useTheme } from "@mui/material";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import { EmptyState } from "@/components/common";
import DataTable from "@/components/tables/DataTable.jsx";
import { formatIndianNumber } from "@/lib/numberFormat.js";

/**
 * Per-machine sub-drill panel (BRD FR-P38 through FR-P42).
 *
 * Renders the left-edge accent bar in the component colour
 * (Availability blue, Performance amber, Quality teal — per FR-P38),
 * breadcrumb, sub-category pills, and the detail table for the
 * active (machine, component, subCategory) tuple.
 *
 * Empty-state copy comes from `FR-P42`. Scrap rows in spec 06 do NOT
 * show the "Trace ▸" UI — spec 08 adds the traceability column.
 */

const COMPONENT_NAMES = {
  availability: "Availability",
  performance: "Performance",
  quality: "Quality",
};

const ACCENT_COLOR_KEY = {
  availability: "blue",
  performance: "amber",
  quality: "teal",
};

function SubDrill({
  machine,
  component,
  subCategory,
  subCategories,
  onSelectSubCategory,
  rows,
  rowsByDate = [],
  activeTraceItemCode,
  onTraceRowClick,
  accentTier,
}) {
  const theme = useTheme();
  // Availability / Performance leaves can be viewed grouped BY REASON (totals)
  // or BY DATE (one row per dated record). Quality leaves have no such toggle.
  const [detailView, setDetailView] = useState("reason");
  const canToggleView = component !== "quality";
  const view = canToggleView ? detailView : "reason";
  const detailRows = view === "date" ? rowsByDate : rows;
  // Accent follows the selected cell's status tier (green/amber/red) so
  // the drill box highlight matches the highlighted cell. Falls back to
  // the per-component colour if no tier is supplied.
  const accent = accentTier
    ? theme.custom.brand[accentTier]
    : theme.custom.brand[ACCENT_COLOR_KEY[component]];
  // Sub-categories are the OEE-loss reason leaves read from the data
  // (drill_down_attribute), passed in by OeeDrillPanel — no longer a frozen
  // per-component list. Each leaf's kpi_name is both id and label.
  const subCats = subCategories ?? [];
  const activeSub = subCats.find((s) => s.id === subCategory) ?? null;

  return (
    <Box
      sx={{
        backgroundColor: "background.paper",
        border: 1,
        borderColor: "divider",
        borderLeft: 4,
        borderLeftColor: accent,
        borderRadius: 1.25,
        p: 2,
        mt: 2,
        boxShadow: theme.custom.shadow,
      }}
    >
      <Typography
        sx={{ fontSize: 11.5, fontWeight: 500, color: "text.secondary" }}
      >
        OE › {machine.name} › {COMPONENT_NAMES[component]}
      </Typography>
      <Typography sx={{ fontSize: 14, fontWeight: 600, mb: 1.5 }}>
        {machine.name} — {COMPONENT_NAMES[component]} Sub-categories
      </Typography>

      <Stack
        direction="row"
        spacing={1}
        useFlexGap
        flexWrap="wrap"
        sx={{ mb: 2 }}
      >
        {subCats.map((sc) => {
          const isActive = sc.id === subCategory;
          return (
            <Box
              key={sc.id}
              onClick={() => onSelectSubCategory(sc.id)}
              sx={{
                px: 1.5,
                py: 0.5,
                borderRadius: 999,
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
                color: isActive ? "primary.contrastText" : accent,
                backgroundColor: isActive ? accent : "transparent",
                border: 1,
                borderColor: accent,
                "&:hover": {
                  backgroundColor: isActive ? accent : `${accent}1A`,
                },
              }}
            >
              {sc.name}
            </Box>
          );
        })}
      </Stack>

      {activeSub ? (
        <>
          {canToggleView && (
            <Stack direction="row" spacing={1} sx={{ mb: 1.5 }}>
              {[
                { id: "reason", label: "By reason" },
                { id: "date", label: "By date" },
              ].map((opt) => {
                const isActive = view === opt.id;
                return (
                  <Box
                    key={opt.id}
                    onClick={() => setDetailView(opt.id)}
                    sx={{
                      px: 1.5,
                      py: 0.4,
                      borderRadius: 999,
                      fontSize: 11,
                      fontWeight: 600,
                      cursor: "pointer",
                      color: isActive ? "primary.contrastText" : accent,
                      backgroundColor: isActive ? accent : "transparent",
                      border: 1,
                      borderColor: accent,
                      "&:hover": {
                        backgroundColor: isActive ? accent : `${accent}1A`,
                      },
                    }}
                  >
                    {opt.label}
                  </Box>
                );
              })}
            </Stack>
          )}
          {detailRows && detailRows.length > 0 ? (
            <DetailTable
              component={component}
              subCategory={subCategory}
              rows={detailRows}
              view={view}
              activeTraceItemCode={activeTraceItemCode}
              onTraceRowClick={onTraceRowClick}
            />
          ) : (
            <Box
              sx={{
                border: 1,
                borderStyle: "dashed",
                borderColor: "divider",
                borderRadius: 1.25,
                p: 3,
              }}
            >
              <EmptyState
                title={`No ${activeSub.name} recorded`}
                description={`No ${activeSub.name} recorded for ${machine.name} in this period.`}
              />
            </Box>
          )}
        </>
      ) : (
        <Typography sx={{ fontSize: 12, color: "text.disabled" }}>
          Select a sub-category to see details.
        </Typography>
      )}
    </Box>
  );
}

function DetailTable({
  component,
  subCategory,
  rows,
  view = "reason",
  activeTraceItemCode,
  onTraceRowClick,
}) {
  // Column shape varies by component (availability/performance leaves share
  // the reason/events/duration shape; quality leaves show item-code detail,
  // with the scrap leaf adding the Trace column). The "date" view swaps the
  // Events count for a per-record Date column. Rendered through the shared
  // DataTable so every leaf gains search, column sorting and value filters.
  const columns = columnsFor(component, subCategory, view);
  const isScrap = component === "quality" && /scrap/i.test(subCategory ?? "");

  return (
    <DataTable
      columns={columns}
      rows={rows}
      maxHeight={280}
      searchPlaceholder="Search…"
      emptyMessage="No records."
      onRowClick={
        isScrap
          ? (row) => row.traceable && onTraceRowClick(row.itemCode)
          : undefined
      }
      rowSx={
        isScrap
          ? (row) =>
              row.itemCode === activeTraceItemCode
                ? { backgroundColor: "primary.light" }
                : {}
          : undefined
      }
    />
  );
}

// Availability loss-reason leaves: Category (inferred) + Reason + Events +
// Duration. Performance leaves drop the Category column.
const AVAILABILITY_COLUMNS = [
  { key: "reasonCategory", label: "Category", align: "center" },
  { key: "reason", label: "Reason", align: "center" },
  {
    key: "events",
    label: "Events",
    filterable: false,
    render: (r) => formatIndianNumber(r.events),
  },
  {
    key: "durationMin",
    label: "Duration (min)",
    filterable: false,
    render: (r) => formatIndianNumber(r.durationMin),
  },
];

const PERFORMANCE_COLUMNS = [
  { key: "reason", label: "Reason", align: "center" },
  {
    key: "events",
    label: "Events",
    filterable: false,
    render: (r) => formatIndianNumber(r.events),
  },
  {
    key: "durationMin",
    label: "Duration (min)",
    filterable: false,
    render: (r) => formatIndianNumber(r.durationMin),
  },
];

// Timestamp-wise (By date) variants: one row per dated record — Events is
// dropped (each row is a single occurrence) and a Date column is added.
const AVAILABILITY_DATE_COLUMNS = [
  { key: "date", label: "Date", align: "center" },
  { key: "reasonCategory", label: "Category", align: "center" },
  { key: "reason", label: "Reason", align: "center" },
  {
    key: "durationMin",
    label: "Duration (min)",
    filterable: false,
    render: (r) => formatIndianNumber(r.durationMin),
  },
];

const PERFORMANCE_DATE_COLUMNS = [
  { key: "date", label: "Date", align: "center" },
  { key: "reason", label: "Reason", align: "center" },
  {
    key: "durationMin",
    label: "Duration (min)",
    filterable: false,
    render: (r) => formatIndianNumber(r.durationMin),
  },
];

const DEFECT_COLUMNS = [
  { key: "itemCode", label: "Item Code", align: "center" },
  { key: "defectType", label: "Defect Type", align: "center" },
  {
    key: "qty",
    label: "Defect Qty",
    filterable: false,
    render: (r) => formatIndianNumber(r.qty),
  },
  {
    key: "totalProduced",
    label: "Total Produced",
    filterable: false,
    render: (r) => formatIndianNumber(r.totalProduced),
  },
  {
    key: "rate",
    label: "Rate %",
    filterable: false,
    value: (r) => (r.qty / r.totalProduced) * 100,
    render: (r) => ((r.qty / r.totalProduced) * 100).toFixed(2),
  },
];

const SCRAP_COLUMNS = [
  { key: "itemCode", label: "Item Code", align: "center" },
  {
    key: "qty",
    label: "Scrap Qty (kg)",
    filterable: false,
    render: (r) => formatIndianNumber(r.qty),
  },
  {
    key: "traceable",
    label: "Trace",
    sortable: false,
    filterable: false,
    render: (r) =>
      r.traceable ? (
        <Box
          component="span"
          sx={{
            display: "inline-flex",
            alignItems: "center",
            gap: 0.25,
            color: "text.disabled",
          }}
        >
          Trace
          <ChevronRightIcon sx={{ fontSize: 14 }} />
        </Box>
      ) : (
        "—"
      ),
  },
];

/**
 * Resolve the detail-table columns for a component + leaf kpi_name. Leaf
 * names are read from the data, so we key off the component (and, for
 * quality, whether the leaf is a scrap leaf) rather than a frozen id.
 */
function columnsFor(component, subCategory, view = "reason") {
  if (component === "quality") {
    return /scrap/i.test(subCategory ?? "") ? SCRAP_COLUMNS : DEFECT_COLUMNS;
  }
  if (component === "availability") {
    return view === "date" ? AVAILABILITY_DATE_COLUMNS : AVAILABILITY_COLUMNS;
  }
  return view === "date" ? PERFORMANCE_DATE_COLUMNS : PERFORMANCE_COLUMNS;
}

export default SubDrill;
