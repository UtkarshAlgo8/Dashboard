import { Box, Skeleton, Stack } from "@mui/material";

/**
 * Shared drill-panel loading skeleton. Mimics the shape of a typical
 * drill: a short header line + an N-row table. Used while
 * `useDashboardFetch.isDrillLoading` is true so the user sees movement
 * instead of the empty-state message during the fetch window.
 */
export default function DrillSkeleton({ rows = 5, cols = 4, title = true }) {
  return (
    <Box
      sx={{
        border: 1,
        borderColor: "divider",
        borderRadius: 1.25,
        p: 2,
      }}
    >
      {title && (
        <Skeleton
          variant="text"
          width={180}
          height={18}
          sx={{ mb: 1.5 }}
        />
      )}
      <Stack spacing={0.75}>
        <Stack direction="row" spacing={1.5}>
          {Array.from({ length: cols }).map((_, i) => (
            <Skeleton
              key={`h-${i}`}
              variant="text"
              width={`${100 / cols}%`}
              height={14}
            />
          ))}
        </Stack>
        {Array.from({ length: rows }).map((_, r) => (
          <Stack key={`r-${r}`} direction="row" spacing={1.5}>
            {Array.from({ length: cols }).map((_, c) => (
              <Skeleton
                key={`c-${c}`}
                variant="rounded"
                width={`${100 / cols}%`}
                height={22}
              />
            ))}
          </Stack>
        ))}
      </Stack>
    </Box>
  );
}
