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
import TimeRangeSelect from "./TimeRangeSelect.jsx";
import NavTabs from "./NavTabs.jsx";
import UserMenu from "@/components/user-menu/UserMenu.jsx";
import { MOCK_USER } from "@/lib/mockData.js";
import jkLogo from "@/assets/jk-logo.png";

/** "Last Updated at HH:MM AM/PM" for the header stamp. */
function formatUpdated(date) {
  if (!date) return "Last Updated at 03:27 AM";
  const hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const ampm = hours >= 12 ? "PM" : "AM";
  const formattedHours = String(hours % 12 || 12).padStart(2, "0");
  return `Last Updated at ${formattedHours}:${minutes} ${ampm}`;
}

const DEFAULT_CATEGORY_TABS = [
  { id: "p", label: "Production" },
  { id: "q", label: "Quality" },
  { id: "s", label: "Safety" },
  { id: "c", label: "Cost" },
  { id: "d", label: "Delivery" },
  { id: "m", label: "Morale" },
];

const DEFAULT_TYRE_TYPES = [
  { id: "all", label: "All" },
  { id: "pcr", label: "PCR" },
  { id: "tbr", label: "TBR" },
];

/**
 * Adobe XD Production Dashboard Header
 * Row 1: Brand Logo + One JK One Dashboard | Last Updated at ... + Avatar
 * Row 2: Category Pills | Tyre Type Pills | Time Range Pills | Download Button
 */
function ProductionHeader({
  timeRange,
  onTimeRangeChange,
  shift = "all",
  onShiftChange,
  onExport,
  asOf = null,
  lastUpdatedAt = null,
  categoryTabs = null,
  activeCategory = "p",
  onCategoryChange,
  tyreTypes = ["All", "PCR", "TBR"],
  tyreType = "All",
  onTyreTypeChange,
}) {
  const theme = useTheme();
  const [exportStatus, setExportStatus] = useState("idle");
  const resetTimer = useRef(null);

  useEffect(() => () => clearTimeout(resetTimer.current), []);

  const handleExport = async () => {
    if (exportStatus !== "idle") return;
    setExportStatus("loading");
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

  const formattedTyreOptions = (tyreTypes || []).map((t) =>
    typeof t === "string" ? { id: t.toLowerCase(), label: t } : t,
  );
  const activeTyreId =
    typeof tyreType === "string" ? tyreType.toLowerCase() : "all";

  const formattedCategories =
    Array.isArray(categoryTabs) && categoryTabs.length > 0
      ? categoryTabs.map((t) => ({
          id: t.id,
          label: t.name || t.label,
          disabled: t.enabled === false,
          disabledTooltip: t.disabledTooltip ?? "Phase 2 — coming soon",
        }))
      : DEFAULT_CATEGORY_TABS;

  return (
    <Box component="header" sx={{ width: "100%" }}>
      {/* Top Row: Full-width White Navbar Bar with Shadow */}
      <Box
        sx={{
          backgroundColor: "background.paper",
          borderBottom: 1,
          borderColor: "divider",
          boxShadow: theme.custom.navbarShadow,
          px: { xs: 2, md: 3 },
          py: 1.25,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          position: "relative",
          zIndex: 2,
        }}
      >
        {/* Left: Brand Logo & App Name */}
        <Stack direction="row" alignItems="center" spacing={1.5}>
          <Box
            component="img"
            src={jkLogo}
            alt="JK Tyre"
            sx={{
              height: 28,
              width: "auto",
              objectFit: "contain",
              display: "block",
            }}
          />
          <Box
            sx={{
              width: "1.5px",
              height: 22,
              backgroundColor: "error.main",
              borderRadius: 1,
            }}
          />
          <Typography
            sx={{
              fontSize: 16.5,
              fontWeight: 700,
              letterSpacing: "-0.2px",
              color: "text.primary",
              fontStyle: "italic",
            }}
          >
            One JK One Dashboard
          </Typography>
        </Stack>

        {/* Right: Last Updated Timestamp + Profile Dropdown */}
        <Stack direction="row" alignItems="center" spacing={2}>
          <Typography
            sx={{
              fontSize: 12.5,
              color: "text.secondary",
              fontWeight: 500,
              whiteSpace: "nowrap",
            }}
          >
            {formatUpdated(lastUpdatedAt)}
          </Typography>

          <UserMenu user={MOCK_USER} size={34} />
        </Stack>
      </Box>

      {/* Second Row: Prominent Floating Navigation & Filter Capsules on Gray Canvas */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 2.5,
          flexWrap: "wrap",
          px: { xs: 2, md: 3 },
          pt: 2.25,
          pb: 0.75,
        }}
      >
        {/* 1. Category Nav Pills in a Rounded Card */}
        <Box
          sx={{
            boxShadow: theme.custom.floatingShadow,
            borderRadius: 999,
          }}
        >
          <NavTabs
            items={formattedCategories}
            value={activeCategory}
            onChange={(catId) => onCategoryChange?.(catId)}
            layoutId="categoryFilterFill"
            size="lg"
          />
        </Box>

        {/* 2. Tyre Type / Category Pills */}
        <Box
          sx={{
            boxShadow: theme.custom.floatingShadow,
            borderRadius: 999,
          }}
        >
          <NavTabs
            items={
              formattedTyreOptions.length > 0
                ? formattedTyreOptions
                : DEFAULT_TYRE_TYPES
            }
            value={activeTyreId}
            onChange={(id) => {
              const match = formattedTyreOptions.find((t) => t.id === id);
              onTyreTypeChange?.(match ? match.label : id);
            }}
            layoutId="tyreTypeFilterFill"
            size="lg"
          />
        </Box>

        {/* 3. Time Range Pills + Export Button Cluster */}
        <Stack direction="row" alignItems="center" spacing={2}>
          <Box
            sx={{
              boxShadow: theme.custom.floatingShadow,
              borderRadius: 999,
            }}
          >
            <TimeRangeSelect
              preset={timeRange?.preset}
              from={timeRange?.from}
              to={timeRange?.to}
              shift={shift}
              onShiftChange={onShiftChange}
              onPresetChange={(p) =>
                onTimeRangeChange?.((prev) => ({
                  ...prev,
                  preset: p.preset,
                  from: p.from,
                  to: p.to,
                }))
              }
              onFromChange={(v) =>
                onTimeRangeChange?.((prev) => ({
                  ...prev,
                  from: v,
                  preset: null,
                }))
              }
              onToChange={(v) =>
                onTimeRangeChange?.((prev) => ({
                  ...prev,
                  to: v,
                  preset: null,
                }))
              }
              asOf={asOf}
              month={timeRange?.month ?? null}
              onMonthChange={(monthKey) =>
                onTimeRangeChange?.((prev) => ({
                  ...prev,
                  preset: "month",
                  from: "",
                  to: "",
                  month: monthKey,
                }))
              }
              size="lg"
            />
          </Box>

          {/* Action: Circular Download Button with white download icon */}
          <Tooltip
            title={
              exportStatus === "done"
                ? "Downloaded"
                : exportStatus === "loading"
                  ? "Generating PDF…"
                  : "Download Dashboard PDF"
            }
            arrow
          >
            <IconButton
              size="small"
              onClick={handleExport}
              sx={{
                width: 44,
                height: 44,
                borderRadius: "50%",
                backgroundColor: "primary.main",
                color: "primary.contrastText",
                boxShadow: theme.custom.floatingShadow,
                transition: "opacity 0.2s, background-color 0.2s",
                "&:hover": {
                  backgroundColor: "primary.main",
                  opacity: 0.9,
                },
              }}
            >
              {exportStatus === "loading" ? (
                <CircularProgress size={22} thickness={5} color="inherit" />
              ) : exportStatus === "done" ? (
                <CheckIcon sx={{ fontSize: 22 }} />
              ) : (
                <FileDownloadOutlinedIcon sx={{ fontSize: 22 }} />
              )}
            </IconButton>
          </Tooltip>
        </Stack>
      </Box>
    </Box>
  );
}

export default ProductionHeader;
