import { Box, Skeleton, Stack } from "@mui/material";
import KpiCardSkeleton from "./KpiCardSkeleton.jsx";

/**
 * First-paint skeleton for the Production page body. Renders the
 * same 220px sidebar + content grid as BanmoreProduction so the chrome
 * stays anchored while sections, tabs and plant-summary calls finish.
 */
function ProductionBodySkeleton() {
  return (
    <Box
      sx={{
        flex: 1,
        display: "grid",
        gridTemplateColumns: { xs: "1fr", md: "220px 1fr" },
        gap: 2,
        p: 2,
      }}
    >
      <Stack spacing={2}>
        <Box
          sx={{
            backgroundColor: "background.paper",
            border: 1,
            borderColor: "divider",
            borderRadius: 1.25,
            p: 1,
            flex: 1,
          }}
        >
          <Skeleton variant="text" width="60%" sx={{ fontSize: 11, mb: 1 }} />
          <Stack spacing={1}>
            {Array.from({ length: 4 }).map((_, i) => (
              <Stack
                key={i}
                direction="row"
                spacing={1}
                alignItems="center"
                sx={{ px: 1, py: 0.5 }}
              >
                <Skeleton variant="circular" width={30} height={30} />
                <Stack spacing={0.25} sx={{ flex: 1 }}>
                  <Skeleton variant="text" width="70%" sx={{ fontSize: 13 }} />
                  <Skeleton variant="text" width="55%" sx={{ fontSize: 11 }} />
                </Stack>
              </Stack>
            ))}
          </Stack>
        </Box>
        <Box
          sx={{
            backgroundColor: "background.paper",
            border: 1,
            borderColor: "divider",
            borderRadius: 1.25,
            p: 1.5,
          }}
        >
          <Skeleton variant="text" width="40%" sx={{ fontSize: 11 }} />
          <Skeleton variant="text" width="70%" sx={{ fontSize: 22, mt: 0.5 }} />
          <Skeleton variant="rounded" width="100%" height={26} sx={{ mt: 1 }} />
        </Box>
      </Stack>

      <Box
        sx={{
          backgroundColor: "background.paper",
          border: 1,
          borderColor: "divider",
          borderRadius: 1.25,
        }}
      >
        <Stack
          direction="row"
          spacing={1}
          sx={{
            p: 1.5,
            borderBottom: 1,
            borderColor: "divider",
          }}
        >
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} variant="rounded" width={84} height={28} />
          ))}
        </Stack>
        <Box
          sx={{
            p: 2,
            display: "grid",
            gap: 2,
            gridTemplateColumns: {
              xs: "1fr",
              sm: "repeat(2, 1fr)",
              md: "repeat(auto-fit, minmax(220px, 1fr))",
            },
          }}
        >
          {Array.from({ length: 4 }).map((_, i) => (
            <KpiCardSkeleton key={i} />
          ))}
        </Box>
      </Box>
    </Box>
  );
}

export default ProductionBodySkeleton;
