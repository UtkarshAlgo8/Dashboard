import { useState } from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import { useToast } from "@/components/common";
import { changePasswordRequest } from "@/api/auth.js";

/**
 * Change Password modal per BRD FR-X21. Submits to
 * POST /api/v1/auth/change-password with the current JWT.
 */
function ChangePasswordModal({ open, onClose }) {
  const toast = useToast();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const reset = () => {
    setCurrent("");
    setNext("");
    setConfirm("");
    setError(null);
  };

  const handleClose = () => {
    if (submitting) return;
    reset();
    onClose();
  };

  const handleSubmit = async () => {
    if (next !== confirm) {
      setError("New password and confirmation don't match.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await changePasswordRequest({
        oldPassword: current,
        newPassword: next,
      });
      toast.success("Password updated.");
      handleClose();
    } catch (err) {
      setError(err?.message || "Could not update password.");
    } finally {
      setSubmitting(false);
    }
  };

  const strength = scoreStrength(next);

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ pr: 6 }}>
        Change Password
        <IconButton
          onClick={handleClose}
          sx={{ position: "absolute", top: 12, right: 12 }}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <TextField
            label="Current password"
            type="password"
            size="small"
            fullWidth
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            disabled={submitting}
          />
          <Box>
            <TextField
              label="New password"
              type="password"
              size="small"
              fullWidth
              value={next}
              onChange={(e) => setNext(e.target.value)}
              disabled={submitting}
            />
            {next && (
              <Typography sx={{ fontSize: 11, mt: 0.5, color: strength.color }}>
                Strength: {strength.label}
              </Typography>
            )}
          </Box>
          <TextField
            label="Confirm new password"
            type="password"
            size="small"
            fullWidth
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            disabled={submitting}
          />
          {error && (
            <Alert severity="error" sx={{ borderRadius: 2 }}>
              {error}
            </Alert>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={submitting}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={submitting || !current || !next || !confirm}
          startIcon={
            submitting ? <CircularProgress size={14} color="inherit" /> : null
          }
        >
          {submitting ? "Saving…" : "Change"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function scoreStrength(pwd) {
  let score = 0;
  if (pwd.length >= 8) score += 1;
  if (/[a-z]/.test(pwd) && /[A-Z]/.test(pwd)) score += 1;
  if (/\d/.test(pwd)) score += 1;
  if (/[^A-Za-z0-9]/.test(pwd)) score += 1;
  if (score <= 1) return { label: "Weak", color: "error.main" };
  if (score === 2) return { label: "OK", color: "warning.main" };
  if (score === 3) return { label: "Good", color: "info.main" };
  return { label: "Strong", color: "success.main" };
}

export default ChangePasswordModal;
