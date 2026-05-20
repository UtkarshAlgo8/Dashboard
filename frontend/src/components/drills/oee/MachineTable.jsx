import {
  Box,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  useTheme,
} from "@mui/material";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import { thresholdColor } from "./thresholds.js";

/**
 * Machine-wise breakdown table (BRD FR-P31 through FR-P37). Columns:
 * Machine, OEE %, Availability %, Performance %, Quality %.
 *
 * OEE % is display-only. A/P/Q cells are independently clickable;
 * the selected cell is filled-background + light text, others use
 * the threshold colour for their value.
 */
function MachineTable({ machines, selectedCell, onSelectCell }) {
  return (
    <TableContainer
      sx={{
        maxHeight: 340,
        border: 1,
        borderColor: "divider",
        borderRadius: 1.25,
      }}
    >
      <Table size="small" stickyHeader>
        <TableHead>
          <TableRow>
            <Th align="left">Machine</Th>
            <Th>OEE %</Th>
            <Th>Availability %</Th>
            <Th>Performance %</Th>
            <Th>Quality %</Th>
          </TableRow>
        </TableHead>
        <TableBody>
          {machines.map((m) => (
            <TableRow key={m.id} hover>
              <TableCell sx={{ fontSize: 13, fontWeight: 600 }}>
                {m.name}
              </TableCell>
              <TableCell align="right" sx={{ fontSize: 13, fontWeight: 600 }}>
                {oee(m)}
              </TableCell>
              <ComponentCell
                machineId={m.id}
                component="availability"
                value={m.availability}
                selected={
                  selectedCell?.machineId === m.id &&
                  selectedCell?.component === "availability"
                }
                onClick={() => onSelectCell(m.id, "availability")}
              />
              <ComponentCell
                machineId={m.id}
                component="performance"
                value={m.performance}
                selected={
                  selectedCell?.machineId === m.id &&
                  selectedCell?.component === "performance"
                }
                onClick={() => onSelectCell(m.id, "performance")}
              />
              <ComponentCell
                machineId={m.id}
                component="quality"
                value={m.quality}
                selected={
                  selectedCell?.machineId === m.id &&
                  selectedCell?.component === "quality"
                }
                onClick={() => onSelectCell(m.id, "quality")}
              />
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

function Th({ children, align = "right" }) {
  return (
    <TableCell
      align={align}
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
      {children}
    </TableCell>
  );
}

function ComponentCell({ component, value, selected, onClick }) {
  const theme = useTheme();
  const color = thresholdColor(theme, component, value);
  return (
    <TableCell
      onClick={onClick}
      align="right"
      sx={{
        cursor: "pointer",
        fontSize: 13,
        fontWeight: 600,
        color: selected ? "primary.contrastText" : color,
        backgroundColor: selected ? color : "transparent",
        transition: "background-color 0.15s",
        "&:hover": {
          backgroundColor: selected ? color : theme.custom.surface.soft,
        },
      }}
    >
      <Box
        sx={{
          display: "inline-flex",
          alignItems: "center",
          gap: 0.25,
        }}
      >
        <Typography component="span" sx={{ fontSize: 13, fontWeight: 600 }}>
          {value.toFixed(1)}
        </Typography>
        <ChevronRightIcon sx={{ fontSize: 16, opacity: selected ? 1 : 0.6 }} />
      </Box>
    </TableCell>
  );
}

function oee({ availability, performance, quality }) {
  return ((availability * performance * quality) / 10000).toFixed(1);
}

export default MachineTable;
