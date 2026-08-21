import { Box, Stack, Typography, useTheme } from "@mui/material";
import UserMenu from "@/components/user-menu/UserMenu.jsx";
import { MOCK_USER } from "@/lib/mockData.js";
import jkLogo from "@/assets/jk-logo.png";

/**
 * Landing-page top header — matches the dashboard header chrome:
 * small logo + bold divider + single "All Dashboards" heading on the
 * left, FY pill + user avatar on the right. Sticky to the viewport top.
 */
function LandingHeader() {
  const theme = useTheme();
  return (
    <Box
      component="header"
      sx={{
        position: "sticky",
        top: 0,
        zIndex: theme.zIndex.appBar,
        backgroundColor: "background.paper",
        borderBottom: 1,
        borderColor: "divider",
        boxShadow: theme.custom.shadow,
        px: 2,
        py: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 2,
      }}
    >
      {/* Brand block */}
      <Stack direction="row" alignItems="center" spacing={1.25}>
        <Box
          component="img"
          src={jkLogo}
          alt="JK Tyre & Industries Ltd."
          sx={{ height: 22, width: "auto", objectFit: "contain", display: "block" }}
        />
        <Box
          sx={{
            width: "2px",
            height: 24,
            borderRadius: 1,
            backgroundColor: "text.disabled",
          }}
        />
        <Typography
          sx={{
            fontSize: 15,
            fontWeight: 700,
            letterSpacing: "-0.2px",
            whiteSpace: "nowrap",
          }}
        >
          One JK One Dashboard
        </Typography>
      </Stack>

      {/* Right: FY pill + avatar */}
      <Stack direction="row" alignItems="center" spacing={1.5}>
        <Box
          sx={{
            fontSize: 12,
            fontWeight: 600,
            color: "text.secondary",
            px: 1.25,
            py: 0.5,
            border: 1,
            borderColor: "divider",
            borderRadius: 1,
            backgroundColor: theme.custom.surface.soft,
            whiteSpace: "nowrap",
          }}
        >
          FY 2025-26
        </Box>
        <UserMenu user={MOCK_USER} size={32} />
      </Stack>
    </Box>
  );
}

export default LandingHeader;
