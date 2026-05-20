import { createBrowserRouter } from "react-router-dom";
import LandingPage from "@/pages/LandingPage.jsx";
import BanmoreProduction from "@/pages/BanmoreProduction.jsx";

const router = createBrowserRouter([
  { path: "/", element: <LandingPage /> },
  { path: "/banmore/production", element: <BanmoreProduction /> },
]);

export default router;
