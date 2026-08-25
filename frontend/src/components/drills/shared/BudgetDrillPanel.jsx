import { useRef } from "react";
import { Stack, Typography, Box } from "@mui/material";
import { Donut } from "@/components/drills/shared/Donut.jsx";
import { Stat } from "@/components/drills/shared/Stat.jsx";
import { formatIndianNumber } from "@/lib/numberFormat.js";
import CardDownloadButton from "@/components/CardDownloadButton.jsx";

/**
 * Budget Util. drill panel.
 * Matches artifact drillType:"budget" exactly.
 * Shows donut chart + allocated/spent labels.
 */
export default function BudgetDrillPanel({ drillRows }) {
  const cardRef = useRef(null);
  // From drill rows: actual = spent, threshold_value = allocated
  const spent =
    drillRows && drillRows.length > 0
      ? drillRows.reduce((s, r) => s + (r.actual ?? 0), 0)
      : 23.8;
  const allocated =
    drillRows && drillRows.length > 0
      ? drillRows.reduce((s, r) => s + (r.threshold_value ?? 0), 0)
      : 28.0;
  const consumedPct = allocated > 0 ? Math.round((spent / allocated) * 100) : 0;

  return (
    <Stack spacing={2}>
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
          Budget Utilization
        </Typography>
        <CardDownloadButton
          cardRef={cardRef}
          rows={[
            {
              Metric: "Allocated Consumables",
              Value: formatIndianNumber(allocated, { decimals: 1 }),
              Unit: "₹ L",
            },
            {
              Metric: "Spent Consumables",
              Value: formatIndianNumber(spent, { decimals: 1 }),
              Unit: "₹ L",
            },
            { Metric: "Consumed", Value: `${consumedPct}`, Unit: "%" },
          ]}
          headers={["Metric", "Value", "Unit"]}
          filename="drill-budget-utilization"
          sheetName="Budget"
        />
      </Stack>
      <Box
        ref={cardRef}
        sx={{
          display: "flex",
          gap: 3,
          p: 2,
          border: 1,
          borderColor: "divider",
          borderRadius: 1.25,
          alignItems: "center",
        }}
      >
        <Donut value={consumedPct} />
        <Stack spacing={1}>
          <Stat
            label="Allocated Consumables"
            value={`₹${formatIndianNumber(allocated, { decimals: 1 })} L`}
          />
          <Stat
            label="Spent Consumables"
            value={`₹${formatIndianNumber(spent, { decimals: 1 })} L`}
            accent="amber"
          />
        </Stack>
      </Box>
    </Stack>
  );
}
