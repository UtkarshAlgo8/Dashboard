import { lazy, Suspense } from "react";
import { Box } from "@mui/material";
import JKLoader from "@/components/JKLoader.jsx";

export const LandingPage = lazy(() => import("@/pages/LandingPage.jsx"));
export const BanmoreProduction = lazy(
  () => import("@/pages/BanmoreProduction.jsx"),
);
export const BanmoreQuality = lazy(() => import("@/pages/BanmoreQuality.jsx"));
export const CtpQuality = lazy(() => import("@/pages/CtpQuality.jsx"));
export const CtpEngineering = lazy(() => import("@/pages/CtpEngineering.jsx"));
export const CtpAnomalyDetection = lazy(
  () => import("@/pages/CtpAnomalyDetection.jsx"),
);
export const BanmoreEngineering = lazy(
  () => import("@/pages/BanmoreEngineering.jsx"),
);
export const BanmoreTechnical = lazy(
  () => import("@/pages/BanmoreTechnical.jsx"),
);

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
