import { Box } from "@mui/material";
import NavTabs from "./NavTabs.jsx";

/**
 * Top-level category nav strip (BRD FR-P7), rendered directly below the
 * header. Uses the shared NavTabs so it looks identical to the nav
 * controls inside the render-box section headers.
 * (Back navigation now lives on the header's plant pill.)
 */
function CategoryTabs({ tabs, activeTabId, onSelect }) {
  return (
    <Box
      sx={{
        backgroundColor: "background.paper",
        borderBottom: 1,
        borderColor: "divider",
        px: 2,
        py: 1,
        overflowX: "auto",
      }}
    >
      <NavTabs
        items={tabs.map((t) => ({
          id: t.id,
          label: t.name,
          disabled: t.enabled === false,
        }))}
        value={activeTabId}
        onChange={onSelect}
        layoutId="categoryNavFill"
        disabledTooltip="Phase 2 — coming soon"
      />
    </Box>
  );
}

export default CategoryTabs;
