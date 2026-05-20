import { createBrowserRouter } from "react-router-dom";
import LandingPagePlaceholder from "@/pages/LandingPagePlaceholder.jsx";
import BanmoreProductionPlaceholder from "@/pages/BanmoreProductionPlaceholder.jsx";

const router = createBrowserRouter([
  { path: "/", element: <LandingPagePlaceholder /> },
  { path: "/banmore/production", element: <BanmoreProductionPlaceholder /> },
]);

export default router;
