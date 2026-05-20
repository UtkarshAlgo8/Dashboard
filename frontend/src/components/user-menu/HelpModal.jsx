import {
  Box,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  Link,
  Stack,
  Typography,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import MenuBookOutlinedIcon from "@mui/icons-material/MenuBookOutlined";
import KeyboardOutlinedIcon from "@mui/icons-material/KeyboardOutlined";
import QuestionAnswerOutlinedIcon from "@mui/icons-material/QuestionAnswerOutlined";
import SupportAgentOutlinedIcon from "@mui/icons-material/SupportAgentOutlined";

/**
 * Help modal per BRD FR-X23. Quick-link list; Phase 1 has no real
 * destinations.
 */
const LINKS = [
  { id: "guide", label: "User Guide", icon: MenuBookOutlinedIcon },
  { id: "keys", label: "Keyboard Shortcuts", icon: KeyboardOutlinedIcon },
  { id: "faq", label: "FAQs", icon: QuestionAnswerOutlinedIcon },
  { id: "support", label: "Support Contact", icon: SupportAgentOutlinedIcon },
];

function HelpModal({ open, onClose }) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ pr: 6 }}>
        Help
        <IconButton
          onClick={onClose}
          sx={{ position: "absolute", top: 12, right: 12 }}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers>
        <Stack spacing={1.5}>
          {LINKS.map((link) => {
            const Icon = link.icon;
            return (
              <Box
                key={link.id}
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 1.25,
                  py: 0.5,
                }}
              >
                <Icon sx={{ fontSize: 18, color: "text.disabled" }} />
                <Link
                  href="#"
                  onClick={(e) => e.preventDefault()}
                  sx={{ fontSize: 14 }}
                  underline="hover"
                >
                  {link.label}
                </Link>
              </Box>
            );
          })}
          <Typography sx={{ fontSize: 11, color: "text.disabled", mt: 1 }}>
            Links land in Phase 2.
          </Typography>
        </Stack>
      </DialogContent>
    </Dialog>
  );
}

export default HelpModal;
