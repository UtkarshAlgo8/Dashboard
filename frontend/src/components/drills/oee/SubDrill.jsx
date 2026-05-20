import { Box, Stack, Typography, useTheme } from "@mui/material";
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
} from "@mui/material";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import { EmptyState } from "@/components/common";

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

const SUB_CATEGORIES = {
  availability: [
    { id: "breakdown", name: "Breakdown" },
    { id: "setupAdjustment", name: "Setup & Adjustment" },
    { id: "startup", name: "Startup" },
    { id: "toolChange", name: "Tool Change" },
  ],
  performance: [
    { id: "minorStoppage", name: "Minor Stoppage" },
    { id: "reducedSpeed", name: "Reduced Speed" },
  ],
  quality: [
    { id: "defect", name: "Defect" },
    { id: "scrap", name: "Scrap" },
  ],
};

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
  onSelectSubCategory,
  rows,
  activeTraceItemCode,
  onTraceRowClick,
}) {
  const theme = useTheme();
  const accent = theme.custom.brand[ACCENT_COLOR_KEY[component]];
  const subCats = SUB_CATEGORIES[component] ?? [];
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
      <Typography sx={{ fontSize: 11, color: "text.disabled" }}>
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
        rows && rows.length > 0 ? (
          <DetailTable
            component={component}
            subCategory={subCategory}
            rows={rows}
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
        )
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
  activeTraceItemCode,
  onTraceRowClick,
}) {
  // Column shape varies by (component, subCategory)
  const columns = COLUMNS[`${component}/${subCategory}`] ?? COLUMNS.default;
  const isScrap = component === "quality" && subCategory === "scrap";

  return (
    <TableContainer
      sx={{
        maxHeight: 280,
        border: 1,
        borderColor: "divider",
        borderRadius: 1.25,
      }}
    >
      <Table size="small" stickyHeader>
        <TableHead>
          <TableRow>
            {columns.map((c) => (
              <TableCell
                key={c.key}
                align={c.align ?? "right"}
                sx={{
                  fontSize: 11,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: 0.6,
                  color: "text.disabled",
                  backgroundColor: "background.paper",
                  borderBottom: 1,
                  borderColor: "divider",
                }}
              >
                {c.label}
              </TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((row, i) => {
            const traceable = isScrap && row.traceable;
            const active = traceable && row.itemCode === activeTraceItemCode;
            return (
              <TableRow
                key={i}
                hover={!traceable}
                onClick={
                  traceable ? () => onTraceRowClick(row.itemCode) : undefined
                }
                sx={{
                  cursor: traceable ? "pointer" : "default",
                  backgroundColor: active ? "primary.light" : undefined,
                  "&:hover": traceable
                    ? { backgroundColor: "primary.light" }
                    : undefined,
                }}
              >
                {columns.map((c) => (
                  <TableCell
                    key={c.key}
                    align={c.align ?? "right"}
                    sx={{ fontSize: 13 }}
                  >
                    {c.render ? c.render(row) : row[c.key]}
                  </TableCell>
                ))}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

const COLUMNS = {
  "availability/breakdown": [
    { key: "reasonCategory", label: "Category", align: "left" },
    { key: "reason", label: "Reason", align: "left" },
    { key: "events", label: "Events" },
    { key: "durationMin", label: "Duration (min)" },
  ],
  "availability/setupAdjustment": [
    { key: "reason", label: "Reason", align: "left" },
    { key: "events", label: "Events" },
    { key: "durationMin", label: "Duration (min)" },
  ],
  "availability/startup": [
    { key: "reason", label: "Reason", align: "left" },
    { key: "events", label: "Events" },
    { key: "durationMin", label: "Duration (min)" },
  ],
  "availability/toolChange": [
    { key: "reason", label: "Reason", align: "left" },
    { key: "events", label: "Events" },
    { key: "durationMin", label: "Duration (min)" },
  ],
  "performance/minorStoppage": [
    { key: "reason", label: "Reason", align: "left" },
    { key: "events", label: "Events" },
    { key: "durationMin", label: "Duration (min)" },
  ],
  "performance/reducedSpeed": [
    { key: "reason", label: "Reason", align: "left" },
    { key: "events", label: "Events" },
    { key: "durationMin", label: "Duration (min)" },
  ],
  "quality/defect": [
    { key: "itemCode", label: "Item Code", align: "left" },
    { key: "defectType", label: "Defect Type", align: "left" },
    { key: "qty", label: "Defect Qty" },
    { key: "totalProduced", label: "Total Produced" },
    {
      key: "rate",
      label: "Rate %",
      render: (r) => ((r.qty / r.totalProduced) * 100).toFixed(2),
    },
  ],
  "quality/scrap": [
    { key: "itemCode", label: "Item Code", align: "left" },
    { key: "qty", label: "Scrap Qty (kg)" },
    {
      key: "traceable",
      label: "Trace",
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
  ],
  default: [
    { key: "reason", label: "Reason", align: "left" },
    { key: "events", label: "Events" },
    { key: "durationMin", label: "Duration (min)" },
  ],
};

export default SubDrill;
