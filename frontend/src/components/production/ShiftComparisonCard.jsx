import { Box, Typography } from "@mui/material";
import { DrillTable } from "@/components/drills/shared/DrillTable.jsx";

/**
 * Shift Comparison card — appears below KPI grid, Productivity tab only.
 * Matches artifact exactly: Shift | Plan | Actual | FTQ% | OEE%
 *
 * @param {string} section - MIX | TBM | CUR | STK (maps to unit)
 * @param {number} oee  - section OEE value
 * @param {number} scrap - section scrap %
 */
export default function ShiftComparisonCard({
  section,
  oee = 91.5,
  scrap = 0.5,
}) {
  // Unit by section: MIX=MT, STK=units, else=nos
  const unit = section === "MIX" ? "MT" : section === "STK" ? "units" : "nos";

  const rows = [
    [
      "Shift A",
      String(Math.round(oee * 4.2)),
      String(Math.round(oee * 3.9)),
      `${(100 - scrap - 0.3).toFixed(1)}%`,
      `${(oee + 1.5).toFixed(1)}%`,
    ],
    [
      "Shift B",
      String(Math.round(oee * 3.8)),
      String(Math.round(oee * 3.2)),
      `${(100 - scrap - 1.5).toFixed(1)}%`,
      `${(oee - 3).toFixed(1)}%`,
    ],
    [
      "Shift C",
      String(Math.round(oee * 3.5)),
      String(Math.round(oee * 3.3)),
      `${(100 - scrap).toFixed(1)}%`,
      `${(oee - 0.5).toFixed(1)}%`,
    ],
  ];

  return (
    <Box
      sx={{
        border: 1,
        borderColor: "divider",
        borderRadius: 1.25,
        p: 2,
      }}
    >
      <Typography
        sx={{
          fontSize: 13,
          fontWeight: 600,
          color: "primary.main",
          mb: 1.5,
        }}
      >
        Shift Comparison
      </Typography>
      <DrillTable
        cols={["Shift", `Plan (${unit})`, `Actual (${unit})`, "FTQ%", "OEE%"]}
        rows={rows}
      />
    </Box>
  );
}
