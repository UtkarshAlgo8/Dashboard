import { Box, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";

/**
 * Headline KPI tile (Total Inventory / MHE) with a coloured top rule.
 *
 * @param {object} props
 * @param {string} props.label
 * @param {string} props.value
 * @param {string} props.sub
 * @param {string} props.color
 * @param {import("react").ReactNode} [props.children] - extra content (e.g. status mix bar)
 */
function CtpSummaryTile({ label, value, sub, color, children }) {
  const theme = useTheme();
  return (
    <Box
      sx={{
        flex: "1 1 260px",
        px: 2,
        py: 1.5,
        borderRadius: 1.25,
        backgroundColor: "background.paper",
        border: 1,
        borderColor: "divider",
        borderTop: `3px solid ${color}`,
        boxShadow: theme.custom.shadow,
      }}
    >
      <Typography
        sx={{
          fontSize: 11,
          color: "text.disabled",
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: ".4px",
        }}
      >
        {label}
      </Typography>
      <Typography
        sx={{
          fontSize: 30,
          fontWeight: 800,
          color,
          lineHeight: 1.15,
          mt: 0.25,
        }}
      >
        {value}
      </Typography>
      <Typography sx={{ fontSize: 11.5, color: "text.secondary", mt: 0.25 }}>
        {sub}
      </Typography>
      {children}
    </Box>
  );
}

export default CtpSummaryTile;
