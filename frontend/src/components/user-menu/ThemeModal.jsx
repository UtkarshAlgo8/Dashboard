import {
  Box,
  Dialog,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  IconButton,
  Radio,
  RadioGroup,
  Typography,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";

/**
 * Theme modal per BRD FR-X22. Light is the only active option.
 * Dark / System are labeled "coming soon" and disabled.
 */
function ThemeModal({ open, onClose }) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ pr: 6 }}>
        Theme
        <IconButton
          onClick={onClose}
          sx={{ position: "absolute", top: 12, right: 12 }}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers>
        <FormControl>
          <RadioGroup value="light">
            <FormControlLabel
              value="light"
              control={<Radio />}
              label={
                <Box>
                  <Typography>Light</Typography>
                  <Typography sx={{ fontSize: 11, color: "text.disabled" }}>
                    Default theme for Phase 1.
                  </Typography>
                </Box>
              }
            />
            <FormControlLabel
              value="dark"
              control={<Radio disabled />}
              disabled
              label={
                <Box>
                  <Typography>Dark</Typography>
                  <Typography sx={{ fontSize: 11, color: "text.disabled" }}>
                    Coming soon.
                  </Typography>
                </Box>
              }
            />
            <FormControlLabel
              value="system"
              control={<Radio disabled />}
              disabled
              label={
                <Box>
                  <Typography>System</Typography>
                  <Typography sx={{ fontSize: 11, color: "text.disabled" }}>
                    Coming soon.
                  </Typography>
                </Box>
              }
            />
          </RadioGroup>
        </FormControl>
      </DialogContent>
    </Dialog>
  );
}

export default ThemeModal;
