import { Box, Skeleton, Stack } from "@mui/material";
import { TableSkeleton } from "@/components/drills/DrillSkeletons.jsx";

/**
 * Inventory full-page skeleton: three bar-chart cards in a row, plus
 * a 7×13 daily history table below. Matches InventoryPage layout so
 * the body doesn't reflow when data lands.
 */
function InventoryPageSkeleton() {
  return (
    <Box sx={{ p: 2, display: "flex", flexDirection: "column", gap: 2 }}>
      <Box
        sx={{
          display: "grid",
          gap: 2,
          gridTemplateColumns: { xs: "1fr", md: "repeat(3, 1fr)" },
        }}
      >
        {Array.from({ length: 3 }).map((_, i) => (
          <BarChartCardSkeleton key={i} />
        ))}
      </Box>
      <TableSkeleton rows={7} cols={9} />
    </Box>
  );
}

function BarChartCardSkeleton() {
  // Heights mimic a small bar chart group: 5 bars of varied heights.
  const heights = [70, 50, 90, 40, 65];
  return (
    <Stack
      spacing={1.5}
      sx={{
        backgroundColor: "background.paper",
        border: 1,
        borderColor: "divider",
        borderRadius: 1.25,
        p: 2,
      }}
    >
      <Skeleton variant="text" width="70%" sx={{ fontSize: 13 }} />
      <Stack
        direction="row"
        alignItems="flex-end"
        spacing={1.5}
        sx={{ height: 110, py: 0.5 }}
      >
        {heights.map((h, i) => (
          <Skeleton
            key={i}
            variant="rounded"
            sx={{ flex: 1, height: h, alignSelf: "flex-end" }}
          />
        ))}
      </Stack>
      <Stack direction="row" spacing={1.5}>
        {heights.map((_, i) => (
          <Skeleton key={i} variant="text" sx={{ flex: 1, fontSize: 11 }} />
        ))}
      </Stack>
    </Stack>
  );
}

export default InventoryPageSkeleton;
