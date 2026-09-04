import {
  Avatar,
  Box,
  IconButton,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import SmartToyIcon from "@mui/icons-material/SmartToy";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import FullscreenIcon from "@mui/icons-material/Fullscreen";
import FullscreenExitIcon from "@mui/icons-material/FullscreenExit";
import RemoveIcon from "@mui/icons-material/Remove";
import CloseIcon from "@mui/icons-material/Close";

/**
 * Header toolbar for the JK Agent chat window.
 *
 * @param {{
 *   isExpanded: boolean,
 *   hasMessages: boolean,
 *   onToggleExpand: () => void,
 *   onMinimize: () => void,
 *   onClose: () => void,
 *   onClear: () => void
 * }} props
 */
export default function JkAgentHeader({
  isExpanded,
  hasMessages,
  onToggleExpand,
  onMinimize,
  onClose,
  onClear,
}) {
  return (
    <Stack
      direction="row"
      alignItems="center"
      justifyContent="space-between"
      sx={{
        px: 2,
        py: 1.5,
        bgcolor: "background.paper",
        borderBottom: "1px solid",
        borderColor: "divider",
        borderTopLeftRadius: "inherit",
        borderTopRightRadius: "inherit",
      }}
    >
      <Stack direction="row" spacing={1.25} alignItems="center">
        <Box sx={{ position: "relative" }}>
          <Avatar
            sx={{
              width: 34,
              height: 34,
              bgcolor: "primary.main",
              color: "primary.contrastText",
            }}
          >
            <SmartToyIcon sx={{ fontSize: 20 }} />
          </Avatar>
          <Box
            sx={{
              position: "absolute",
              bottom: 0,
              right: 0,
              width: 9,
              height: 9,
              borderRadius: "50%",
              bgcolor: "success.main",
              border: "2px solid",
              borderColor: "background.paper",
            }}
          />
        </Box>

        <Stack direction="column" spacing={0}>
          <Typography
            variant="subtitle2"
            sx={{ fontWeight: 700, lineHeight: 1.2 }}
          >
            JK Agent
          </Typography>
          <Typography
            variant="caption"
            sx={{ color: "text.secondary", fontSize: "0.7rem" }}
          >
            Plant Operations AI
          </Typography>
        </Stack>
      </Stack>

      <Stack direction="row" spacing={0.5} alignItems="center">
        {hasMessages && (
          <Tooltip title="Clear Chat" arrow>
            <IconButton
              size="small"
              onClick={onClear}
              aria-label="Clear chat history"
              sx={{
                color: "text.secondary",
                "&:hover": { color: "error.main" },
              }}
            >
              <RestartAltIcon sx={{ fontSize: 19 }} />
            </IconButton>
          </Tooltip>
        )}

        <Tooltip title={isExpanded ? "Restore size" : "Expand window"} arrow>
          <IconButton
            size="small"
            onClick={onToggleExpand}
            aria-label={isExpanded ? "Restore window size" : "Expand window"}
            sx={{
              color: "text.secondary",
              "&:hover": { color: "primary.main" },
            }}
          >
            {isExpanded ? (
              <FullscreenExitIcon sx={{ fontSize: 20 }} />
            ) : (
              <FullscreenIcon sx={{ fontSize: 20 }} />
            )}
          </IconButton>
        </Tooltip>

        <Tooltip title="Minimize" arrow>
          <IconButton
            size="small"
            onClick={onMinimize}
            aria-label="Minimize chat window"
            sx={{
              color: "text.secondary",
              "&:hover": { color: "primary.main" },
            }}
          >
            <RemoveIcon sx={{ fontSize: 20 }} />
          </IconButton>
        </Tooltip>

        <Tooltip title="Close" arrow>
          <IconButton
            size="small"
            onClick={onClose}
            aria-label="Close chat window"
            sx={{
              color: "text.secondary",
              "&:hover": { color: "text.primary" },
            }}
          >
            <CloseIcon sx={{ fontSize: 20 }} />
          </IconButton>
        </Tooltip>
      </Stack>
    </Stack>
  );
}
