import { useEffect, useRef } from "react";
import { Avatar, Box, Stack, Typography } from "@mui/material";
import SmartToyIcon from "@mui/icons-material/SmartToy";
import JkAgentBubble from "./JkAgentBubble.jsx";
import JkAgentEmptyState from "./JkAgentEmptyState.jsx";

/**
 * Scrollable container rendering messages, typing animation, or empty state.
 *
 * @param {{
 *   messages: Array<any>,
 *   isTyping: boolean,
 *   onSend: (text: string) => void
 * }} props
 */
export default function JkAgentMessageList({ messages, isTyping, onSend }) {
  const scrollRef = useRef(null);
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  return (
    <Box
      ref={scrollRef}
      sx={{
        flexGrow: 1,
        overflowY: "auto",
        p: 2,
        bgcolor: (theme) =>
          theme.custom?.surface?.default ?? "background.default",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {messages.length === 0 ? (
        <JkAgentEmptyState onSelectPrompt={onSend} />
      ) : (
        <Stack direction="column" spacing={0.5} sx={{ flexGrow: 1 }}>
          {messages.map((msg) => (
            <JkAgentBubble key={msg.id} message={msg} />
          ))}

          {isTyping && (
            <Stack
              direction="row"
              spacing={1}
              alignItems="center"
              sx={{ alignSelf: "flex-start", my: 1 }}
            >
              <Avatar
                sx={{
                  width: 28,
                  height: 28,
                  bgcolor: "primary.main",
                  color: "primary.contrastText",
                }}
              >
                <SmartToyIcon sx={{ fontSize: 17 }} />
              </Avatar>
              <Box
                sx={{
                  px: 2,
                  py: 1.25,
                  borderRadius: "4px 14px 14px 14px",
                  bgcolor: "background.paper",
                  border: "1px solid",
                  borderColor: "divider",
                  boxShadow: (theme) => theme.custom?.shadow ?? 1,
                  display: "flex",
                  alignItems: "center",
                  gap: 0.5,
                }}
              >
                <Typography
                  variant="caption"
                  sx={{ color: "text.secondary", fontWeight: 500 }}
                >
                  JK Agent is analyzing
                </Typography>
                <Stack direction="row" spacing={0.4} sx={{ ml: 0.5 }}>
                  {[0, 1, 2].map((i) => (
                    <Box
                      key={i}
                      sx={{
                        width: 4,
                        height: 4,
                        borderRadius: "50%",
                        bgcolor: "primary.main",
                        animation: "pulse 1.2s infinite ease-in-out",
                        animationDelay: `${i * 0.2}s`,
                        "@keyframes pulse": {
                          "0%, 100%": { opacity: 0.3, transform: "scale(0.8)" },
                          "50%": { opacity: 1, transform: "scale(1.2)" },
                        },
                      }}
                    />
                  ))}
                </Stack>
              </Box>
            </Stack>
          )}

          <Box ref={endRef} sx={{ height: 1 }} />
        </Stack>
      )}
    </Box>
  );
}
