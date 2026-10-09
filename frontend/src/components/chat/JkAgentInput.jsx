import { useRef, useState } from "react";
import {
  Box,
  Chip,
  CircularProgress,
  IconButton,
  InputBase,
  Stack,
  Tooltip,
} from "@mui/material";
import SendRoundedIcon from "@mui/icons-material/SendRounded";
import {
  DEFAULT_INTENT,
  findIntent,
  isCommandToken,
  matchIntents,
} from "@/lib/chatIntents.js";
import JkAgentCommandMenu from "./JkAgentCommandMenu.jsx";

/**
 * Message input with an intent selector.
 *
 * Typing "/" opens the command palette; picking an entry (click, Enter or
 * Tab) lifts the command out of the text and shows it as a chip, so the
 * query the user then types is sent clean and the command never reaches
 * the upstream as part of `query`. No chip means intent "query".
 *
 * The chip is per-message: it resets after each send rather than sticking
 * for the session.
 *
 * @param {{
 *   onSend: (text: string, intent: string) => void,
 *   isTyping: boolean
 * }} props
 */
export default function JkAgentInput({ onSend, isTyping }) {
  const [text, setText] = useState("");
  const [intent, setIntent] = useState(DEFAULT_INTENT);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef(null);

  const selectedIntent = intent === DEFAULT_INTENT ? null : findIntent(intent);
  // The palette is open only while the whole input is one unfinished
  // slash token, and only when no chip has been applied yet.
  const isPickingCommand = !selectedIntent && isCommandToken(text);
  const matches = isPickingCommand ? matchIntents(text) : [];
  const isMenuOpen = matches.length > 0;

  const focusInput = () => inputRef.current?.focus();

  const applyIntent = (chosen) => {
    setIntent(chosen.value);
    setText("");
    setActiveIndex(0);
    focusInput();
  };

  const clearIntent = () => {
    setIntent(DEFAULT_INTENT);
    focusInput();
  };

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed || isTyping) return;
    onSend(trimmed, intent);
    setText("");
    setIntent(DEFAULT_INTENT);
    setActiveIndex(0);
    focusInput();
  };

  const handleChange = (e) => {
    const next = e.target.value;
    setText(next);
    // Reset the highlight whenever the filter changes, so the first
    // still-matching command is the one Enter picks.
    setActiveIndex(0);
  };

  const handleKeyDown = (e) => {
    if (isMenuOpen) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => (i + 1) % matches.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => (i - 1 + matches.length) % matches.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        applyIntent(matches[activeIndex]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setText("");
        return;
      }
    }

    // Backspace at the very start of an empty box peels the chip off,
    // the same way the command was applied.
    if (e.key === "Backspace" && selectedIntent && text.length === 0) {
      e.preventDefault();
      clearIntent();
      return;
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const canSend = Boolean(text.trim()) && !isTyping;

  return (
    <Box
      sx={{
        p: 1.5,
        bgcolor: "background.paper",
        borderTop: "1px solid",
        borderColor: "divider",
        borderBottomLeftRadius: "inherit",
        borderBottomRightRadius: "inherit",
        position: "relative",
      }}
    >
      {isMenuOpen && (
        <Box sx={{ position: "absolute", left: 12, right: 12, bottom: "100%" }}>
          <JkAgentCommandMenu
            intents={matches}
            activeIndex={activeIndex}
            onSelect={applyIntent}
            onHover={setActiveIndex}
          />
        </Box>
      )}

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
        {selectedIntent && (
          <Chip
            size="small"
            icon={<selectedIntent.Icon sx={{ fontSize: 15 }} />}
            label={selectedIntent.label}
            onDelete={clearIntent}
            sx={{
              alignSelf: "center",
              ml: 0.5,
              fontWeight: 600,
              fontSize: "0.7rem",
              height: 24,
              bgcolor: "primary.main",
              color: "primary.contrastText",
              "& .MuiChip-icon": { color: "inherit", ml: 0.5 },
              "& .MuiChip-deleteIcon": {
                color: "inherit",
                opacity: 0.7,
                fontSize: 15,
                "&:hover": { color: "inherit", opacity: 1 },
              },
            }}
          />
        )}

        <InputBase
          inputRef={inputRef}
          multiline
          minRows={1}
          maxRows={4}
          fullWidth
          value={text}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={
            selectedIntent
              ? `${selectedIntent.description}…`
              : "Ask JK Agent, or / for commands"
          }
          aria-label="Ask JK Agent a question"
          aria-expanded={isMenuOpen}
          aria-autocomplete="list"
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
              disabled={!canSend}
              aria-label="Send message"
              sx={{
                width: 32,
                height: 32,
                bgcolor: canSend ? "primary.main" : "transparent",
                color: canSend ? "primary.contrastText" : "text.disabled",
                "&:hover": {
                  bgcolor: canSend ? "primary.dark" : "transparent",
                },
                "&.Mui-disabled": { color: "text.disabled" },
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
