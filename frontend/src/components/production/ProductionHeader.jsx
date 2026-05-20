import {
  Avatar,
  Box,
  IconButton,
  Stack,
  Tooltip,
  Typography,
  useTheme,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import FileDownloadOutlinedIcon from "@mui/icons-material/FileDownloadOutlined";
import { useNavigate } from "react-router-dom";
import TimeRangeSelect from "./TimeRangeSelect.jsx";
import { useToast } from "@/components/common";

/**
 * Production-dashboard top header.
 *
 * Spec 04 wires the chrome only — TimeRange state is lifted from the
 * page, TyreType is locked to "PCR ONLY" for Banmore (BRD FR-X2),
 * Export toasts a "wait for spec 13" hint, avatar click is a no-op
 * (spec 14).
 */
function ProductionHeader({ plant, timeRange, onTimeRangeChange }) {
  const theme = useTheme();
  const navigate = useNavigate();
  const toast = useToast();

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
      {/* Left: back + brand + plant name */}
      <Stack direction="row" alignItems="center" spacing={1.5}>
        <IconButton
          size="small"
          aria-label="Back to landing"
          onClick={() => navigate("/")}
        >
          <ArrowBackIcon fontSize="small" />
        </IconButton>
        <Box
          sx={{
            width: 32,
            height: 32,
            borderRadius: 1,
            backgroundColor: "primary.main",
            color: "primary.contrastText",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: 700,
            fontSize: 12,
          }}
        >
          JK
        </Box>
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
            onTimeRangeChange({ ...timeRange, preset: p, from: "", to: "" })
          }
          onFromChange={(v) =>
            onTimeRangeChange({ ...timeRange, from: v, preset: null })
          }
          onToChange={(v) =>
            onTimeRangeChange({ ...timeRange, to: v, preset: null })
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
            }}
          >
            PCR ONLY
          </Box>
        </Tooltip>

        <Tooltip title="Export PDF arrives in spec 13" arrow>
          <span>
            <IconButton
              size="small"
              onClick={() =>
                toast.info(
                  "Export PDF arrives in spec 13 — will trigger window.print().",
                )
              }
            >
              <FileDownloadOutlinedIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>

        <Avatar
          sx={{
            width: 32,
            height: 32,
            fontSize: 12,
            fontWeight: 600,
            backgroundColor: "primary.main",
            color: "primary.contrastText",
          }}
        >
          PH
        </Avatar>
      </Stack>
    </Box>
  );
}

export default ProductionHeader;
