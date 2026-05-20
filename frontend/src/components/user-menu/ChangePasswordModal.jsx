import { useState } from "react";
import {
  Box,
  Button,
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

/**
 * Change Password modal per BRD FR-X21. UI only — no backend in
 * Phase 1, so submit toasts "Backend pending" and closes.
 */
function ChangePasswordModal({ open, onClose }) {
  const toast = useToast();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");

  const reset = () => {
    setCurrent("");
    setNext("");
    setConfirm("");
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSubmit = () => {
    if (next !== confirm) {
      toast.error("New password and confirmation don't match.");
      return;
    }
    toast.info("Backend pending — password change isn't wired in Phase 1.");
    handleClose();
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
          />
          <Box>
            <TextField
              label="New password"
              type="password"
              size="small"
              fullWidth
              value={next}
              onChange={(e) => setNext(e.target.value)}
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
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose}>Cancel</Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={!current || !next || !confirm}
        >
          Change
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
