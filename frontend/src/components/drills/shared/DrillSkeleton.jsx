import { Box } from "@mui/material";
import JKLoader from "@/components/JKLoader.jsx";

/**
 * Shared drill-panel loading indicator. Shows the branded JKLoader while
 * `useDashboardFetch.isDrillLoading` is true, so the panel shows the loader
 * (never an empty / "no data" flash) until its rows resolve. The rows/cols
 * props are kept for call-site compatibility but no longer size a skeleton.
 */
export default function DrillSkeleton() {
  return (
    <Box
      sx={{
        border: 1,
        borderColor: "divider",
        borderRadius: 1.25,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: 240,
      }}
    >
      <JKLoader />
    </Box>
  );
}
