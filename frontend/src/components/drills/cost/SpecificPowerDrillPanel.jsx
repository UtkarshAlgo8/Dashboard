import { Stack } from "@mui/material";
import { DrillTable } from "@/components/drills/shared/DrillTable.jsx";

/**
 * Specific Power drill panel — Machine-wise specific power.
 * Columns: Machine | kWh | Output | Sp. Power | Target | Variance
 *
 * actual = kWh consumed, drillDown[0] = MT output (if present),
 * itemCode = machine name, productType = target.
 * Variance = actual_sp - target.
 */
export default function SpecificPowerDrillPanel({ drillRows }) {
  const rows = (drillRows ?? []).map((r) => {
    const machine = r.machine ?? r.itemCode ?? "—";
    const kwh = r.actual ?? 0;
    const outputMT =
      r.drillDown?.[0] ?? (r.productType ? Number(r.productType) : 0) ?? 40;
    const sp = outputMT > 0 ? (kwh / outputMT).toFixed(1) : "—";
    const target = r.threshold_value ?? r.drillDown?.[1] ?? 6.5;
    const variance = outputMT > 0 ? (kwh / outputMT - target).toFixed(1) : "—";
    return [
      machine,
      kwh.toFixed(0),
      `${outputMT.toFixed(0)} MT`,
      `${sp}`,
      target.toFixed(1),
      `${variance}`,
    ];
  });

  return (
    <Stack spacing={2}>
      <DrillTable
        title="Machine-wise Specific Power"
        cols={["Machine", "kWh", "Output", "Sp. Power", "Target", "Variance"]}
        rows={rows}
      />
    </Stack>
  );
}
