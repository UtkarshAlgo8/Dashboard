import { Box, ButtonBase, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";

/**
 * Clickable insight card (cover shortfall, on hold, expired, oldest
 * blocked lot). Clicking toggles its SKU-level drill.
 *
 * @param {object} props
 * @param {string} props.title
 * @param {string} props.value
 * @param {string} props.sub
 * @param {string} props.color
 * @param {boolean} props.isOpen
 * @param {() => void} props.onToggle
 */
function CtpInsightCard({ title, value, sub, color, isOpen, onToggle }) {
  const Chevron = isOpen ? ExpandLessIcon : ExpandMoreIcon;
  return (
    <ButtonBase
      onClick={onToggle}
      title="Click for SKU-level detail"
      sx={{
        flex: "1 1 200px",
        display: "block",
        textAlign: "left",
        px: 1.6,
        py: 1.1,
        borderRadius: 1.1,
        fontFamily: "inherit",
        backgroundColor: isOpen ? alpha(color, 0.06) : "background.paper",
        border: 1,
        borderColor: isOpen ? color : "divider",
        borderLeft: `3px solid ${color}`,
      }}
    >
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          fontSize: 10.5,
          color: "text.disabled",
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: ".3px",
        }}
      >
        <span>{title}</span>
        <Chevron
          sx={{ fontSize: 16, color: isOpen ? color : "text.disabled" }}
        />
      </Box>
      <Typography sx={{ fontSize: 19, fontWeight: 800, color, mt: 0.25 }}>
        {value}
      </Typography>
      <Typography sx={{ fontSize: 11, color: "text.disabled" }}>
        {sub}
      </Typography>
    </ButtonBase>
  );
}

export default CtpInsightCard;
