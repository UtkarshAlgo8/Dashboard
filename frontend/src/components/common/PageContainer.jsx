import { Box, Container } from "@mui/material";
import PageHeader from "./PageHeader.jsx";

/**
 * Page-level layout: light gray page background + a PageHeader strip + a body slot.
 */
function PageContainer({ title, actions, maxWidth = "lg", children }) {
  return (
    <Box sx={{ width: "100%", backgroundColor: "#FAFAFA", minHeight: "100%" }}>
      <Container
        maxWidth={maxWidth}
        sx={{ py: 2, display: "flex", flexDirection: "column", gap: 2 }}
      >
        <PageHeader title={title} actions={actions} />
        <Box>{children}</Box>
      </Container>
    </Box>
  );
}

export default PageContainer;
