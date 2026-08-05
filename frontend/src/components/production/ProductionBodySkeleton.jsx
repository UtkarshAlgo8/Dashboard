import { Box } from "@mui/material";
import JKLoader from "@/components/JKLoader.jsx";

/**
 * First-paint loading state for the Production page body. Shows the branded
 * JKLoader centered in the content area until the sections / tabs / plant
 * calls finish, instead of a chrome skeleton.
 */
function ProductionBodySkeleton() {
  return (
    <Box
      sx={{
        flex: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "60vh",
        p: 2,
      }}
    >
      <JKLoader />
    </Box>
  );
}

export default ProductionBodySkeleton;
