import { useState } from "react";
import {
  Avatar,
  Box,
  IconButton,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import SmartToyIcon from "@mui/icons-material/SmartToy";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import CheckIcon from "@mui/icons-material/Check";
import JkAgentMarkdown from "./JkAgentMarkdown.jsx";
import JkAgentDownloadButton from "./JkAgentDownloadButton.jsx";
import JkAgentChart from "./JkAgentChart.jsx";

function formatMessageTime(isoString) {
  if (!isoString) return "";
  try {
    const date = new Date(isoString);
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

/**
 * Renders an individual message bubble for either the user or the JK Agent.
 *
 * @param {{
 *   message: {
 *     id: string,
 *     sender: 'user' | 'agent',
 *     text: string,
 *     timestamp: string,
 *     isError?: boolean
 *   }
 * }} props
 */
export default function JkAgentBubble({ message }) {
  const [copied, setCopied] = useState(false);
  const isUser = message.sender === "user";
  const timeStr = formatMessageTime(message.timestamp);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard write denied */
    }
  };

  if (isUser) {
    return (
      <Stack
        direction="column"
        alignItems="flex-end"
        sx={{ maxWidth: "84%", alignSelf: "flex-end", my: 0.75 }}
      >
        <Box
          sx={{
            px: 2,
            py: 1.25,
            borderRadius: "14px 14px 2px 14px",
            bgcolor: "primary.main",
            color: "primary.contrastText",
            boxShadow: (theme) => theme.custom?.shadow ?? 1,
            wordBreak: "break-word",
          }}
        >
          <Typography variant="body2" sx={{ lineHeight: 1.5 }}>
            {message.text}
          </Typography>
        </Box>
        {timeStr && (
          <Typography
            variant="caption"
            sx={{
              fontSize: "0.7rem",
              color: "text.disabled",
              mt: 0.35,
              mr: 0.5,
            }}
          >
            {timeStr}
          </Typography>
        )}
      </Stack>
    );
  }

  return (
    <Stack
      direction="row"
      spacing={1}
      alignItems="flex-start"
      sx={{ maxWidth: "92%", alignSelf: "flex-start", my: 0.75 }}
    >
      <Avatar
        sx={{
          width: 28,
          height: 28,
          bgcolor: "primary.main",
          color: "primary.contrastText",
          mt: 0.25,
          flexShrink: 0,
        }}
      >
        <SmartToyIcon sx={{ fontSize: 17 }} />
      </Avatar>

      <Stack direction="column" sx={{ flexGrow: 1, minWidth: 0 }}>
        <Box
          sx={{
            p: 1.75,
            borderRadius: "4px 14px 14px 14px",
            bgcolor: "background.paper",
            border: "1px solid",
            borderColor: message.isError ? "error.light" : "divider",
            color: message.isError ? "error.main" : "text.primary",
            boxShadow: (theme) => theme.custom?.shadow ?? 1,
            position: "relative",
            wordBreak: "break-word",
          }}
        >
          <JkAgentMarkdown content={message.text} />

          {message.wantsPlot && message.plotSpec && (
            <JkAgentChart plotSpec={message.plotSpec} rows={message.previewRows} />
          )}

          {message.downloadAvailable && message.resultId && (
            <JkAgentDownloadButton
              resultId={message.resultId}
              columns={message.columns}
            />
          )}

          <Stack
            direction="row"
            justifyContent="space-between"
            alignItems="center"
            sx={{
              mt: 1,
              pt: 0.5,
              borderTop: "1px dashed",
              borderColor: "divider",
            }}
          >
            <Typography
              variant="caption"
              sx={{ fontSize: "0.7rem", color: "text.disabled" }}
            >
              {timeStr}
            </Typography>

            <Tooltip title={copied ? "Copied!" : "Copy response"} arrow>
              <IconButton
                size="small"
                onClick={handleCopy}
                aria-label="Copy response"
                sx={{
                  p: 0.25,
                  color: copied ? "success.main" : "text.disabled",
                  "&:hover": { color: "text.primary" },
                }}
              >
                {copied ? (
                  <CheckIcon sx={{ fontSize: 15 }} />
                ) : (
                  <ContentCopyIcon sx={{ fontSize: 15 }} />
                )}
              </IconButton>
            </Tooltip>
          </Stack>
        </Box>
      </Stack>
    </Stack>
  );
}
