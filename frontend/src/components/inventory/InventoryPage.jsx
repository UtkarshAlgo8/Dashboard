import { Box } from "@mui/material";

const INVENTORY_APP_URL = "http://10.200.203.239:8599/";

function InventoryPage() {
  return (
    <Box sx={{ height: "100%", minHeight: 0, overflow: "hidden" }}>
      <iframe
        src={INVENTORY_APP_URL}
        title="Inventory"
        style={{
          width: "100%",
          height: "100%",
          border: 0,
          display: "block",
          background: "#fff",
        }}
      />
    </Box>
  );
}

export default InventoryPage;
