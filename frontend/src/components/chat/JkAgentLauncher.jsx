import { Box, Fab, Tooltip } from "@mui/material";
import SmartToyIcon from "@mui/icons-material/SmartToy";
import { useChat } from "@/hooks/useChat.js";

/**
 * Floating action button in bottom-right corner that launches the JK Agent chat interface.
 */
export default function JkAgentLauncher() {
  const { isOpen, toggleChat } = useChat();

  if (isOpen) return null;

  return (
    <Box
      sx={{
        position: "fixed",
        bottom: 24,
        right: 24,
        zIndex: 1200,
      }}
    >
      <Tooltip title="Chat with JK Agent" placement="left" arrow>
        <Fab
          color="primary"
          onClick={toggleChat}
          aria-label="Open JK Agent chat"
          sx={{
            width: 56,
            height: 56,
            boxShadow: (theme) => theme.custom?.floatingShadow ?? 6,
            transition: "transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)",
            "&:hover": {
              transform: "scale(1.08)",
            },
          }}
        >
          <SmartToyIcon sx={{ fontSize: 28 }} />

          {/* Pulsing online status dot */}
          <Box
            sx={{
              position: "absolute",
              top: 3,
              right: 3,
              width: 13,
              height: 13,
              borderRadius: "50%",
              bgcolor: "success.main",
              border: "2px solid",
              borderColor: "background.paper",
            }}
          />
        </Fab>
      </Tooltip>
    </Box>
  );
}
