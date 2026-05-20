import { Box, Button, Stack, Typography, useTheme } from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import { useNavigate } from "react-router-dom";

/**
 * Horizontal category tab strip above the KPI grid (BRD FR-P7).
 * Active tab in primary colour with underline; others muted.
 * Right-aligned Back button navigates to the landing page.
 */
function CategoryTabs({ tabs, activeTabId, onSelect }) {
  const navigate = useNavigate();
  const theme = useTheme();
  const backColor = theme.custom.brand.ocean;
  return (
    <Stack
      direction="row"
      spacing={0.5}
      sx={{
        borderBottom: 1,
        borderColor: "divider",
        px: 1,
        alignItems: "stretch",
      }}
    >
      {tabs.map((t) => (
        <TabButton
          key={t.id}
          tab={t}
          active={t.id === activeTabId}
          onClick={() => onSelect(t.id)}
        />
      ))}
      <Box sx={{ flex: 1 }} />
      <Stack direction="row" alignItems="center" sx={{ pr: 0.5 }}>
        <Button
          size="small"
          variant="outlined"
          startIcon={<ArrowBackIcon sx={{ fontSize: 16 }} />}
          onClick={() => navigate("/")}
          sx={{
            textTransform: "none",
            fontSize: 12,
            fontWeight: 600,
            px: 2,
            py: 0.55,
            color: "primary.contrastText",
            borderColor: "divider",
            backgroundColor: backColor,
            borderRadius: "16px",
            "&:hover": {
              color: "primary.contrastText",
              backgroundColor: backColor,
            },
          }}
        >
          Back
        </Button>
      </Stack>
    </Stack>
  );
}

function TabButton({ tab, active, onClick }) {
  const theme = useTheme();
  return (
    <Box
      onClick={onClick}
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 0.75,
        px: 1.5,
        py: 1,
        cursor: "pointer",
        color: active ? "primary.main" : "text.secondary",
        fontWeight: active ? 600 : 500,
        borderBottom: 2,
        borderColor: active ? "primary.main" : "transparent",
        marginBottom: "-1px",
        transition: "color 0.15s, border-color 0.15s",
        "&:hover": {
          color: active ? "primary.main" : "text.primary",
          backgroundColor: active ? "transparent" : theme.custom.surface.soft,
        },
      }}
    >
      <Box
        sx={{
          fontSize: 11,
          fontWeight: 700,
          width: 18,
          height: 18,
          borderRadius: 0.5,
          backgroundColor: active ? "primary.main" : "divider",
          color: active ? "primary.contrastText" : "text.disabled",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {tab.code}
      </Box>
      <Typography sx={{ fontSize: 13, fontWeight: "inherit" }}>
        {tab.name}
      </Typography>
    </Box>
  );
}

export default CategoryTabs;
