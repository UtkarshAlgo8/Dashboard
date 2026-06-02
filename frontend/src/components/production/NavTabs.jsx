import { Box, Stack, Tooltip, useTheme } from "@mui/material";
import { motion } from "framer-motion";

/**
 * Shared bordered tab/pill group used by BOTH the top category nav and
 * the render-box section headers, so every nav control looks identical.
 *
 * The active fill is a framer-motion shared-layout element that springs
 * across the buttons (with a little overshoot). Pass a UNIQUE `layoutId`
 * per group so separate groups don't animate into one another.
 *
 * @param {object} props
 * @param {{id:string,label:string,disabled?:boolean}[]} props.items
 * @param {string} props.value          active item id
 * @param {(id:string)=>void} props.onChange
 * @param {string} props.layoutId       unique id for the sliding fill
 * @param {string} [props.disabledTooltip]
 * @param {"sm"|"md"} [props.size]
 */
function NavTabs({
  items,
  value,
  onChange,
  layoutId,
  disabledTooltip,
  size = "md",
}) {
  return (
    <Stack
      direction="row"
      spacing={0.75}
      sx={{ alignItems: "center", flexWrap: "wrap" }}
    >
      {items.map((it) => {
        const disabled = it.disabled === true;
        const btn = (
          <NavTabButton
            key={it.id}
            active={it.id === value}
            disabled={disabled}
            onClick={disabled ? undefined : () => onChange(it.id)}
            label={it.label}
            layoutId={layoutId}
            size={size}
          />
        );
        return disabled && disabledTooltip ? (
          <Tooltip key={it.id} title={disabledTooltip} arrow>
            <span style={{ display: "inline-flex" }}>{btn}</span>
          </Tooltip>
        ) : (
          btn
        );
      })}
    </Stack>
  );
}

function NavTabButton({ active, disabled, onClick, label, layoutId, size }) {
  const theme = useTheme();
  const pad =
    size === "sm"
      ? { px: 1.5, py: 0.5, fontSize: 12 }
      : { px: 2, py: 0.65, fontSize: 13 };
  return (
    <Box
      onClick={onClick}
      sx={{
        position: "relative",
        ...pad,
        // Constant font weight + border width so the button never resizes
        // between states (no layout jump).
        fontWeight: 600,
        whiteSpace: "nowrap",
        userSelect: "none",
        borderRadius: 1.5,
        border: 1,
        borderColor: active ? "primary.main" : "divider",
        backgroundColor: "background.paper",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.45 : 1,
        transition: "border-color 0.15s",
        "&:hover": disabled
          ? undefined
          : {
              borderColor: active ? "primary.main" : "text.disabled",
              backgroundColor: active
                ? "background.paper"
                : theme.custom.surface.soft,
            },
      }}
    >
      {active && (
        <motion.div
          layoutId={layoutId}
          transition={{ type: "spring", stiffness: 520, damping: 19, mass: 0.7 }}
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: 11,
            backgroundColor: theme.palette.primary.main,
            zIndex: 0,
          }}
        />
      )}
      <Box
        component="span"
        sx={{
          position: "relative",
          zIndex: 1,
          color: active ? "primary.contrastText" : "text.secondary",
          transition: "color 0.2s ease",
        }}
      >
        {label}
      </Box>
    </Box>
  );
}

export default NavTabs;
