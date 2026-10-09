import { createBrowserRouter, Navigate } from "react-router-dom";
import {
  BanmoreProduction,
  BanmoreQuality,
  BanmoreEngineering,
  BanmoreTechnical,
  LandingPage,
  LazyRoute,
} from "@/routerComponents.jsx";
import ProtectedRoute from "@/components/ProtectedRoute.jsx";
import LoginPage from "@/pages/LoginPage.jsx";

/**
 * Public route: login page. Everything else is gated behind
 * <ProtectedRoute /> which reads from AuthContext.
 */
const router = createBrowserRouter([
  { path: "/login", element: <LoginPage /> },
  {
    path: "/",
    element: (
      <ProtectedRoute>
        <LazyRoute Page={LandingPage} />
      </ProtectedRoute>
    ),
  },
  {
    path: "/:plantId/production",
    element: (
      <ProtectedRoute>
        <LazyRoute Page={BanmoreProduction} />
      </ProtectedRoute>
    ),
  },
  {
    path: "/banmore/production",
    element: (
      <ProtectedRoute>
        <LazyRoute Page={BanmoreProduction} />
      </ProtectedRoute>
    ),
  },
  {
    path: "/banmore/quality",
    element: (
      <ProtectedRoute>
        <LazyRoute Page={BanmoreQuality} />
      </ProtectedRoute>
    ),
  },
  {
    path: "/banmore/technical",
    element: (
      <ProtectedRoute>
        <LazyRoute Page={BanmoreTechnical} />
      </ProtectedRoute>
    ),
  },
  {
    path: "/banmore/engineering",
    element: (
      <ProtectedRoute>
        <LazyRoute Page={BanmoreEngineering} />
      </ProtectedRoute>
    ),
  },
  // Unknown URLs land on the dashboard root, which then forwards to
  // /login if the visitor is unauthenticated.
  { path: "*", element: <Navigate to="/" replace /> },
]);

export default router;
