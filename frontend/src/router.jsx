import { createBrowserRouter } from "react-router-dom";
import LandingPage from "@/pages/LandingPage.jsx";
import BanmoreProductionPlaceholder from "@/pages/BanmoreProductionPlaceholder.jsx";

const router = createBrowserRouter([
  { path: "/", element: <LandingPage /> },
  { path: "/banmore/production", element: <BanmoreProductionPlaceholder /> },
]);

export default router;
