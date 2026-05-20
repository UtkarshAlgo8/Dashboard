import {
  Box,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  Typography,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";

/**
 * My Profile modal per BRD FR-X20. Read-only in Phase 1 (no backend
 * to PATCH).
 */
function ProfileModal({ open, onClose, user }) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ pr: 6 }}>
        My Profile
        <IconButton
          onClick={onClose}
          sx={{ position: "absolute", top: 12, right: 12 }}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers>
        <Stack spacing={1.5}>
          <Field label="Name" value={user.name} />
          <Field label="Role" value={user.role} />
          <Field label="Plant" value={user.plant} />
          <Field label="Email" value={user.email} />
          <Field label="Phone" value={user.phone} />
          <Field label="Employee ID" value={user.employeeId} />
          <Field label="Joined" value={user.joinedDate} />
        </Stack>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, value }) {
  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: "120px 1fr",
        alignItems: "baseline",
      }}
    >
      <Typography sx={{ fontSize: 12, color: "text.disabled" }}>
        {label}
      </Typography>
      <Typography sx={{ fontSize: 14 }}>{value}</Typography>
    </Box>
  );
}

export default ProfileModal;
