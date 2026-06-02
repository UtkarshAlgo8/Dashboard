import {
  Box,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  useTheme,
} from "@mui/material";

/**
 * Item-level Live Inventory table per BRD FR-P65 + summary strip
 * per FR-P66.
 */
function InventoryItemTable({ bar }) {
  const theme = useTheme();
  if (!bar) return null;
  const total = bar.items.reduce((acc, it) => acc + it.liveStock, 0);

  return (
    <Box
      sx={{
        backgroundColor: "background.paper",
        border: 1,
        borderColor: "divider",
        borderRadius: 1.25,
        p: 2,
        mt: 2,
      }}
    >
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        spacing={1.5}
        sx={{ mb: 1.5 }}
      >
        <Box>
          <Typography sx={{ fontSize: 11, color: "text.disabled" }}>
            Live Inventory
          </Typography>
          <Typography sx={{ fontSize: 14, fontWeight: 700 }}>
            {bar.label} — {bar.items.length} item
            {bar.items.length !== 1 ? "s" : ""}
          </Typography>
        </Box>
        <Box sx={{ textAlign: "right" }}>
          <Typography sx={{ fontSize: 11, color: "text.disabled" }}>
            Total
          </Typography>
          <Typography
            sx={{
              fontSize: 20,
              fontWeight: 700,
              color: theme.palette.primary.main,
            }}
          >
            {total.toLocaleString()}{" "}
            <Typography
              component="span"
              sx={{ fontSize: 12, color: "text.disabled" }}
            >
              {bar.unit}
            </Typography>
          </Typography>
        </Box>
      </Stack>

      <TableContainer
        sx={{
          maxHeight: 320,
          border: 1,
          borderColor: "divider",
          borderRadius: 1.25,
        }}
      >
        <Table
        size="small"
        stickyHeader
        sx={(t) => ({
          "& .MuiTableCell-root": {
            border: "1px solid",
            borderColor: t.palette.divider,
          },
          "& thead .MuiTableCell-root": {
            backgroundColor: t.custom.surface.soft,
          },
        })}
      >
          <TableHead>
            <TableRow>
              <Th align="center">Item Code</Th>
              <Th align="center">Description</Th>
              <Th>Live Stock</Th>
            </TableRow>
          </TableHead>
          <TableBody>
            {bar.items.map((it) => (
              <TableRow key={it.itemCode} hover>
                <TableCell sx={{ fontSize: 13, fontFamily: "monospace" }}>
                  {it.itemCode}
                </TableCell>
                <TableCell sx={{ fontSize: 13 }}>{it.description}</TableCell>
                <TableCell align="center" sx={{ fontSize: 16, fontWeight: 700 }}>
                  {it.liveStock.toLocaleString()}{" "}
                  <Typography
                    component="span"
                    sx={{
                      fontSize: 11,
                      color: "text.disabled",
                      fontWeight: 500,
                    }}
                  >
                    {it.unit}
                  </Typography>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}

function Th({ children, align = "center" }) {
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

export default InventoryItemTable;
