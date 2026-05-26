import {
  Box,
  IconButton,
  Stack,
  Tooltip,
  Typography,
  useTheme,
} from "@mui/material";
import FileDownloadOutlinedIcon from "@mui/icons-material/FileDownloadOutlined";
import TimeRangeSelect from "./TimeRangeSelect.jsx";
import UserMenu from "@/components/user-menu/UserMenu.jsx";
import { MOCK_USER } from "@/lib/mockData.js";
import jkLogo from "@/assets/jk-logo.png";

/**
 * Production-dashboard top header.
 *
 * Spec 04 wires the chrome only — TimeRange state is lifted from the
 * page, TyreType is locked to "PCR ONLY" for Banmore (BRD FR-X2),
 * Export toasts a "wait for spec 13" hint, avatar click is a no-op
 * (spec 14).
 */
function ProductionHeader({
  plant,
  timeRange,
  onTimeRangeChange,
  shift,
  onShiftChange,
}) {
  const theme = useTheme();

  return (
    <Box
      component="header"
      sx={{
        backgroundColor: "background.paper",
        borderBottom: 1,
        borderColor: "divider",
        px: 2,
        py: 1.5,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 2,
      }}
    >
      {/* Left: brand + plant name */}
      <Stack direction="row" alignItems="center" spacing={1.5}>
        <Box
          component="img"
          src={jkLogo}
          alt="JK Tyre & Industries Ltd."
          sx={{
            height: 28,
            width: "auto",
            objectFit: "contain",
            display: "block",
          }}
        />
        <Box
          sx={{ width: "1px", height: 24, backgroundColor: "divider", mx: 1 }}
        />
        <Box>
          <Typography sx={{ fontSize: 14, fontWeight: 700, lineHeight: 1.1 }}>
            One Factory
          </Typography>
          <Typography
            sx={{
              fontSize: 10,
              color: "text.disabled",
              textTransform: "uppercase",
              letterSpacing: 0.7,
              fontWeight: 600,
            }}
          >
            One Dashboard
          </Typography>
        </Box>
        <Box
          sx={{ width: "1px", height: 24, backgroundColor: "divider", mx: 1 }}
        />
        <Typography sx={{ fontSize: 14, fontWeight: 600 }}>
          {plant?.name ?? "—"}
        </Typography>
      </Stack>

      {/* Right: TimeRange + TyreType badge + Export + Avatar */}
      <Stack direction="row" alignItems="center" spacing={1.5}>
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
            }}
          >
            PCR ONLY
          </Box>
        </Tooltip>

        <Tooltip title="Export to PDF (browser print)" arrow>
          <IconButton
            size="small"
            onClick={() => window.print()}
            aria-label="Export to PDF"
            sx={{
              width: 34,
              height: 34,
              borderRadius: "16px",
              border: 1,
              borderColor: theme.custom.brand.ocean,
              backgroundColor: theme.custom.brand.ocean,
              color: "primary.contrastText",
              boxShadow: theme.custom.shadow,
              "&:hover": {
                backgroundColor: theme.custom.brand.ocean,
                borderColor: theme.custom.brand.ocean,
              },
            }}
          >
            <FileDownloadOutlinedIcon sx={{ fontSize: 20 }} />
          </IconButton>
        </Tooltip>

        <UserMenu user={MOCK_USER} size={32} />
      </Stack>
    </Box>
  );
}

export default ProductionHeader;
