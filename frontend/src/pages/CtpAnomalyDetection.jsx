import { useState } from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Stack,
  ThemeProvider,
  Typography,
} from "@mui/material";
import ProductionHeader from "@/components/production/ProductionHeader.jsx";
import useAnomalyWorkspace from "@/hooks/useAnomalyWorkspace.js";
import { createAnomalyTheme } from "@/theme.js";
import { CTP_PLANT } from "@/lib/anomaly/constants.js";
import AnomalyWorkspace from "@/pages/engineering/anomaly/AnomalyWorkspace.jsx";
import "@/pages/engineering/anomaly/workspace.css";

function initialTheme() {
  try {
    return localStorage.getItem("ctp-anomaly-theme") === "dark"
      ? "dark"
      : "slate";
  } catch {
    return "slate";
  }
}

export default function CtpAnomalyDetection() {
  const { model, loading, error, retry } = useAnomalyWorkspace();
  const [mode, setMode] = useState(initialTheme);
  const toggleTheme = () => {
    const next = mode === "dark" ? "slate" : "dark";
    setMode(next);
    try {
      localStorage.setItem("ctp-anomaly-theme", next);
    } catch {
      /* Storage may be disabled. */
    }
  };
  return (
    <Box
      sx={{
        height: "100dvh",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <Box sx={{ flexShrink: 0, zIndex: (theme) => theme.zIndex.appBar }}>
        <ProductionHeader
          plant={CTP_PLANT}
          pageTitle="Anomaly Detection"
          parentPage={{ label: "Engineering", href: "/chennai/engineering" }}
          showSecondaryNav={false}
        />
      </Box>
      <ThemeProvider theme={createAnomalyTheme(mode)}>
        {loading ? (
          <Stack
            role="status"
            spacing={2}
            alignItems="center"
            justifyContent="center"
            sx={{ flex: 1, bgcolor: "background.default" }}
          >
            <CircularProgress size={30} />
            <Typography>Loading Quintoplex demo export…</Typography>
          </Stack>
        ) : error ? (
          <Box sx={{ flex: 1, p: 3, bgcolor: "background.default" }}>
            <Alert
              severity="error"
              action={<Button onClick={retry}>Retry</Button>}
            >
              {error.message}
            </Alert>
          </Box>
        ) : !model?.equipmentIds.length ? (
          <Box sx={{ flex: 1, p: 3, bgcolor: "background.default" }}>
            <Alert severity="info">
              No equipment data is available for this workspace.
            </Alert>
          </Box>
        ) : (
          <AnomalyWorkspace
            model={model}
            mode={mode}
            onToggleTheme={toggleTheme}
          />
        )}
      </ThemeProvider>
    </Box>
  );
}
