import { Typography } from "@mui/material";

/**
 * Small uppercase label that leads a CTP Inventory filter row.
 *
 * @param {object} props
 * @param {import("react").ReactNode} props.children
 */
function CtpRowLabel({ children }) {
  return (
    <Typography
      component="span"
      sx={{
        fontSize: 11,
        color: "text.disabled",
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: ".5px",
        minWidth: 86,
        flexShrink: 0,
      }}
    >
      {children}
    </Typography>
  );
}

export default CtpRowLabel;
