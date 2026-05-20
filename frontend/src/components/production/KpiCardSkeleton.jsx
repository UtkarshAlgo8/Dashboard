import { Box, Skeleton, Stack } from "@mui/material";

/**
 * Skeleton placeholder that mirrors the real KpiCard layout 1:1 so
 * the grid doesn't shift when data resolves. Three rows:
 *   header  (title chip + right-aligned action shapes)
 *   body    (large value + small unit + sparkline rectangle)
 *   footer  (trend arrow + percentage)
 */
function KpiCardSkeleton() {
  return (
    <Box
      sx={{
        backgroundColor: "background.paper",
        border: 1,
        borderColor: "divider",
        borderRadius: 1.25,
        p: 1.5,
      }}
    >
      {/* Header row */}
      <Stack direction="row" alignItems="center" justifyContent="space-between">
        <Skeleton variant="text" width={68} sx={{ fontSize: 11 }} />
        <Stack direction="row" spacing={0.5} alignItems="center">
          <Skeleton variant="circular" width={20} height={20} />
          <Skeleton variant="circular" width={18} height={18} />
        </Stack>
      </Stack>

      {/* Body row: value + sparkline */}
      <Stack
        direction="row"
        alignItems="flex-end"
        justifyContent="space-between"
        sx={{ mt: 0.5 }}
      >
        <Stack direction="row" alignItems="baseline" spacing={0.75}>
          <Skeleton variant="text" width={72} sx={{ fontSize: 28 }} />
          <Skeleton variant="text" width={24} sx={{ fontSize: 12 }} />
        </Stack>
        <Skeleton variant="rounded" width={80} height={28} />
      </Stack>

      {/* Footer row: trend */}
      <Stack
        direction="row"
        alignItems="center"
        spacing={0.5}
        sx={{ mt: 0.75 }}
      >
        <Skeleton variant="circular" width={12} height={12} />
        <Skeleton variant="text" width={48} sx={{ fontSize: 12 }} />
      </Stack>
    </Box>
  );
}

export default KpiCardSkeleton;
