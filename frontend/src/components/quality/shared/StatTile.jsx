/**
 * Small label + value tile (e.g. Inspected / Rejected above a drill table).
 * Tiles in a flex row share the width equally.
 * @param {{ label: string, value: import("react").ReactNode,
 *   sub?: import("react").ReactNode, color?: string }} props
 */
import { Box, Typography } from "@mui/material";
import { C } from "./theme.js";

export function StatTile({ label, value, sub, color }) {
  return (
    <Box
      sx={{
        flex: 1,
        minWidth: 118,
        background: C.c2,
        border: "1px solid " + C.bd,
        borderRadius: "8px",
        padding: "9px 11px",
      }}
    >
      <Typography
        sx={{
          fontSize: 10.5,
          color: C.mu,
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: ".3px",
        }}
      >
        {label}
      </Typography>
      <Typography
        sx={{ fontSize: 18, fontWeight: 700, color: color || C.tx, mt: "2px" }}
      >
        {value}
      </Typography>
      {sub && (
        <Typography sx={{ fontSize: 10.5, color: C.mu, mt: "1px" }}>
          {sub}
        </Typography>
      )}
    </Box>
  );
}
