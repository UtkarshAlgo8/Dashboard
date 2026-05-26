import {
  Box,
  Button,
  Stack,
  Tooltip,
  Typography,
  useTheme,
} from "@mui/material";
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
      {tabs.map((t) => {
        // `enabled === false` → disabled tab (CR-07: Inventory). Other
        // values (true / undefined / null) → enabled.
        const isDisabled = t.enabled === false;
        const button = (
          <TabButton
            key={t.id}
            tab={t}
            active={t.id === activeTabId}
            disabled={isDisabled}
            onClick={isDisabled ? undefined : () => onSelect(t.id)}
          />
        );
        return isDisabled ? (
          <Tooltip key={t.id} title="Phase 2 — coming soon" arrow>
            {/* span wrapper required for Tooltip on a disabled-looking element */}
            <span style={{ display: "inline-flex" }}>{button}</span>
          </Tooltip>
        ) : (
          button
        );
      })}
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

function TabButton({ tab, active, disabled, onClick }) {
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
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.45 : 1,
        color: active ? "primary.main" : "text.secondary",
        fontWeight: active ? 600 : 500,
        borderBottom: 2,
        borderColor: active ? "primary.main" : "transparent",
        marginBottom: "-1px",
        transition: "color 0.15s, border-color 0.15s",
        "&:hover": disabled
          ? undefined
          : {
              color: active ? "primary.main" : "text.primary",
              backgroundColor: active
                ? "transparent"
                : theme.custom.surface.soft,
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
