import { useEffect, useRef, useState } from "react";
import { Box, Dialog, IconButton, Tooltip, Typography } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import FullscreenIcon from "@mui/icons-material/Fullscreen";
import Highcharts from "highcharts";

/** A separate chart view leaves the original modal, selections and downloads intact. */
function ExpandedChart({ children }) {
  const ref = useRef(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return undefined;
    let frame;
    const resize = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const style = getComputedStyle(element);
        const height = Math.max(
          250,
          element.clientHeight -
            parseFloat(style.paddingTop) -
            parseFloat(style.paddingBottom),
        );
        for (const chart of Highcharts.charts) {
          if (chart && element.contains(chart.renderTo)) {
            chart.setSize(null, height, false);
          }
        }
      });
    };
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    resize();
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [children]);

  return (
    <Box
      ref={ref}
      sx={{
        flex: 1,
        minHeight: 0,
        minWidth: 0,
        overflow: "auto",
        bgcolor: (theme) => theme.custom.surface.soft,
        borderRadius: 1.25,
        p: { xs: 1, sm: 2 },
        "& > *": { width: "100%" },
      }}
    >
      {children}
    </Box>
  );
}

export default function FullscreenChartButton({ title, children }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Tooltip title="Expand chart" arrow>
        <IconButton
          size="small"
          aria-label={`Expand ${title} chart`}
          onClick={() => setOpen(true)}
          sx={{
            width: 28,
            height: 28,
            border: 1,
            borderColor: "divider",
            borderRadius: 1,
            color: "text.primary",
            bgcolor: "background.paper",
            flexShrink: 0,
          }}
        >
          <FullscreenIcon sx={{ fontSize: 18 }} />
        </IconButton>
      </Tooltip>
      <Dialog
        fullScreen
        open={open}
        onClose={() => setOpen(false)}
        aria-labelledby="expanded-chart-title"
      >
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            height: "100%",
            minHeight: 0,
            p: { xs: 1.5, sm: 3 },
            gap: 2,
          }}
        >
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 2,
            }}
          >
            <Typography
              id="expanded-chart-title"
              component="h2"
              sx={{
                fontSize: 18,
                fontWeight: 700,
                color: "text.primary",
                minWidth: 0,
              }}
            >
              {title}
            </Typography>
            <Tooltip title="Exit full screen" arrow>
              <IconButton
                aria-label="Exit full screen"
                onClick={() => setOpen(false)}
              >
                <CloseIcon />
              </IconButton>
            </Tooltip>
          </Box>
          <ExpandedChart>{children}</ExpandedChart>
        </Box>
      </Dialog>
    </>
  );
}
