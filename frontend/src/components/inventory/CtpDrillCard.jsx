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
} from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";

import { formatIndianNumber } from "@/lib/numberFormat.js";

/**
 * SKU-level drill for the open insight card.
 *
 * @param {object} props
 * @param {object} props.cfg - insight_cards[] entry
 * @param {object} props.result - computeInsightCard() output
 * @param {string} props.color
 */
function CtpDrillCard({ cfg, result, color }) {
  const theme = useTheme();
  const isOldest = cfg.type === "oldest_blocked";
  const headers = isOldest
    ? ["Item_Code", "Quantity", "UOM", "Oldest lot (days)"]
    : ["Item_Code", "Quantity", "UOM"];
  const rows = result.drill
    .slice()
    .sort((a, b) => (isOldest ? b.age - a.age : b.qty - a.qty));
  const red = theme.custom.brand.red;

  return (
    <Box
      sx={{
        backgroundColor: "background.paper",
        border: 1,
        borderColor: "divider",
        borderTop: `3px solid ${color}`,
        borderRadius: 1.25,
        px: { xs: 1.25, md: 2 },
        py: 1.5,
        boxShadow: theme.custom.shadow,
      }}
    >
      <Typography
        sx={{
          color: "text.secondary",
          fontSize: 14,
          fontWeight: 800,
          textTransform: "uppercase",
          mb: 1,
        }}
      >
        {`${cfg.title} — SKU level detail`}
      </Typography>
      {result.chips?.length > 0 && (
        <Stack direction="row" sx={{ flexWrap: "wrap", gap: 0.75, mb: 1 }}>
          {result.chips.map((c) => (
            <Box
              key={c.k}
              component="span"
              sx={{
                fontSize: 12,
                px: 1,
                py: 0.25,
                borderRadius: 0.75,
                backgroundColor: alpha(red, 0.08),
                color: red,
                fontWeight: 600,
              }}
            >
              {`${c.k} · ${c.d.toFixed(1)} d`}
            </Box>
          ))}
        </Stack>
      )}
      {rows.length ? (
        <TableContainer sx={{ maxHeight: 360 }}>
          <Table stickyHeader size="small">
            <TableHead>
              <TableRow>
                {headers.map((h, i) => (
                  <TableCell
                    key={h}
                    align={i === 0 ? "left" : "right"}
                    sx={{
                      fontSize: 11,
                      fontWeight: 800,
                      textTransform: "uppercase",
                    }}
                  >
                    {h}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((d) => (
                <TableRow key={d.item} hover>
                  <TableCell
                    sx={{
                      fontSize: 12.5,
                      fontFamily: "ui-monospace, Menlo, monospace",
                    }}
                  >
                    {d.item}
                  </TableCell>
                  <TableCell align="right" sx={{ fontSize: 12.5 }}>
                    {formatIndianNumber(Math.round(d.qty))}
                  </TableCell>
                  <TableCell align="right" sx={{ fontSize: 12.5 }}>
                    {d.uom}
                  </TableCell>
                  {isOldest && (
                    <TableCell align="right" sx={{ fontSize: 12.5 }}>
                      {d.age.toFixed(1)}
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      ) : (
        <Typography sx={{ fontSize: 12.5, color: "text.disabled" }}>
          Nothing to show for the current filters.
        </Typography>
      )}
      <Typography sx={{ fontSize: 11, color: "text.disabled", mt: 0.75 }}>
        {cfg.type === "cover_below"
          ? `Quantity = usable stock of each item in the product types below ${cfg.threshold_days} day cover.`
          : "Quantity = sum over lots in scope, grouped by item code."}
      </Typography>
    </Box>
  );
}

export default CtpDrillCard;
