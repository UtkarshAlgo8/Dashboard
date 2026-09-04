import { useRef, useState } from "react";
import {
  Box,
  CircularProgress,
  IconButton,
  InputBase,
  Stack,
  Tooltip,
} from "@mui/material";
import SendRoundedIcon from "@mui/icons-material/SendRounded";

/**
 * Message input box with auto-expanding textarea and send controls.
 *
 * @param {{
 *   onSend: (text: string) => void,
 *   isTyping: boolean
 * }} props
 */
export default function JkAgentInput({ onSend, isTyping }) {
  const [text, setText] = useState("");
  const inputRef = useRef(null);

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed || isTyping) return;
    onSend(trimmed);
    setText("");
    if (inputRef.current) {
      inputRef.current.focus();
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <Box
      sx={{
        p: 1.5,
        bgcolor: "background.paper",
        borderTop: "1px solid",
        borderColor: "divider",
        borderBottomLeftRadius: "inherit",
        borderBottomRightRadius: "inherit",
      }}
    >
      <Stack
        direction="row"
        spacing={1}
        alignItems="flex-end"
        sx={{
          p: 0.75,
          borderRadius: 2,
          bgcolor: (theme) => theme.custom?.surface?.soft ?? "action.hover",
          border: "1px solid",
          borderColor: "divider",
          transition: "border-color 0.15s ease",
          "&:focus-within": {
            borderColor: "primary.main",
            bgcolor: "background.paper",
          },
        }}
      >
        <InputBase
          inputRef={inputRef}
          multiline
          minRows={1}
          maxRows={4}
          fullWidth
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask JK Agent about Banmore plant..."
          aria-label="Ask JK Agent a question"
          sx={{
            px: 1,
            py: 0.5,
            fontSize: "0.875rem",
            lineHeight: 1.45,
            color: "text.primary",
          }}
        />

        <Tooltip title="Send message (Enter)" arrow>
          <span>
            <IconButton
              size="small"
              onClick={handleSend}
              disabled={!text.trim() || isTyping}
              aria-label="Send message"
              sx={{
                width: 32,
                height: 32,
                bgcolor:
                  text.trim() && !isTyping ? "primary.main" : "transparent",
                color:
                  text.trim() && !isTyping
                    ? "primary.contrastText"
                    : "text.disabled",
                "&:hover": {
                  bgcolor:
                    text.trim() && !isTyping ? "primary.dark" : "transparent",
                },
                "&.Mui-disabled": {
                  color: "text.disabled",
                },
                transition: "all 0.15s ease",
              }}
            >
              {isTyping ? (
                <CircularProgress size={16} color="inherit" />
              ) : (
                <SendRoundedIcon sx={{ fontSize: 18 }} />
              )}
            </IconButton>
          </span>
        </Tooltip>
      </Stack>
    </Box>
  );
}
