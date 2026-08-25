import { lazy, Suspense } from "react";
import { Box } from "@mui/material";
import JKLoader from "@/components/JKLoader.jsx";

export const LandingPage = lazy(() => import("@/pages/LandingPage.jsx"));
export const BanmoreProduction = lazy(
  () => import("@/pages/BanmoreProduction.jsx"),
);
export const BanmoreQuality = lazy(() => import("@/pages/BanmoreQuality.jsx"));

export function LazyRoute({ Page }) {
  return (
    <Suspense fallback={<RouteLoadingFallback />}>
      <Page />
    </Suspense>
  );
}

function RouteLoadingFallback() {
  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <JKLoader />
    </Box>
  );
}
