import { Box, Skeleton, Stack } from "@mui/material";

/**
 * Pre-shaped skeletons for the most common layouts.
 */
function LoadingSkeleton({ variant = "page", count = 1 }) {
  const items = Array.from({ length: count });

  if (variant === "tableRow") {
    return (
      <>
        {items.map((_, i) => (
          <Stack
            key={i}
            direction="row"
            spacing={2}
            sx={{ py: 1, px: 2, alignItems: "center" }}
          >
            <Skeleton variant="circular" width={24} height={24} />
            <Skeleton variant="text" sx={{ flex: 1, fontSize: "13px" }} />
            <Skeleton variant="text" width={80} sx={{ fontSize: "13px" }} />
            <Skeleton variant="rounded" width={75} height={30} />
          </Stack>
        ))}
      </>
    );
  }

  if (variant === "card") {
    return (
      <Stack spacing={2}>
        {items.map((_, i) => (
          <Box
            key={i}
            sx={{ p: 2, border: "1px solid #E4E4E4", borderRadius: "10px" }}
          >
            <Skeleton variant="text" width="40%" sx={{ fontSize: "16px" }} />
            <Skeleton variant="text" width="80%" sx={{ fontSize: "13px" }} />
            <Skeleton variant="text" width="60%" sx={{ fontSize: "13px" }} />
          </Box>
        ))}
      </Stack>
    );
  }

  if (variant === "listItem") {
    return (
      <Stack spacing={1}>
        {items.map((_, i) => (
          <Stack
            key={i}
            direction="row"
            spacing={2}
            sx={{ alignItems: "center" }}
          >
            <Skeleton variant="circular" width={32} height={32} />
            <Stack sx={{ flex: 1 }}>
              <Skeleton variant="text" width="50%" sx={{ fontSize: "14px" }} />
              <Skeleton variant="text" width="35%" sx={{ fontSize: "12px" }} />
            </Stack>
          </Stack>
        ))}
      </Stack>
    );
  }

  // 'page' default: header strip + grid of cards
  return (
    <Box>
      <Skeleton variant="rounded" height={48} sx={{ mb: 2 }} />
      <LoadingSkeleton variant="card" count={Math.max(count, 3)} />
    </Box>
  );
}

export default LoadingSkeleton;
