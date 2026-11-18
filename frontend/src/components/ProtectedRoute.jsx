import { Navigate, useLocation } from "react-router-dom";
import { Box, CircularProgress } from "@mui/material";

import { useAuth } from "@/hooks/useAuth.js";
import JkAgent from "@/components/chat/JkAgent.jsx";

/**
 * Gates any route subtree on a valid session. While AuthContext is
 * still rehydrating from /auth/current-user we render a small
 * spinner so the user never sees a flash of the login page during
 * a hard reload.
 */
export default function ProtectedRoute({ children, showAgent = true }) {
  const { isAuthenticated, isBootstrapping } = useAuth();
  const location = useLocation();

  if (isBootstrapping) {
    return (
      <Box
        sx={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <CircularProgress />
      </Box>
    );
  }

  if (!isAuthenticated) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?next=${next}`} replace />;
  }

  return (
    <>
      {children}
      {showAgent && <JkAgent />}
    </>
  );
}
