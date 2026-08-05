import { Box } from "@mui/material";
import JKLoader from "@/components/JKLoader.jsx";

/**
 * Landing-page loading state. Shows the branded JKLoader centered in the
 * body until the plants list resolves, instead of card/map skeletons.
 */
function LandingSkeleton() {
  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "60vh",
      }}
    >
      <JKLoader />
    </Box>
  );
}

export default LandingSkeleton;
