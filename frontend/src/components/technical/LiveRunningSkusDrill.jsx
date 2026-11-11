import { Box, Typography, useTheme } from "@mui/material";
import TechDrillCard from "@/components/technical/TechDrillCard.jsx";

import { LIVE_SKU_NOTE } from "@/lib/liveRunningSkus.js";

function LiveRunningSkusDrill({
  machines,
  snapshot,
  error,
  isLoading,
  title,
  breadcrumb,
  onClose,
}) {
  const theme = useTheme();
  const unavailable = Boolean(error) || !snapshot;
  const rows = unavailable
    ? []
    : machines.map((machine) => {
        const running = machine.machine_status === "Running";
        return [
          machine.machine_id,
          machine.machine_status,
          running ? (machine.live_sku ?? "—") : "—",
          running ? (machine.live_sku_description ?? "—") : "—",
          machine.last_updated ?? "—",
          machine.run_window_min == null
            ? "—"
            : `${machine.run_window_min} min`,
          machine.status_reason ?? "—",
        ];
      });
  return (
    <Box sx={{ minWidth: 0 }}>
      {error && (
        <Typography
          role="alert"
          sx={{ mb: 1, color: "error.main", fontSize: 12.5 }}
        >
          Live snapshot unavailable: {error.message}
        </Typography>
      )}
      <TechDrillCard
        title={title}
        accent={theme.custom.brand.teal}
        breadcrumb={breadcrumb}
        tiles={
          unavailable
            ? []
            : [
                [
                  "Running",
                  String(
                    machines.filter(
                      (machine) => machine.machine_status === "Running",
                    ).length,
                  ),
                ],
                [
                  "Idle",
                  String(
                    machines.filter(
                      (machine) => machine.machine_status === "Idle",
                    ).length,
                  ),
                ],
                [
                  "Unknown",
                  String(
                    machines.filter(
                      (machine) => machine.machine_status === "Unknown",
                    ).length,
                  ),
                ],
                ["Snapshot as of (IST)", snapshot.as_of ?? "—"],
              ]
        }
        cols={[
          "Machine",
          "Status",
          "Live SKU",
          "Description",
          "Last reported (IST)",
          "Running window",
          "Status reason",
        ]}
        rows={rows}
        isLoading={!snapshot && isLoading}
        footnote={`${LIVE_SKU_NOTE}. Status is inferred from production freshness relative to the source feed; a feed older than ${snapshot?.feed_stale_min ?? 90} min is Unknown.${!unavailable && !machines.length ? " No machines reported in this scope during the last 7 days." : ""}`}
        onClose={onClose}
      />
    </Box>
  );
}

export default LiveRunningSkusDrill;
