import { Box, Stack, Typography, useTheme } from "@mui/material";

/**
 * Reusable table legend / colour key for data tables.
 *
 * Supports presets ("threshold", "status", "shifts") as well as
 * explicit items: [{ label, color, variant }].
 *
 * @param {object} props
 * @param {Array<{ label: string, color: string, variant?: "dot"|"square"|"pill"|"dash" }>} [props.items]
 * @param {"threshold"|"status"|"shifts"} [props.preset]
 * @param {string} [props.title]
 * @param {"flex-start"|"center"|"flex-end"|"space-between"} [props.align]
 * @param {object} [props.sx]
 */
function TableLegend({
  items,
  preset,
  title,
  align = "flex-start",
  sx = {},
}) {
  const theme = useTheme();

  const resolvedItems = items ?? (preset ? getPresetItems(preset, theme) : []);

  if (!resolvedItems || resolvedItems.length === 0) return null;

  return (
    <Stack
      direction="row"
      spacing={2}
      useFlexGap
      flexWrap="wrap"
      alignItems="center"
      justifyContent={align}
      sx={{
        py: 0.5,
        px: 0.25,
        ...sx,
      }}
    >
      {title && (
        <Typography
          sx={{
            fontSize: 11,
            fontWeight: 600,
            color: "text.disabled",
            textTransform: "uppercase",
            letterSpacing: 0.5,
          }}
        >
          {title}
        </Typography>
      )}
      {resolvedItems.map((it) => (
        <Stack
          key={it.label}
          direction="row"
          spacing={0.75}
          alignItems="center"
        >
          <LegendMark color={it.color} variant={it.variant ?? "dot"} />
          <Typography sx={{ fontSize: 11, color: "text.secondary" }}>
            {it.label}
          </Typography>
        </Stack>
      ))}
    </Stack>
  );
}

function LegendMark({ color, variant }) {
  if (variant === "square") {
    return (
      <Box
        sx={{
          width: 10,
          height: 10,
          borderRadius: 0.5,
          backgroundColor: color,
          flexShrink: 0,
        }}
      />
    );
  }

  if (variant === "pill") {
    return (
      <Box
        sx={{
          width: 16,
          height: 8,
          borderRadius: 999,
          backgroundColor: color,
          flexShrink: 0,
        }}
      />
    );
  }

  if (variant === "dash") {
    return (
      <Box
        sx={{
          width: 14,
          height: 0,
          borderTop: `2px dashed ${color}`,
          flexShrink: 0,
        }}
      />
    );
  }

  // Default "dot" (color circle)
  return (
    <Box
      sx={{
        width: 10,
        height: 10,
        borderRadius: "50%",
        backgroundColor: color,
        flexShrink: 0,
      }}
    />
  );
}

function getPresetItems(preset, theme) {
  switch (preset) {
    case "threshold":
      return [
        {
          label: "Target Met",
          color: theme.custom.brand.green,
          variant: "dot",
        },
        {
          label: "Warning",
          color: theme.custom.brand.amber,
          variant: "dot",
        },
        {
          label: "Critical",
          color: theme.custom.brand.red,
          variant: "dot",
        },
      ];
    case "status":
      return [
        {
          label: "OK / Closed",
          color: theme.palette.success.main,
          variant: "dot",
        },
        {
          label: "Alert / Monitor",
          color: theme.palette.warning.main,
          variant: "dot",
        },
        {
          label: "Action Required / Open",
          color: theme.palette.error.main,
          variant: "dot",
        },
      ];
    case "shifts":
      return [
        {
          label: "Shift A",
          color: theme.custom.brand.blue,
          variant: "pill",
        },
        {
          label: "Shift B",
          color: theme.custom.brand.amber,
          variant: "pill",
        },
        {
          label: "Shift C",
          color: theme.custom.brand.purple,
          variant: "pill",
        },
      ];
    default:
      return [];
  }
}

export default TableLegend;
