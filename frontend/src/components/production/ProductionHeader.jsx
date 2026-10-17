import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
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
import ReportProblemOutlinedIcon from "@mui/icons-material/ReportProblemOutlined";
import CheckIcon from "@mui/icons-material/Check";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import TimeRangeSelect from "./TimeRangeSelect.jsx";
import NavTabs from "./NavTabs.jsx";
import UserMenu from "@/components/user-menu/UserMenu.jsx";
import SendMailButton from "@/components/mail/SendMailButton.jsx";
import { MOCK_USER } from "@/lib/mockData.js";
import jkLogo from "@/assets/jk-logo.png";

/** "Last Updated at HH:MM AM/PM" for the header stamp. */
function formatUpdated(date) {
  if (!date) return null;
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

// The dashboard each plant route opens, named as the navbar shows it.
const PAGE_TITLES = {
  production: "Production",
  quality: "Quality",
  technical: "Technical",
  engineering: "Engineering",
};

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
  plant = null,
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
  // Time-range presets this page cannot serve (e.g. ["month"] on Quality SPC).
  disabledPresets = [],
  hiddenPresets = [],
  singleDay = null,
  onSingleDayChange,
  showSpcAlertIcon = false,
  // Overrides the page name the navbar derives from the route.
  pageTitle = null,
}) {
  const theme = useTheme();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const currentPage =
    pageTitle ?? PAGE_TITLES[pathname.split("/").filter(Boolean)[1]] ?? null;
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
  // Empty array means caller doesn't want a tyre-type selector at all
  // (e.g. Quality has its own sub-tab row and locks to PCR). `undefined`
  // falls back to DEFAULT_TYRE_TYPES.
  const hasExplicitTyreTypes = Array.isArray(tyreTypes);
  const showTyreTypes = hasExplicitTyreTypes && formattedTyreOptions.length > 0;
  const activeTyreId =
    typeof tyreType === "string" ? tyreType.toLowerCase() : "all";
  const tyreTypeItems = showTyreTypes
    ? formattedTyreOptions
    : DEFAULT_TYRE_TYPES;

  // An explicit empty array means "no dept tabs in this dashboard" (e.g.
  // Quality has its own sub-tab row, so the dept switcher is suppressed).
  // `undefined` falls back to DEFAULT_CATEGORY_TABS.
  const hasExplicitTabs = Array.isArray(categoryTabs);
  const formattedCategories = hasExplicitTabs
    ? categoryTabs.map((t) => ({
        id: t.id,
        label: t.name || t.label,
        disabled: t.enabled === false,
        disabledTooltip: t.disabledTooltip ?? "Phase 2 — coming soon",
      }))
    : DEFAULT_CATEGORY_TABS;
  const showCategoryTabs = hasExplicitTabs && formattedCategories.length > 0;

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
          display: "grid",
          gridTemplateColumns: "1fr auto 1fr",
          alignItems: "center",
          position: "relative",
          zIndex: 2,
        }}
      >
        {/* Left: Brand Logo & App Name */}
        <Stack
          direction="row"
          alignItems="center"
          spacing={1.5}
          sx={{ justifySelf: "start" }}
        >
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
          {/* The app name gives way below lg so the plant › page trail in
              the centre column never squeezes it onto three lines. */}
          <Box
            sx={{
              display: { xs: "none", lg: "block" },
              width: "1.5px",
              height: 22,
              backgroundColor: "error.main",
              borderRadius: 1,
            }}
          />
          <Typography
            sx={{
              display: { xs: "none", lg: "block" },
              fontSize: 16.5,
              fontWeight: 700,
              letterSpacing: "-0.2px",
              color: "text.primary",
              fontStyle: "italic",
              whiteSpace: "nowrap",
            }}
          >
            One JK One Dashboard
          </Typography>
        </Stack>

        {/* Center: where the user is — the active plant (a pill, click to go
            back to the plant map), then the dashboard open inside it. */}
        <Stack
          component="nav"
          aria-label="Current location"
          direction="row"
          alignItems="center"
          spacing={1}
          sx={{ justifySelf: "center", minWidth: 0 }}
        >
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
                transition:
                  "background-color 120ms ease, box-shadow 120ms ease",
                "&:hover": {
                  backgroundColor: theme.custom.brand.orangeRing,
                  boxShadow: theme.custom.shadow,
                },
              }}
            >
              <Typography
                sx={{
                  fontSize: 14,
                  fontWeight: 700,
                  whiteSpace: "nowrap",
                  lineHeight: 1.2,
                }}
              >
                {plant?.name ?? "Select plant"}
              </Typography>
              <Typography sx={{ fontSize: 11, opacity: 0.8, lineHeight: 1 }}>
                ▾
              </Typography>
            </Box>
          </Tooltip>
          {currentPage && (
            <>
              <ChevronRightIcon
                aria-hidden
                sx={{ fontSize: 20, color: "text.disabled" }}
              />
              <Typography
                component="h1"
                aria-current="page"
                sx={{
                  fontSize: 17,
                  fontWeight: 700,
                  color: "text.primary",
                  whiteSpace: "nowrap",
                  lineHeight: 1.2,
                }}
              >
                {currentPage}
              </Typography>
            </>
          )}
        </Stack>

        {/* Right: Last Updated Timestamp + Profile Dropdown */}
        <Stack
          direction="row"
          alignItems="center"
          spacing={2}
          sx={{ justifySelf: "end" }}
        >
          {formatUpdated(lastUpdatedAt) && (
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
          )}

          <Stack direction="row" alignItems="center" spacing={1}>
            {showSpcAlertIcon && (
              <Tooltip title="SPC alerts">
                <Box
                  component="span"
                  role="img"
                  aria-label="SPC alerts"
                  sx={{
                    width: 34,
                    height: 34,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: "50%",
                    color: "error.dark",
                    backgroundColor: "rgba(215, 0, 20, 0.08)",
                    border: "1px solid rgba(215, 0, 20, 0.22)",
                  }}
                >
                  <ReportProblemOutlinedIcon sx={{ fontSize: 21 }} />
                </Box>
              </Tooltip>
            )}
            <SendMailButton />
            <UserMenu user={MOCK_USER} size={34} />
          </Stack>
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
        {/* 1. Category Nav Pills in a Rounded Card (skipped when caller
            passes an empty categoryTabs array — e.g. Quality has its own
            sub-tab row and doesn't need the dept switcher). */}
        {showCategoryTabs && (
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
        )}

        {/* 2. Tyre Type / Category Pills (skipped when caller passes an
            empty tyreTypes array — Quality suppresses this and shows its
            own sub-tab row, which is rendered above the right-side filters). */}
        {showTyreTypes && (
          <Box
            sx={{
              boxShadow: theme.custom.floatingShadow,
              borderRadius: 999,
            }}
          >
            <NavTabs
              items={tyreTypeItems}
              value={activeTyreId}
              onChange={(id) => {
                const match = tyreTypeItems.find((t) => t.id === id);
                onTyreTypeChange?.(match ? match.label : id);
              }}
              layoutId="tyreTypeFilterFill"
              size="lg"
            />
          </Box>
        )}

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
                  // Carry the picker's month reset through; otherwise the
                  // spread above keeps a month pinned from the dropdown.
                  month: p.month ?? null,
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
              disabledPresets={disabledPresets}
              hiddenPresets={hiddenPresets}
              singleDay={singleDay}
              onSingleDayChange={onSingleDayChange}
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
