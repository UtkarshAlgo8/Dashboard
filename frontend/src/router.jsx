import { createBrowserRouter } from "react-router-dom";
import LandingPage from "@/pages/LandingPage.jsx";
import BanmoreProduction from "@/pages/BanmoreProduction.jsx";
import BanmoreQuality from "@/pages/BanmoreQuality.jsx";

const router = createBrowserRouter([
  { path: "/", element: <LandingPage /> },
  { path: "/:plantId/production", element: <BanmoreProduction /> },
  { path: "/banmore/production", element: <BanmoreProduction /> },
  { path: "/banmore/quality", element: <BanmoreQuality /> },
]);

export default router;
