import { useEffect, useRef, useState } from "react";
import {
  Box,
  CircularProgress,
  IconButton,
  Stack,
  Tooltip,
  Typography,
  useTheme,
} from "@mui/material";
import FileDownloadOutlinedIcon from "@mui/icons-material/FileDownloadOutlined";
import CheckIcon from "@mui/icons-material/Check";
import { useNavigate } from "react-router-dom";
import TimeRangeSelect from "./TimeRangeSelect.jsx";
import UserMenu from "@/components/user-menu/UserMenu.jsx";
import { MOCK_USER } from "@/lib/mockData.js";
import jkLogo from "@/assets/jk-logo.png";

/**
 * Production-dashboard top header.
 *
 * Layout is a 3-column grid (1fr | auto | 1fr) so the active plant pill
 * is always perfectly centred regardless of how wide the left brand or
 * the right control cluster grow — no horizontal drift.
 *
 * The header is sticky (pinned to the viewport top); the page body
 * scrolls beneath it.
 */
function ProductionHeader({
  plant,
  timeRange,
  onTimeRangeChange,
  shift,
  onShiftChange,
  onExport,
  asOf = null,
}) {
  const theme = useTheme();
  const navigate = useNavigate();

  // Download button state machine: idle → loading (spinner) → done (green
  // + tick) → back to idle after 3s.
  const [exportStatus, setExportStatus] = useState("idle");
  const resetTimer = useRef(null);
  useEffect(() => () => clearTimeout(resetTimer.current), []);

  const handleExport = async () => {
    if (exportStatus !== "idle") return;
    setExportStatus("loading");
    // Let the loading spinner paint before the (heavy, blocking) capture.
    await new Promise((r) => setTimeout(r, 80));
    try {
      await onExport?.();
      setExportStatus("done");
      resetTimer.current = setTimeout(() => setExportStatus("idle"), 3000);
    } catch (err) {
      console.error("PDF export failed:", err);
      setExportStatus("idle");
    }
  };

  return (
    <Box
      component="header"
      sx={{
        backgroundColor: "background.paper",
        borderBottom: 1,
        borderColor: "divider",
        px: 2,
        py: 1,
        display: "grid",
        gridTemplateColumns: "1fr auto 1fr",
        alignItems: "center",
        gap: 2,
      }}
    >
      {/* Left: brand mark + single heading */}
      <Stack
        direction="row"
        alignItems="center"
        spacing={1.25}
        sx={{ justifySelf: "start", minWidth: 0 }}
      >
        <Box
          component="img"
          src={jkLogo}
          alt="JK Tyre & Industries Ltd."
          sx={{ height: 22, width: "auto", objectFit: "contain", display: "block" }}
        />
        <Box
          sx={{
            width: "2px",
            height: 24,
            borderRadius: 1,
            backgroundColor: "text.disabled",
          }}
        />
        <Typography
          sx={{ fontSize: 15, fontWeight: 700, letterSpacing: "-0.2px", whiteSpace: "nowrap" }}
        >
          All Dashboards
        </Typography>
      </Stack>

      {/* Center: active plant — highlighted pill, click to change plant */}
      <Tooltip title="Change plant" arrow>
        <Box
          role="button"
          tabIndex={0}
          onClick={() => navigate("/")}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              navigate("/");
            }
          }}
          sx={{
            justifySelf: "center",
            display: "flex",
            alignItems: "center",
            gap: 0.75,
            px: 2,
            py: 0.6,
            borderRadius: 999,
            border: 1,
            borderColor: "primary.main",
            backgroundColor: "primary.light",
            color: "primary.main",
            cursor: "pointer",
            userSelect: "none",
            transition: "background-color 120ms ease, box-shadow 120ms ease",
            "&:hover": {
              backgroundColor: theme.custom.brand.orangeRing,
              boxShadow: theme.custom.shadow,
            },
          }}
        >
          <Typography
            sx={{ fontSize: 14, fontWeight: 700, whiteSpace: "nowrap", lineHeight: 1.2 }}
          >
            {plant?.name ?? "Select plant"}
          </Typography>
          <Typography sx={{ fontSize: 11, opacity: 0.8, lineHeight: 1 }}>▾</Typography>
        </Box>
      </Tooltip>

      {/* Right: TimeRange + TyreType badge + Export + Avatar */}
      <Stack
        direction="row"
        alignItems="center"
        spacing={1.5}
        sx={{ justifySelf: "end" }}
      >
        <TimeRangeSelect
          preset={timeRange.preset}
          from={timeRange.from}
          to={timeRange.to}
          onPresetChange={(p) =>
            onTimeRangeChange((prev) => ({
              ...prev,
              preset: p,
              from: "",
              to: "",
            }))
          }
          onFromChange={(v) =>
            onTimeRangeChange((prev) => ({ ...prev, from: v, preset: null }))
          }
          onToChange={(v) =>
            onTimeRangeChange((prev) => ({ ...prev, to: v, preset: null }))
          }
          shift={shift}
          onShiftChange={onShiftChange}
          asOf={asOf}
          month={timeRange.month ?? null}
          onMonthChange={(monthKey) =>
            onTimeRangeChange((prev) => ({
              ...prev,
              preset: "month",
              from: "",
              to: "",
              month: monthKey,
            }))
          }
        />

        {/* TyreType badge — Banmore is PCR-only per FR-X2 */}
        <Tooltip title="Banmore plant produces PCR only" arrow>
          <Box
            sx={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: 0.6,
              color: theme.custom.brand.teal,
              border: 1,
              borderColor: theme.custom.brand.teal,
              backgroundColor: theme.custom.surface.soft,
              px: 1,
              py: 0.5,
              borderRadius: 1,
              whiteSpace: "nowrap",
            }}
          >
            PCR ONLY
          </Box>
        </Tooltip>

        <Tooltip
          title={
            exportStatus === "done"
              ? "Downloaded"
              : exportStatus === "loading"
                ? "Generating PDF…"
                : "Download as PDF"
          }
          arrow
        >
          {/* span wrapper so the Tooltip works while the button is disabled */}
          <span style={{ display: "inline-flex" }}>
            <IconButton
              size="small"
              onClick={handleExport}
              aria-label="Download as PDF"
              sx={{
                width: 34,
                height: 34,
                borderRadius: "16px",
                border: 1,
                // Keep the icon white and the bg coloured in EVERY state —
                // don't use MUI's `disabled`, which strips the background and
                // left the white spinner/tick invisible on a white button.
                color: "primary.contrastText",
                boxShadow: theme.custom.shadow,
                pointerEvents: exportStatus === "idle" ? "auto" : "none",
                borderColor:
                  exportStatus === "done"
                    ? theme.custom.brand.green
                    : theme.custom.brand.ocean,
                backgroundColor:
                  exportStatus === "done"
                    ? theme.custom.brand.green
                    : theme.custom.brand.ocean,
                transition: "background-color 0.2s, border-color 0.2s",
                "&:hover": {
                  backgroundColor:
                    exportStatus === "done"
                      ? theme.custom.brand.green
                      : theme.custom.brand.ocean,
                  borderColor:
                    exportStatus === "done"
                      ? theme.custom.brand.green
                      : theme.custom.brand.ocean,
                },
              }}
            >
              {exportStatus === "loading" ? (
                <CircularProgress size={18} thickness={5} color="inherit" />
              ) : exportStatus === "done" ? (
                <CheckIcon sx={{ fontSize: 20 }} />
              ) : (
                <FileDownloadOutlinedIcon sx={{ fontSize: 20 }} />
              )}
            </IconButton>
          </span>
        </Tooltip>

        <UserMenu user={MOCK_USER} size={32} />
      </Stack>
    </Box>
  );
}

export default ProductionHeader;
