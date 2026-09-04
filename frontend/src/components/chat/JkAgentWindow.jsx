import {
  Avatar,
  ButtonBase,
  IconButton,
  Paper,
  Tooltip,
  Typography,
} from "@mui/material";
import SmartToyIcon from "@mui/icons-material/SmartToy";
import OpenInFullIcon from "@mui/icons-material/OpenInFull";
import CloseIcon from "@mui/icons-material/Close";
import { useChat } from "@/hooks/useChat.js";
import JkAgentHeader from "./JkAgentHeader.jsx";
import JkAgentMessageList from "./JkAgentMessageList.jsx";
import JkAgentInput from "./JkAgentInput.jsx";

/**
 * Floating window container for the JK Agent chatbot.
 * Handles expanded, standard, and minimized states.
 */
export default function JkAgentWindow() {
  const {
    isOpen,
    isMinimized,
    isExpanded,
    messages,
    isTyping,
    closeChat,
    minimizeChat,
    restoreChat,
    toggleExpand,
    clearChat,
    sendMessage,
  } = useChat();

  if (!isOpen) return null;

  // Minimized bottom bar
  if (isMinimized) {
    return (
      <Paper
        elevation={6}
        sx={{
          position: "fixed",
          bottom: 24,
          right: 24,
          zIndex: 1300,
          borderRadius: 3,
          p: 1,
          px: 1.5,
          bgcolor: "background.paper",
          border: "1px solid",
          borderColor: "divider",
          display: "flex",
          alignItems: "center",
          gap: 1.5,
          boxShadow: (theme) => theme.custom?.floatingShadow ?? 6,
        }}
      >
        <ButtonBase
          onClick={restoreChat}
          aria-label="Restore JK Agent window"
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1,
            borderRadius: 1,
            py: 0.25,
            px: 0.5,
          }}
        >
          <Avatar
            sx={{
              width: 28,
              height: 28,
              bgcolor: "primary.main",
              color: "primary.contrastText",
            }}
          >
            <SmartToyIcon sx={{ fontSize: 16 }} />
          </Avatar>
          <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
            JK Agent
          </Typography>
          {messages.length > 0 && (
            <Typography
              variant="caption"
              sx={{
                bgcolor: (theme) =>
                  theme.custom?.pills?.activeBg ?? "action.hover",
                color: "primary.main",
                px: 0.75,
                py: 0.1,
                borderRadius: 1,
                fontWeight: 700,
              }}
            >
              {messages.length}
            </Typography>
          )}
        </ButtonBase>

        <Tooltip title="Restore size" arrow>
          <IconButton
            size="small"
            onClick={restoreChat}
            aria-label="Restore window"
          >
            <OpenInFullIcon sx={{ fontSize: 16 }} />
          </IconButton>
        </Tooltip>

        <Tooltip title="Close" arrow>
          <IconButton
            size="small"
            onClick={closeChat}
            aria-label="Close window"
          >
            <CloseIcon sx={{ fontSize: 16 }} />
          </IconButton>
        </Tooltip>
      </Paper>
    );
  }

  // Floating Window (Standard vs Expanded)
  return (
    <Paper
      elevation={12}
      sx={{
        position: "fixed",
        bottom: 24,
        right: 24,
        zIndex: 1300,
        width: {
          xs: "calc(100vw - 32px)",
          sm: isExpanded ? 560 : 390,
        },
        height: {
          xs: "calc(100vh - 48px)",
          sm: isExpanded ? "calc(100vh - 48px)" : 590,
        },
        maxHeight: "calc(100vh - 36px)",
        borderRadius: 3,
        overflow: "hidden",
        bgcolor: "background.paper",
        border: "1px solid",
        borderColor: "divider",
        display: "flex",
        flexDirection: "column",
        boxShadow: (theme) => theme.custom?.floatingShadow ?? 12,
        transition:
          "width 0.25s cubic-bezier(0.4, 0, 0.2, 1), height 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
      }}
    >
      <JkAgentHeader
        isExpanded={isExpanded}
        hasMessages={messages.length > 0}
        onToggleExpand={toggleExpand}
        onMinimize={minimizeChat}
        onClose={closeChat}
        onClear={clearChat}
      />

      <JkAgentMessageList
        messages={messages}
        isTyping={isTyping}
        onSend={sendMessage}
      />

      <JkAgentInput onSend={sendMessage} isTyping={isTyping} />
    </Paper>
  );
}
