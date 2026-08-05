import { Box, Typography, useTheme } from "@mui/material";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import DataTable from "@/components/tables/DataTable.jsx";
import { thresholdColor } from "./thresholds.js";

/**
 * Machine-wise breakdown table (BRD FR-P31 through FR-P37). Columns:
 * Machine, OEE %, Availability %, Performance %, Quality %.
 *
 * OEE % is display-only. A/P/Q cells are independently clickable;
 * the selected cell is filled-background + light text, others use
 * the threshold colour for their value. Rendered through the shared
 * DataTable so it gains search, column sorting and a Machine filter.
 */
function MachineTable({ machines, selectedCell, onSelectCell }) {
  const columns = [
    { key: "name", label: "Machine", align: "left" },
    {
      key: "oee",
      label: "OEE %",
      filterable: false,
      value: (m) => Number(oee(m)),
      render: (m) => (
        <Typography component="span" sx={{ fontSize: 13, fontWeight: 600 }}>
          {oee(m)}
        </Typography>
      ),
    },
    componentColumn("availability", "Availability %"),
    componentColumn("performance", "Performance %"),
    componentColumn("quality", "Quality %"),
  ];

  function componentColumn(component, label) {
    return {
      key: component,
      label,
      filterable: false,
      value: (m) => m[component],
      render: (m) => (
        <ComponentCell
          component={component}
          value={m[component]}
          selected={
            selectedCell?.machineId === m.id &&
            selectedCell?.component === component
          }
          onClick={() => onSelectCell(m.id, component)}
        />
      ),
    };
  }

  return (
    <DataTable
      columns={columns}
      rows={machines}
      getRowKey={(m) => m.id}
      maxHeight={340}
      searchPlaceholder="Search machine…"
      emptyMessage="No machines for this selection."
    />
  );
}

function ComponentCell({ component, value, selected, onClick }) {
  const theme = useTheme();
  const color = thresholdColor(theme, component, value);
  return (
    <Box
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      sx={{
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        gap: 0.25,
        px: 1,
        py: 0.25,
        borderRadius: 1,
        fontWeight: 600,
        color: selected ? "primary.contrastText" : color,
        backgroundColor: selected ? color : "transparent",
        transition: "background-color 0.15s",
        "&:hover": {
          backgroundColor: selected ? color : theme.custom.surface.soft,
        },
      }}
    >
      <Typography component="span" sx={{ fontSize: 13, fontWeight: 600 }}>
        {value.toFixed(1)}
      </Typography>
      <ChevronRightIcon sx={{ fontSize: 16, opacity: selected ? 1 : 0.6 }} />
    </Box>
  );
}

function oee({ availability, performance, quality }) {
  return ((availability * performance * quality) / 10000).toFixed(1);
}

export default MachineTable;
