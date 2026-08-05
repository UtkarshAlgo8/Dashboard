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
import { toDisplayDate } from "@/lib/dateFormat.js";

/* eslint-disable no-undef */
const APP_VERSION =
  typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "dev";
/* eslint-enable no-undef */

/**
 * About modal per BRD FR-X24. App name + version (from package.json
 * via Vite `define`) + build date (resolved at module load).
 */
const BUILD_DATE = toDisplayDate(new Date());

function AboutModal({ open, onClose }) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ pr: 6 }}>
        About
        <IconButton
          onClick={onClose}
          sx={{ position: "absolute", top: 12, right: 12 }}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers>
        <Stack spacing={1.5}>
          <Box>
            <Typography sx={{ fontSize: 11, color: "text.disabled" }}>
              Application
            </Typography>
            <Typography sx={{ fontSize: 16, fontWeight: 700 }}>
              One Factory One Dashboard
            </Typography>
          </Box>
          <Box>
            <Typography sx={{ fontSize: 11, color: "text.disabled" }}>
              Version
            </Typography>
            <Typography sx={{ fontSize: 14 }}>{APP_VERSION}</Typography>
          </Box>
          <Box>
            <Typography sx={{ fontSize: 11, color: "text.disabled" }}>
              Build Date
            </Typography>
            <Typography sx={{ fontSize: 14 }}>{BUILD_DATE}</Typography>
          </Box>
          <Box>
            <Typography sx={{ fontSize: 11, color: "text.disabled" }}>
              Credits
            </Typography>
            <Typography sx={{ fontSize: 13 }}>
              JK Tyre · ALGO8 AI · React + MUI
            </Typography>
          </Box>
        </Stack>
      </DialogContent>
    </Dialog>
  );
}

export default AboutModal;
