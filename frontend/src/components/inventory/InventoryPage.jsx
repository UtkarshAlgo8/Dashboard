import { Box, Button, Stack, Typography } from "@mui/material";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";

const INVENTORY_APP_URL = "http://10.200.203.239:8599/";

function InventoryPage({ plantId }) {
  if (plantId !== "banmore") {
    return (
      <Box
        sx={{
          height: "100%",
          display: "grid",
          placeItems: "center",
          color: "text.disabled",
        }}
      >
        <Typography sx={{ fontSize: 13 }}>Inventory not configured.</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ height: "100%", display: "grid", placeItems: "center", p: 3 }}>
      <Stack spacing={2} alignItems="center" sx={{ textAlign: "center" }}>
        <Typography sx={{ fontSize: 16, fontWeight: 700 }}>
          Inventory Dashboard
        </Typography>
        <Typography sx={{ fontSize: 13, color: "text.secondary", maxWidth: 420 }}>
          The inventory dashboard opens in a new tab.
        </Typography>
        {/* Rendered as an anchor (not an onClick) so the browser's native
            open-in-new-tab / middle-click behaviour works. */}
        <Button
          component="a"
          href={INVENTORY_APP_URL}
          target="_blank"
          rel="noopener noreferrer"
          variant="contained"
          startIcon={<OpenInNewIcon />}
          sx={{ textTransform: "none", fontWeight: 600 }}
        >
          Open Inventory Dashboard
        </Button>
      </Stack>
    </Box>
  );
}

export default InventoryPage;
