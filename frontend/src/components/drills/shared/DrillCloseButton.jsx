import { Button } from "@mui/material";
import CancelIcon from "@mui/icons-material/Cancel";

/**
 * Styled pill "Close" button for drill-down headers.
 * Matches user's rounded pill design with white circular cancel icon.
 */
export default function DrillCloseButton({ onClose, sx }) {
  if (!onClose) return null;
  return (
    <Button
      variant="contained"
      size="small"
      onClick={onClose}
      startIcon={
        <CancelIcon
          sx={{
            fontSize: 16,
            color: "common.white",
          }}
        />
      }
      sx={{
        backgroundColor: (t) => t.custom.drillClose.bg,
        color: "common.white",
        borderRadius: "20px",
        px: 1.5,
        py: 0.4,
        fontSize: 12.5,
        fontWeight: 600,
        textTransform: "none",
        minHeight: 32,
        height: 32,
        boxShadow: "none",
        "&:hover": {
          backgroundColor: (t) => t.custom.drillClose.hover,
          boxShadow: "0 1px 4px rgba(0,0,0,0.15)",
        },
        ...sx,
      }}
    >
      Close
    </Button>
  );
}
