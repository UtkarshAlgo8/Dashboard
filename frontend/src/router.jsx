import { createBrowserRouter } from "react-router-dom";
import {
  BanmoreProduction,
  BanmoreQuality,
  LandingPage,
  LazyRoute,
} from "@/routerComponents.jsx";

const router = createBrowserRouter([
  { path: "/", element: <LazyRoute Page={LandingPage} /> },
  {
    path: "/:plantId/production",
    element: <LazyRoute Page={BanmoreProduction} />,
  },
  {
    path: "/banmore/production",
    element: <LazyRoute Page={BanmoreProduction} />,
  },
  {
    path: "/banmore/quality",
    element: <LazyRoute Page={BanmoreQuality} />,
  },
]);

export default router;
