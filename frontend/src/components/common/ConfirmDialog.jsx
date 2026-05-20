import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
} from "@mui/material";

/**
 * Yes/no confirmation modal with cancel-by-default focus.
 */
function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  body,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  confirmColor = "primary",
  loading = false,
}) {
  const confirmBg = confirmColor === "error" ? "#D32F2F" : "#0077B8";

  return (
    <Dialog
      open={open}
      onClose={onClose}
      PaperProps={{ sx: { borderRadius: "10px", minWidth: 360, p: 1 } }}
    >
      <DialogTitle sx={{ fontSize: "18px", fontWeight: 500, color: "#404040" }}>
        {title}
      </DialogTitle>
      <DialogContent>
        <DialogContentText
          sx={{ fontSize: "13px", color: "#404040" }}
          component="div"
        >
          {body}
        </DialogContentText>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button
          autoFocus
          onClick={onClose}
          disabled={loading}
          sx={{
            borderRadius: "20px",
            textTransform: "capitalize",
            fontSize: "13px",
            color: "#404040",
            border: "1px solid #D4D4D4",
            px: 2,
            height: "32px",
          }}
        >
          {cancelLabel}
        </Button>
        <Button
          onClick={onConfirm}
          disabled={loading}
          sx={{
            borderRadius: "20px",
            textTransform: "capitalize",
            fontSize: "13px",
            color: "white",
            backgroundColor: confirmBg,
            "&:hover": { backgroundColor: confirmBg, opacity: 0.9 },
            px: 2,
            height: "32px",
          }}
        >
          {loading ? "..." : confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default ConfirmDialog;
