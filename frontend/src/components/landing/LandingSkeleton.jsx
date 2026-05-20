import { Box, Skeleton, Stack } from "@mui/material";

/**
 * Landing-page skeleton: 4 plant cards on the left, India-map outline
 * on the right. Mirrors the real two-column grid so the header stays
 * fixed and only the body cross-fades when data arrives.
 */
function LandingSkeleton() {
  return (
    <Box
      sx={{
        display: "grid",
        gap: 3,
        alignItems: "flex-start",
        gridTemplateColumns: {
          xs: "1fr",
          md: "minmax(360px, 480px) 1fr",
        },
      }}
    >
      <Stack spacing={1.5}>
        {Array.from({ length: 4 }).map((_, i) => (
          <PlantCardSkeleton key={i} />
        ))}
      </Stack>
      <MapSkeleton />
    </Box>
  );
}

function PlantCardSkeleton() {
  return (
    <Box
      sx={{
        backgroundColor: "background.paper",
        border: 1,
        borderColor: "divider",
        borderRadius: 1.25,
        p: 2,
      }}
    >
      <Stack
        direction="row"
        spacing={2}
        alignItems="center"
        justifyContent="space-between"
      >
        <Stack spacing={0.5} sx={{ flex: 1 }}>
          <Skeleton variant="text" width="55%" sx={{ fontSize: 18 }} />
          <Skeleton variant="text" width="40%" sx={{ fontSize: 12 }} />
        </Stack>
        <Skeleton variant="rounded" width={64} height={28} />
      </Stack>
      <Stack direction="row" spacing={3} sx={{ mt: 1.5 }}>
        {Array.from({ length: 3 }).map((_, i) => (
          <Stack key={i} spacing={0.25} sx={{ flex: 1 }}>
            <Skeleton variant="text" width="50%" sx={{ fontSize: 10 }} />
            <Skeleton variant="text" width="70%" sx={{ fontSize: 18 }} />
          </Stack>
        ))}
      </Stack>
    </Box>
  );
}

function MapSkeleton() {
  return (
    <Box
      sx={{
        width: "100%",
        maxWidth: 540,
        mx: "auto",
        aspectRatio: "0.85 / 1",
        backgroundColor: "background.paper",
        border: 1,
        borderColor: "divider",
        borderRadius: 1.25,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        p: 4,
      }}
    >
      <Skeleton
        variant="rounded"
        sx={{
          width: "70%",
          height: "75%",
          transform: "rotate(-5deg)",
        }}
      />
    </Box>
  );
}

export default LandingSkeleton;
