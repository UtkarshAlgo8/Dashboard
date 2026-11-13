import { useEffect, useMemo, useRef, useState } from "react";
import {
  Box,
  CircularProgress,
  IconButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Stack,
  Tooltip,
  Typography,
  useTheme,
} from "@mui/material";
import DownloadIcon from "@mui/icons-material/Download";
import ImageIcon from "@mui/icons-material/Image";
import PictureAsPdfIcon from "@mui/icons-material/PictureAsPdf";
import Highcharts from "highcharts";
import HighchartsReactImport from "highcharts-react-official";
import { downloadChatResult } from "@/api/chat.js";
import {
  chatChartFilename,
  downloadElementAsPng,
} from "@/lib/chatChartDownload.js";
import { buildChartOptions } from "@/lib/chatPlot.js";
import { exportElementToPdf } from "@/lib/exportPdf.js";

// See frontend/src/components/trend/LineChart.jsx for why this
// normalisation is needed (CJS/ESM interop on the UMD bundle).
const HighchartsReact = HighchartsReactImport?.default ?? HighchartsReactImport;

/**
 * Renders the chart a JK Agent response asked for (`wants_plot` +
 * `plot_spec`).
 *
 * The rows are fetched from /chat/download/{resultId} rather than read off
 * the chat response: this build of the upstream dropped `preview_rows`, so
 * the cached result set is the only place the actual data lives. That
 * makes plotting a second round-trip, hence the loading state.
 *
 * @param {{ plotSpec: object, resultId: string }} props
 */
export default function JkAgentChart({ plotSpec, resultId }) {
  const theme = useTheme();
  const chartRef = useRef(null);
  // Result and its id are stored together so a change of `resultId`
  // invalidates the previous rows by derivation rather than by resetting
  // state from inside the effect.
  const [result, setResult] = useState(null);
  const [downloadAnchor, setDownloadAnchor] = useState(null);
  const [downloadBusy, setDownloadBusy] = useState(false);

  useEffect(() => {
    if (!resultId) return undefined;

    // Guards against a late response from a superseded resultId
    // overwriting the rows of the current one.
    let cancelled = false;

    downloadChatResult(resultId)
      .then((data) => {
        if (!cancelled) setResult({ resultId, rows: data.rows ?? [] });
      })
      .catch(() => {
        if (!cancelled) setResult({ resultId, failed: true });
      });

    return () => {
      cancelled = true;
    };
  }, [resultId]);

  const current = result?.resultId === resultId ? result : null;
  const isError = !resultId || Boolean(current?.failed);
  const isLoading = !isError && !current;

  const options = useMemo(
    () =>
      current?.rows ? buildChartOptions(plotSpec, current.rows, theme) : null,
    [plotSpec, current, theme],
  );

  if (isLoading) {
    return (
      <Stack
        direction="row"
        spacing={1}
        alignItems="center"
        sx={{ mt: 1, py: 2, color: "text.disabled" }}
      >
        <CircularProgress size={14} color="inherit" />
        <Typography variant="caption">Loading chart data…</Typography>
      </Stack>
    );
  }

  if (isError || !options) {
    return (
      <Typography
        variant="caption"
        sx={{ display: "block", mt: 1, color: "text.disabled" }}
      >
        Chart unavailable — the result data could not be loaded.
      </Typography>
    );
  }

  const onDownloadPng = async () => {
    setDownloadAnchor(null);
    if (!chartRef.current || downloadBusy) return;
    setDownloadBusy(true);
    try {
      await downloadElementAsPng(
        chartRef.current,
        chatChartFilename(resultId, "png"),
      );
    } finally {
      setDownloadBusy(false);
    }
  };

  const onDownloadPdf = async () => {
    setDownloadAnchor(null);
    if (!chartRef.current || downloadBusy) return;
    setDownloadBusy(true);
    try {
      await exportElementToPdf(chartRef.current, {
        filename: chatChartFilename(resultId, "pdf"),
        backgroundColor: theme.palette.common.white,
      });
    } finally {
      setDownloadBusy(false);
    }
  };

  return (
    <Box sx={{ mt: 1, mx: -0.5, position: "relative" }}>
      <Tooltip title="Download plot" arrow>
        <IconButton
          size="small"
          aria-label="Download plot"
          aria-haspopup="menu"
          disabled={downloadBusy}
          onClick={(e) => setDownloadAnchor(e.currentTarget)}
          sx={{
            position: "absolute",
            top: 8,
            right: 8,
            zIndex: 2,
            width: 30,
            height: 30,
            borderRadius: 1.5,
            border: 1,
            borderColor: "divider",
            bgcolor: "background.paper",
            color: "text.secondary",
            boxShadow: "0 1px 4px rgba(0,0,0,0.12)",
            "&:hover": {
              color: "primary.main",
              borderColor: "primary.main",
              bgcolor: theme.custom?.surface?.soft ?? "background.paper",
            },
          }}
        >
          <DownloadIcon sx={{ fontSize: 17 }} />
        </IconButton>
      </Tooltip>
      <Menu
        anchorEl={downloadAnchor}
        open={Boolean(downloadAnchor)}
        onClose={() => setDownloadAnchor(null)}
        slotProps={{ paper: { sx: { minWidth: 170 } } }}
      >
        <MenuItem onClick={onDownloadPng} disabled={downloadBusy}>
          <ListItemIcon>
            <ImageIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText
            primary="Download image"
            primaryTypographyProps={{ fontSize: 13 }}
          />
        </MenuItem>
        <MenuItem onClick={onDownloadPdf} disabled={downloadBusy}>
          <ListItemIcon>
            <PictureAsPdfIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText
            primary="Download PDF"
            primaryTypographyProps={{ fontSize: 13 }}
          />
        </MenuItem>
      </Menu>
      <Box ref={chartRef}>
        <HighchartsReact highcharts={Highcharts} options={options} />
      </Box>
    </Box>
  );
}
