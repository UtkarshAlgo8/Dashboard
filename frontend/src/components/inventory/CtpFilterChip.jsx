import { Box, ButtonBase, Tooltip } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";

/**
 * Toggle chip used by the CTP Inventory status / section / product-type
 * rows. Tinted in `color` when on; `badge` renders a small count pill.
 *
 * @param {object} props
 * @param {boolean} props.isOn
 * @param {string} [props.color] - accent when on (defaults to primary)
 * @param {() => void} props.onClick
 * @param {import("react").ReactNode} props.children
 * @param {string} [props.badge]
 * @param {boolean} [props.isSmall]
 * @param {string} [props.title] - tooltip
 */
function CtpFilterChip({
  isOn,
  color,
  onClick,
  children,
  badge,
  isSmall,
  title,
}) {
  const theme = useTheme();
  const col = color || theme.palette.primary.main;
  const chip = (
    <ButtonBase
      onClick={onClick}
      sx={{
        px: isSmall ? 1.25 : 1.6,
        py: isSmall ? 0.5 : 0.65,
        borderRadius: 1,
        border: 1,
        borderColor: isOn ? col : "divider",
        backgroundColor: isOn ? alpha(col, 0.08) : "background.paper",
        color: isOn ? col : "text.primary",
        fontSize: isSmall ? 12 : 12.5,
        fontWeight: isOn ? 700 : 500,
        fontFamily: "inherit",
        whiteSpace: "nowrap",
        gap: 0.75,
        transition: "border-color 120ms ease, background-color 120ms ease",
        "&:hover": { borderColor: col },
      }}
    >
      {children}
      {badge != null && (
        <Box
          component="span"
          sx={{
            fontSize: 11,
            fontWeight: 700,
            px: 0.6,
            borderRadius: 0.5,
            backgroundColor: alpha(
              isOn ? col : theme.palette.text.disabled,
              0.12,
            ),
            color: isOn ? col : "text.disabled",
          }}
        >
          {badge}
        </Box>
      )}
    </ButtonBase>
  );
  if (!title) return chip;
  return (
    <Tooltip title={title} arrow>
      {chip}
    </Tooltip>
  );
}

export default CtpFilterChip;
