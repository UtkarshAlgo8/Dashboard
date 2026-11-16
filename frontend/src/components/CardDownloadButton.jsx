import { useState } from "react";
import {
  IconButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Tooltip,
} from "@mui/material";
import DownloadIcon from "@mui/icons-material/Download";
import PictureAsPdfIcon from "@mui/icons-material/PictureAsPdf";
import GridOnIcon from "@mui/icons-material/GridOn";
import { useTheme } from "@mui/material/styles";
import { exportElementToPdf } from "@/lib/exportPdf.js";
import { exportRowsAsExcel } from "@/lib/xlsx.js";

/**
 * Single download icon at the top-left of a card.
 *
 *   cardRef        : ref to the card root element — enables PDF capture
 *   rows + headers : tabular data — enables Excel export
 *   filename       : base file name (extension added per format)
 *   excelExport    : optional async Excel action for server-generated workbooks
 *   onExportError / onBusyChange : optional lifecycle callbacks
 *   expandScrollContainers : opt-in nested-scroll PDF capture (default false)
 *
 *   - cardRef only                 → single PDF button
 *   - rows + headers only          → single Excel button
 *   - both                         → small menu with PDF / Excel choices
 *   - neither                      → renders nothing
 *
 * Visual: 22×22 outlined IconButton (matches KpiCard's Trend/Drill buttons).
 * Caller positions it via `sx` (typically `position: absolute; top: 4; left: 4`,
 * or as the first item in an existing header Stack).
 */
function CardDownloadButton({
  cardRef,
  rows,
  headers,
  filename,
  sheetName,
  excelExport,
  onExportError,
  onBusyChange,
  expandScrollContainers = false,
  disabled = false,
  sx,
  ...rest
}) {
  const theme = useTheme();
  // hasPdf / hasExcel are read at render. The ref is only dereferenced in
  // the click handler — but the lint rule fires on any `cardRef` reference
  // in render. We only check the prop's presence (the ref object itself),
  // never `.current`.
  // eslint-disable-next-line react-hooks/refs
  const hasPdf = Boolean(cardRef);
  const hasExcel =
    (Array.isArray(rows) || typeof excelExport === "function") &&
    Array.isArray(headers) &&
    headers.length > 0;

  const [anchor, setAnchor] = useState(null);
  const [busy, setBusy] = useState(false);

  if (!hasPdf && !hasExcel) return null;

  const onPdf = async () => {
    setAnchor(null);
    const el = cardRef?.current;
    if (!el || busy) return;
    setBusy(true);
    onBusyChange?.(true);
    try {
      await exportElementToPdf(el, {
        filename: `${filename ?? "card"}.pdf`,
        backgroundColor: theme.palette.background.default,
        expandScrollContainers,
      });
    } catch (error) {
      if (!onExportError) throw error;
      onExportError(error);
    } finally {
      setBusy(false);
      onBusyChange?.(false);
    }
  };

  const onExcel = async () => {
    setAnchor(null);
    if (busy) return;
    setBusy(true);
    onBusyChange?.(true);
    try {
      if (excelExport) {
        await excelExport();
      } else {
        await exportRowsAsExcel({
          headers,
          rows,
          filename: filename ?? "data",
          sheetName,
        });
      }
    } catch (error) {
      if (!onExportError) throw error;
      onExportError(error);
    } finally {
      setBusy(false);
      onBusyChange?.(false);
    }
  };

  const iconSx = { fontSize: 18 };
  const buttonSx = {
    width: 32,
    height: 32,
    border: 1,
    borderColor: "divider",
    borderRadius: 1.5,
    backgroundColor: "background.paper",
    color: "text.primary",
    boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
    "&:hover": {
      borderColor: "primary.main",
      color: "primary.main",
      backgroundColor: theme.custom.surface.soft,
    },
    ...(sx ?? {}),
  };

  // Single-format: PDF only.
  if (hasPdf && !hasExcel) {
    return (
      <Tooltip title="Download PDF" arrow>
        <IconButton
          size="small"
          onClick={onPdf}
          disabled={busy || disabled}
          aria-label="Download PDF"
          sx={buttonSx}
          {...rest}
        >
          <DownloadIcon sx={iconSx} />
        </IconButton>
      </Tooltip>
    );
  }

  // Single-format: Excel only.
  if (!hasPdf && hasExcel) {
    return (
      <Tooltip title="Download Excel" arrow>
        <IconButton
          size="small"
          onClick={onExcel}
          disabled={busy || disabled}
          aria-label="Download Excel"
          sx={buttonSx}
          {...rest}
        >
          <DownloadIcon sx={iconSx} />
        </IconButton>
      </Tooltip>
    );
  }

  // Both formats available — menu.
  return (
    <>
      <Tooltip title="Download" arrow>
        <IconButton
          size="small"
          onClick={(e) => setAnchor(e.currentTarget)}
          disabled={busy || disabled}
          aria-label="Download"
          aria-haspopup="menu"
          sx={buttonSx}
          {...rest}
        >
          <DownloadIcon sx={iconSx} />
        </IconButton>
      </Tooltip>
      <Menu
        anchorEl={anchor}
        open={Boolean(anchor)}
        onClose={() => setAnchor(null)}
        slotProps={{ paper: { sx: { minWidth: 180 } } }}
      >
        <MenuItem onClick={onPdf} disabled={busy || disabled}>
          <ListItemIcon>
            <PictureAsPdfIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText
            primary="Download as PDF"
            primaryTypographyProps={{ fontSize: 13 }}
          />
        </MenuItem>
        <MenuItem onClick={onExcel} disabled={busy || disabled}>
          <ListItemIcon>
            <GridOnIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText
            primary="Download as Excel"
            primaryTypographyProps={{ fontSize: 13 }}
          />
        </MenuItem>
      </Menu>
    </>
  );
}

export default CardDownloadButton;
