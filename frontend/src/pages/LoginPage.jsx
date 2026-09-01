import { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Divider,
  FormControl,
  IconButton,
  InputAdornment,
  InputBase,
  Stack,
  Typography,
} from "@mui/material";
import Visibility from "@mui/icons-material/Visibility";
import VisibilityOff from "@mui/icons-material/VisibilityOff";
import LoginIcon from "@mui/icons-material/Login";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth.js";
import { useToast } from "@/components/common";
import { getFunctions, getPlants } from "@/api/plants.js";
import jkTyreLogo from "@/assets/portal/jk-tyre-logo.svg";
import dnaCoreLogo from "@/assets/portal/dna-core.webp";

/**
 * Project INFINITI branded login screen.
 *
 * Visual reference: JK-Infiniti-Portal / JKTyre-ProcessAudit-Desktop-FE
 * design — single white card with a vertical split:
 *   - Left:  Project INFINITI hero artwork + brand strip (JK / DnA CoE)
 *   - Right: Sign In form (Montserrat, blue pill button, underline
 *            "Forgot Password", underline-only inputs)
 *
 * The landing-page catalog endpoints (GET /plants, /functions) are
 * public so we can warm them while the user is signing in. Failures
 * are non-fatal — the post-login landing page re-fetches anyway.
 */
export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const { login, isAuthenticated, isBootstrapping } = useAuth();

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // Warm landing data so the post-login landing page mounts instantly.
  useEffect(() => {
    let cancelled = false;
    Promise.allSettled([getPlants(), getFunctions()]).then(() => {
      if (cancelled) return;
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const params = new URLSearchParams(location.search);
  const nextPath = params.get("next") || "/";

  useEffect(() => {
    if (!isBootstrapping && isAuthenticated) {
      navigate(nextPath, { replace: true });
    }
  }, [isAuthenticated, isBootstrapping, navigate, nextPath]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!identifier || !password) {
      setError("Please enter both your email / employee ID and password.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await login({ email: identifier.trim(), password });
      toast.success("Signed in.");
      navigate(nextPath, { replace: true });
    } catch (err) {
      setError(err?.message || "Sign in failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#F4F6FA",
        fontFamily: "Montserrat, sans-serif",
        p: { xs: 2, md: 4 },
      }}
    >
      <Box
        sx={{
          width: "100%",
          maxWidth: 1080,
          backgroundColor: "#FFFFFF",
          borderRadius: 3,
          border: "1px solid rgba(15, 23, 42, 0.06)",
          boxShadow: "0 30px 60px -30px rgba(15, 23, 42, 0.25)",
          display: "grid",
          gridTemplateColumns: { xs: "1fr", md: "1.25fr 1fr" },
          overflow: "hidden",
          minHeight: { md: 540 },
        }}
      >
        {/* --- Left brand panel --- */}
        <BrandPanel />

        {/* --- Vertical divider (md+) --- */}
        <Box
          aria-hidden
          sx={{
            display: { xs: "none", md: "block" },
            position: "absolute",
            // Inset the divider inside the card; the parent is grid so we
            // overlay a 1px line via a separate element below.
          }}
        />
        <Box
          aria-hidden
          sx={{
            display: { xs: "none", md: "block" },
            gridColumn: 1,
            gridRow: 1,
            width: "1px",
            backgroundColor: "#E5E7EB",
            justifySelf: "end",
            height: "100%",
          }}
        />

        {/* --- Right form panel --- */}
        <Box
          sx={{
            gridColumn: { xs: 1, md: 2 },
            gridRow: 1,
            p: { xs: 4, md: 5 },
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Box sx={{ width: "100%", maxWidth: 360 }}>
            <Typography
              sx={{
                fontFamily: "Montserrat, sans-serif",
                fontSize: 25,
                fontWeight: 500,
                color: "#404040",
                mb: 3,
              }}
            >
              Sign In
            </Typography>

            <Box component="form" onSubmit={handleSubmit}>
              <Box sx={{ mb: 2 }}>
                <Typography
                  sx={{
                    fontSize: 13,
                    color: "#666",
                    mb: 0.5,
                    fontFamily: "Montserrat, sans-serif",
                  }}
                >
                  Email / Employee ID
                </Typography>
                <FormControl fullWidth>
                  <InputBase
                    fullWidth
                    type="text"
                    placeholder="Enter email address"
                    name="identifier"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    autoComplete="username"
                    autoFocus
                    sx={{
                      borderBottom: "1px solid #ccc",
                      fontFamily: "Montserrat, sans-serif",
                      "&.Mui-focused": {
                        borderBottom: "2px solid #1976d2",
                      },
                      "&:focus-within": {
                        borderBottom: "2px solid #1976d2",
                      },
                    }}
                  />
                </FormControl>
              </Box>

              <Box sx={{ mb: 1 }}>
                <Typography
                  sx={{
                    fontSize: 13,
                    color: "#666",
                    mb: 0.5,
                    fontFamily: "Montserrat, sans-serif",
                  }}
                >
                  Password
                </Typography>
                <FormControl fullWidth>
                  <InputBase
                    fullWidth
                    type={showPassword ? "text" : "password"}
                    placeholder="Enter password"
                    name="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    endAdornment={
                      <InputAdornment position="end">
                        <IconButton
                          onClick={() => setShowPassword((v) => !v)}
                          edge="end"
                          size="small"
                        >
                          {showPassword ? <VisibilityOff /> : <Visibility />}
                        </IconButton>
                      </InputAdornment>
                    }
                    sx={{
                      borderBottom: "1px solid #ccc",
                      fontFamily: "Montserrat, sans-serif",
                      "&:focus-within": {
                        borderBottom: "2px solid #1976d2",
                      },
                    }}
                  />
                </FormControl>
              </Box>

              {error && (
                <Alert
                  severity="error"
                  sx={{ mt: 1, mb: 1, borderRadius: 1, fontSize: 12 }}
                >
                  {error}
                </Alert>
              )}

              <Stack
                direction="row"
                alignItems="center"
                justifyContent="space-between"
                sx={{ mt: 2.5 }}
              >
                <Box
                  component="button"
                  type="button"
                  onClick={() =>
                    toast.info(
                      "Contact the Algo8 platform team to reset your password.",
                    )
                  }
                  sx={{
                    border: "none",
                    background: "transparent",
                    p: 0,
                    textDecoration: "underline",
                    fontSize: 13,
                    fontWeight: 500,
                    color: "#9F9F9F",
                    cursor: "pointer",
                    fontFamily: "Montserrat, sans-serif",
                    "&:hover": { color: "#1976d2" },
                  }}
                >
                  Forgot Password
                </Box>
                <Button
                  type="submit"
                  disabled={submitting || !identifier || !password}
                  variant="contained"
                  startIcon={
                    submitting ? (
                      <CircularProgress size={14} color="inherit" />
                    ) : (
                      <LoginIcon sx={{ width: 16, height: 16 }} />
                    )
                  }
                  sx={{
                    height: 36,
                    minWidth: 110,
                    borderRadius: "20px",
                    backgroundColor: "#0077B6",
                    fontFamily: "Montserrat, sans-serif",
                    fontWeight: 600,
                    fontSize: 14,
                    textTransform: "none",
                    boxShadow: "none",
                    "&:hover": { backgroundColor: "#005f94" },
                    "&.Mui-disabled": {
                      backgroundColor: "#ccc",
                      color: "#FFFFFF",
                    },
                  }}
                >
                  {submitting ? "Signing in…" : "Sign In"}
                </Button>
              </Stack>
            </Box>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}

/**
 * Left panel: hero image at top, project title in the middle,
 * co-branded logos pinned to the bottom corners.
 */
function BrandPanel() {
  return (
    <Box
      sx={{
        gridColumn: { xs: 1, md: 1 },
        gridRow: 1,
        position: "relative",
        backgroundColor: "#FFFFFF",
        display: "flex",
        flexDirection: "column",
        p: { xs: 3, md: 4 },
      }}
    >
      {/* Hero image — pushed up to roughly the top half */}
      <Box
        sx={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: 220,
        }}
      >
        <Box
          component="img"
          src="/watermark.png"
          alt="Project INFINITI — DnACoE Digital Plant"
          sx={{
            width: "100%",
            maxWidth: 460,
            height: "auto",
            objectFit: "contain",
            display: "block",
          }}
        />
      </Box>

      {/* Hairline above the project title */}
      <Divider sx={{ mt: 2, mb: 2, borderColor: "#E5E7EB" }} />

      {/* Project title */}
      <Typography
        sx={{
          fontFamily: "Montserrat, sans-serif",
          fontSize: { xs: 18, md: 20 },
          fontWeight: 600,
          color: "#404040",
          textAlign: "center",
          mb: 4,
        }}
      >
        Project INFINITI - Digital Plant
      </Typography>

      {/* Bottom brand strip: JK (left) + DnA CoE (right) */}
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        sx={{ mt: "auto" }}
      >
        <Box
          component="img"
          src={jkTyreLogo}
          alt="JK Tyre & Industries Ltd."
          sx={{ height: 28, width: "auto" }}
        />
        <Box
          component="img"
          src={dnaCoreLogo}
          alt="DnA CoE — The Future"
          sx={{ height: 38, width: "auto" }}
        />
      </Stack>
    </Box>
  );
}
