import { Box, Skeleton, Stack } from "@mui/material";

/**
 * Skeleton primitives sized to match each drill panel's chrome so the
 * layout doesn't shift when data resolves.
 */

export function TableSkeleton({ rows = 6, cols = 5, withHeader = true }) {
  return (
    <Box
      sx={{
        border: 1,
        borderColor: "divider",
        borderRadius: 1.25,
        overflow: "hidden",
      }}
    >
      {withHeader && (
        <Stack
          direction="row"
          spacing={1}
          sx={{
            px: 1.5,
            py: 1,
            borderBottom: 1,
            borderColor: "divider",
            backgroundColor: "background.paper",
          }}
        >
          {Array.from({ length: cols }).map((_, i) => (
            <Skeleton
              key={i}
              variant="text"
              sx={{
                flex: i === 0 ? 2 : 1,
                fontSize: 11,
              }}
            />
          ))}
        </Stack>
      )}
      {Array.from({ length: rows }).map((_, r) => (
        <Stack
          key={r}
          direction="row"
          spacing={1}
          alignItems="center"
          sx={{
            px: 1.5,
            py: 1,
            borderBottom: r === rows - 1 ? 0 : 1,
            borderColor: "divider",
          }}
        >
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton
              key={c}
              variant="text"
              sx={{
                flex: c === 0 ? 2 : 1,
                fontSize: 13,
              }}
            />
          ))}
        </Stack>
      ))}
    </Box>
  );
}

export function OverallTilesSkeleton({ count = 3 }) {
  return (
    <Stack direction="row" spacing={1.5}>
      {Array.from({ length: count }).map((_, i) => (
        <Box
          key={i}
          sx={{
            flex: 1,
            border: 1,
            borderColor: "divider",
            borderRadius: 1.25,
            p: 1.5,
            backgroundColor: "background.paper",
          }}
        >
          <Skeleton variant="text" width="50%" sx={{ fontSize: 11 }} />
          <Skeleton variant="text" width="80%" sx={{ fontSize: 28, mt: 0.5 }} />
        </Box>
      ))}
    </Stack>
  );
}

export function OeeDrillSkeleton() {
  return (
    <Stack spacing={2}>
      <OverallTilesSkeleton />
      <Stack direction="row" alignItems="center" justifyContent="space-between">
        <Skeleton variant="text" width={180} sx={{ fontSize: 13 }} />
        <Skeleton variant="rounded" width={220} height={32} />
      </Stack>
      <TableSkeleton rows={5} cols={5} />
    </Stack>
  );
}

export function ProductionDrillSkeleton({ tableType = "compound" }) {
  const cols = tableType === "compound" ? 7 : 4;
  return (
    <Stack spacing={1}>
      <Skeleton variant="text" width={260} sx={{ fontSize: 12 }} />
      <TableSkeleton rows={6} cols={cols} />
    </Stack>
  );
}

export function PlanComplianceSkeleton() {
  return (
    <Box
      sx={{
        display: "grid",
        gap: 2,
        gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
      }}
    >
      {Array.from({ length: 2 }).map((_, i) => (
        <Stack
          key={i}
          spacing={1.25}
          sx={{
            backgroundColor: "background.paper",
            border: 1,
            borderColor: "divider",
            borderRadius: 1.25,
            p: 1.5,
          }}
        >
          <Skeleton variant="text" width="60%" sx={{ fontSize: 13 }} />
          <TableSkeleton rows={5} cols={4} />
        </Stack>
      ))}
    </Box>
  );
}

export function BudgetDrillSkeleton() {
  return (
    <Stack spacing={1.5}>
      <Skeleton variant="text" width={160} sx={{ fontSize: 13 }} />
      <Stack
        direction="row"
        spacing={3}
        alignItems="center"
        sx={{
          p: 2,
          border: 1,
          borderColor: "divider",
          borderRadius: 1.25,
        }}
      >
        <Skeleton variant="circular" width={96} height={96} />
        <Stack spacing={1} sx={{ flex: 1 }}>
          <Skeleton variant="text" width="40%" sx={{ fontSize: 11 }} />
          <Skeleton variant="text" width="55%" sx={{ fontSize: 19 }} />
          <Skeleton variant="text" width="40%" sx={{ fontSize: 11, mt: 0.5 }} />
          <Skeleton variant="text" width="55%" sx={{ fontSize: 19 }} />
        </Stack>
      </Stack>
    </Stack>
  );
}
