import { Box, Stack, Tooltip, useTheme } from "@mui/material";

/**
 * Adobe XD Segmented Pill Group
 *
 * Renders a rounded container enclosing options.
 * The active item has light-blue background, blue border,
 * and blue text.
 */
function NavTabs({
  items,
  value,
  onChange,
  disabledTooltip,
  size = "md",
  prefixLabel = null,
}) {
  const theme = useTheme();

  return (
    <Stack
      direction="row"
      alignItems="center"
      spacing={1}
      sx={{ display: "inline-flex" }}
    >
      {prefixLabel && (
        <Box
          component="span"
          sx={{
            fontSize: size === "sm" ? 12 : 13,
            color: "text.secondary",
            fontWeight: 500,
          }}
        >
          {prefixLabel}
        </Box>
      )}

      <Box
        sx={{
          display: "inline-flex",
          alignItems: "center",
          p: 0,
          borderRadius: 999,
          border: 1,
          borderColor: "divider",
          backgroundColor: "background.paper",
        }}
      >
        {items.map((it) => {
          const active = it.id === value;
          const disabled = it.disabled === true;
          const pad =
            size === "sm"
              ? { px: 1.5, py: 0.4, fontSize: 12.5 }
              : size === "lg"
                ? { px: 2.75, py: 0.85, fontSize: 14.5 }
                : { px: 2.25, py: 0.65, fontSize: 13.5 };

          const btn = (
            <Box
              key={it.id}
              onClick={disabled ? undefined : () => onChange(it.id)}
              sx={{
                position: "relative",
                ...pad,
                m: active ? "-1px" : 0,
                zIndex: active ? 1 : 0,
                fontWeight: active ? 600 : 500,
                whiteSpace: "nowrap",
                userSelect: "none",
                borderRadius: 999,
                cursor: disabled ? "not-allowed" : "pointer",
                opacity: disabled ? 0.45 : 1,
                border: 1,
                borderColor: active ? "primary.main" : "transparent",
                backgroundColor: active
                  ? theme.custom.pills.activeBg
                  : "transparent",
                color: active ? "primary.main" : "text.primary",
                transition: "all 0.15s ease",
                "&:hover": disabled
                  ? undefined
                  : {
                      color: active ? "primary.main" : "text.primary",
                      backgroundColor: active
                        ? theme.custom.pills.activeBg
                        : theme.custom.surface.soft,
                    },
              }}
            >
              {it.label}
            </Box>
          );

          return disabled && disabledTooltip ? (
            <Tooltip key={it.id} title={disabledTooltip} arrow>
              <span style={{ display: "inline-flex" }}>{btn}</span>
            </Tooltip>
          ) : (
            btn
          );
        })}
      </Box>
    </Stack>
  );
}

export default NavTabs;
