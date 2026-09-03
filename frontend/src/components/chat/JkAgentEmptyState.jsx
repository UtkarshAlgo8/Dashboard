import {
  Avatar,
  Box,
  ButtonBase,
  Chip,
  Stack,
  Typography,
} from "@mui/material";
import SmartToyIcon from "@mui/icons-material/SmartToy";
import QueryStatsIcon from "@mui/icons-material/QueryStats";
import EngineeringIcon from "@mui/icons-material/Engineering";
import PrecisionManufacturingIcon from "@mui/icons-material/PrecisionManufacturing";
import CompareArrowsIcon from "@mui/icons-material/CompareArrows";

const SUGGESTED_PROMPTS = [
  {
    icon: QueryStatsIcon,
    title: "Current Plant OEE",
    query: "What is Banmore's current OEE across sections?",
  },
  {
    icon: EngineeringIcon,
    title: "Downtime Breakdown",
    query: "Show me top downtime causes for yesterday",
  },
  {
    icon: PrecisionManufacturingIcon,
    title: "Scrap & Quality Rate",
    query: "Explain the scrap rate in Curing and TBM sections",
  },
  {
    icon: CompareArrowsIcon,
    title: "Shift Comparison",
    query: "Compare Shift A vs Shift B production output",
  },
];

/**
 * Initial empty state with JK Agent introduction and operational quick-prompt chips.
 *
 * @param {{ onSelectPrompt: (promptText: string) => void }} props
 */
export default function JkAgentEmptyState({ onSelectPrompt }) {
  return (
    <Stack
      direction="column"
      alignItems="center"
      justifyContent="center"
      spacing={2.5}
      sx={{
        py: 4,
        px: 2,
        textAlign: "center",
      }}
    >
      <Stack direction="column" alignItems="center" spacing={1}>
        <Box sx={{ position: "relative" }}>
          <Avatar
            sx={{
              width: 54,
              height: 54,
              bgcolor: "primary.main",
              color: "primary.contrastText",
              boxShadow: (theme) => theme.custom?.floatingShadow ?? 2,
            }}
          >
            <SmartToyIcon sx={{ fontSize: 32 }} />
          </Avatar>
          <Box
            sx={{
              position: "absolute",
              bottom: 1,
              right: 1,
              width: 12,
              height: 12,
              borderRadius: "50%",
              bgcolor: "success.main",
              border: "2px solid",
              borderColor: "background.paper",
            }}
          />
        </Box>

        <Typography variant="h6" sx={{ fontWeight: 700, mt: 1 }}>
          JK Agent
        </Typography>

        <Chip
          label="Operations AI • Ready"
          size="small"
          sx={{
            fontWeight: 600,
            fontSize: "0.75rem",
            bgcolor: (theme) => theme.custom?.pills?.activeBg ?? "action.hover",
            color: "primary.main",
            border: "1px solid",
            borderColor: "primary.light",
          }}
        />

        <Typography
          variant="body2"
          sx={{
            color: "text.secondary",
            maxWidth: 320,
            lineHeight: 1.45,
            mt: 0.5,
          }}
        >
          Ask questions about plant performance, OEE trends, equipment downtime,
          and scrap analysis.
        </Typography>
      </Stack>

      <Stack direction="column" spacing={1} sx={{ width: "100%", pt: 1 }}>
        <Typography
          variant="caption"
          sx={{
            color: "text.disabled",
            textTransform: "uppercase",
            fontWeight: 700,
            letterSpacing: 0.8,
            alignSelf: "flex-start",
            pl: 0.5,
          }}
        >
          Suggested Inquiries
        </Typography>

        <Stack direction="column" spacing={1}>
          {SUGGESTED_PROMPTS.map((prompt) => {
            const Icon = prompt.icon;
            return (
              <ButtonBase
                key={prompt.title}
                onClick={() => onSelectPrompt(prompt.query)}
                sx={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "flex-start",
                  width: "100%",
                  p: 1.25,
                  borderRadius: 2,
                  bgcolor: "background.paper",
                  border: "1px solid",
                  borderColor: "divider",
                  textAlign: "left",
                  transition: "all 0.15s ease",
                  "&:hover": {
                    bgcolor: (theme) =>
                      theme.custom?.pills?.activeBg ?? "action.hover",
                    borderColor: "primary.main",
                    transform: "translateY(-1px)",
                  },
                }}
              >
                <Avatar
                  sx={{
                    width: 32,
                    height: 32,
                    bgcolor: (theme) =>
                      theme.custom?.pills?.activeBg ?? "action.hover",
                    color: "primary.main",
                    mr: 1.5,
                    flexShrink: 0,
                  }}
                >
                  <Icon sx={{ fontSize: 18 }} />
                </Avatar>

                <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                  <Typography
                    variant="caption"
                    sx={{
                      fontWeight: 600,
                      color: "text.primary",
                      display: "block",
                    }}
                  >
                    {prompt.title}
                  </Typography>
                  <Typography
                    variant="caption"
                    noWrap
                    sx={{
                      color: "text.secondary",
                      display: "block",
                      fontSize: "0.72rem",
                    }}
                  >
                    {prompt.query}
                  </Typography>
                </Box>
              </ButtonBase>
            );
          })}
        </Stack>
      </Stack>
    </Stack>
  );
}
