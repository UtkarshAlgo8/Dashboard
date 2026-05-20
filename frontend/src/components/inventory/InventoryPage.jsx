import { useState } from "react";
import { Box, Typography } from "@mui/material";
import InventoryBarChart from "./InventoryBarChart.jsx";
import InventoryItemTable from "./InventoryItemTable.jsx";
import DailyInventoryTable from "./DailyInventoryTable.jsx";
import InventoryPageSkeleton from "./InventoryPageSkeleton.jsx";
import { useToast } from "@/components/common";
import { usePolledQuery } from "@/hooks/usePolledQuery.js";
import { getInventory } from "@/api/inventory.js";

/**
 * Inventory page per BRD §6.13. Renders when the "I" tab is active.
 * Three bar-chart cards + drill-down item table on bar click +
 * 7-day × 12-category history table.
 */
function InventoryPage({ plantId }) {
  const toast = useToast();
  const [selected, setSelected] = useState(null); // { groupId, barId } | null

  const { data, isLoading, error } = usePolledQuery(
    () => getInventory({ plantId }),
    { interval: 60_000, deps: [plantId] },
  );

  if (error) toast.error("Could not load Inventory.");

  if (isLoading && !data) {
    return <InventoryPageSkeleton />;
  }

  if (!data || !data.groups) {
    return (
      <Box sx={{ py: 4, textAlign: "center", color: "text.disabled" }}>
        <Typography sx={{ fontSize: 13 }}>No inventory configured.</Typography>
      </Box>
    );
  }

  const handleBarClick = (groupId, barId) => {
    setSelected((current) => {
      if (current?.groupId === groupId && current?.barId === barId) {
        return null;
      }
      return { groupId, barId };
    });
  };

  const selectedBar = selected
    ? data.groups[selected.groupId]?.bars.find((b) => b.id === selected.barId)
    : null;

  const groups = data.groups;

  return (
    <Box sx={{ p: 2, display: "flex", flexDirection: "column" }}>
      <Box
        sx={{
          display: "grid",
          gap: 2,
          gridTemplateColumns: { xs: "1fr", md: "repeat(3, 1fr)" },
        }}
      >
        {["production", "stock", "compound"].map((groupId) => {
          const group = groups[groupId];
          if (!group) return null;
          return (
            <InventoryBarChart
              key={groupId}
              title={group.title}
              bars={group.bars}
              selectedBarId={
                selected?.groupId === groupId ? selected.barId : null
              }
              onBarClick={(barId) => handleBarClick(groupId, barId)}
            />
          );
        })}
      </Box>

      {selectedBar && <InventoryItemTable bar={selectedBar} />}

      {Array.isArray(data.history) && data.history.length > 0 && (
        <DailyInventoryTable history={data.history} />
      )}
    </Box>
  );
}

export default InventoryPage;
