import { Button } from "@mui/material";

/**
 * Compact action button used inside table rows / cards.
 * 30px tall, pill-shaped, capitalised label.
 *
 * @param {object} props
 * @param {string} props.label
 * @param {string} [props.color="#0077B8"] - Background colour.
 * @param {() => void} [props.onClick]
 * @param {string|number} [props.width="75px"]
 * @param {boolean} [props.disabled=false]
 */
function ActionButton({
  label,
  color = "#0077B8",
  onClick,
  width = "75px",
  disabled = false,
}) {
  return (
    <Button
      sx={{
        width,
        height: "30px",
        borderRadius: "20px",
        textTransform: "capitalize",
        fontWeight: 500,
        fontSize: "13px",
        color: "white",
        backgroundColor: color,
        "&:hover": { backgroundColor: color, opacity: 0.9 },
        "&.Mui-disabled": { backgroundColor: "#BDBDBD", color: "white" },
      }}
      onClick={onClick}
      disabled={disabled}
    >
      {label}
    </Button>
  );
}

export default ActionButton;
