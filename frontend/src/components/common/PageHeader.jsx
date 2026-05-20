import { Box, Typography } from "@mui/material";

/**
 * Page header strip — title on the left, optional actions slot on the right.
 */
function PageHeader({ title, actions }) {
  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        py: 1.5,
        px: 2,
        borderBottom: "1px solid #E4E4E4",
        backgroundColor: "white",
        borderRadius: "10px",
      }}
    >
      <Typography sx={{ fontSize: "18px", fontWeight: 500, color: "#404040" }}>
        {title}
      </Typography>
      {actions ? <Box>{actions}</Box> : null}
    </Box>
  );
}

export default PageHeader;
