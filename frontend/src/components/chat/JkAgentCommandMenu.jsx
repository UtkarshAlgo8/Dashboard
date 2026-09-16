import { Box, List, ListItemButton, Paper, Stack, Typography } from "@mui/material";

/**
 * The slash-command palette that opens when the user types "/" in the
 * chat input. Purely presentational — the input owns selection state and
 * keyboard handling, so the same highlight follows both the arrow keys
 * and the mouse.
 *
 * @param {{
 *   intents: ReadonlyArray<object>,
 *   activeIndex: number,
 *   onSelect: (intent: object) => void,
 *   onHover: (index: number) => void
 * }} props
 */
export default function JkAgentCommandMenu({
  intents,
  activeIndex,
  onSelect,
  onHover,
}) {
  if (intents.length === 0) return null;

  return (
    <Paper
      elevation={8}
      role="listbox"
      aria-label="JK Agent commands"
      sx={{
        position: "absolute",
        bottom: "calc(100% + 8px)",
        left: 0,
        right: 0,
        zIndex: 1400,
        borderRadius: 2,
        border: "1px solid",
        borderColor: "divider",
        overflow: "hidden",
      }}
    >
      <Typography
        variant="caption"
        sx={{
          display: "block",
          px: 1.5,
          pt: 1,
          pb: 0.5,
          color: "text.disabled",
          fontSize: "0.68rem",
          letterSpacing: 0.4,
          textTransform: "uppercase",
        }}
      >
        Commands
      </Typography>
      <List dense disablePadding>
        {intents.map((intent, index) => {
          const { Icon } = intent;
          const selected = index === activeIndex;
          return (
            <ListItemButton
              key={intent.value}
              role="option"
              aria-selected={selected}
              selected={selected}
              onMouseEnter={() => onHover(index)}
              // onMouseDown, not onClick: the input must not lose focus
              // before the selection is applied.
              onMouseDown={(e) => {
                e.preventDefault();
                onSelect(intent);
              }}
              sx={{
                py: 0.85,
                px: 1.5,
                gap: 1.25,
                "&.Mui-selected": { bgcolor: "action.selected" },
                "&.Mui-selected:hover": { bgcolor: "action.selected" },
              }}
            >
              <Icon sx={{ fontSize: 18, color: "primary.main", flexShrink: 0 }} />
              <Stack direction="column" sx={{ minWidth: 0 }}>
                <Typography
                  variant="body2"
                  sx={{ fontWeight: 600, fontSize: "0.8rem", lineHeight: 1.3 }}
                >
                  {intent.command}
                </Typography>
                <Typography
                  variant="caption"
                  sx={{ color: "text.secondary", fontSize: "0.7rem" }}
                >
                  {intent.description}
                </Typography>
              </Stack>
              <Box sx={{ flexGrow: 1 }} />
            </ListItemButton>
          );
        })}
      </List>
    </Paper>
  );
}
