import { Box, Typography } from "@mui/material";
import InboxOutlinedIcon from "@mui/icons-material/InboxOutlined";

/**
 * Standard empty-state visual: icon + title + optional helper text + optional CTA.
 */
function EmptyState({ icon, title, description, action }) {
  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        py: 6,
        px: 3,
        textAlign: "center",
        color: "#404040",
      }}
    >
      <Box sx={{ fontSize: "48px", color: "#BDBDBD", mb: 1 }}>
        {icon || <InboxOutlinedIcon sx={{ fontSize: "48px" }} />}
      </Box>
      <Typography sx={{ fontSize: "16px", fontWeight: 500, mb: 0.5 }}>
        {title}
      </Typography>
      {description && (
        <Typography sx={{ fontSize: "13px", color: "#808080", mb: 2 }}>
          {description}
        </Typography>
      )}
      {action}
    </Box>
  );
}

export default EmptyState;
