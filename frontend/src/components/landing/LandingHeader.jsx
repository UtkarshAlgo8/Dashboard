import { Box, Stack, Typography, useTheme } from "@mui/material";
import UserMenu from "@/components/user-menu/UserMenu.jsx";
import { MOCK_USER } from "@/lib/mockData.js";
import jkLogo from "@/assets/jk-logo.png";

/**
 * Landing-page top header.
 * Brand block (One Factory / One Dashboard) + FY pill + user avatar
 * per BRD FR-L1, FR-L2, FR-L3. Avatar click is a no-op until spec 14
 * (user-menu).
 */
function LandingHeader() {
  const theme = useTheme();
  return (
    <Box
      component="header"
      sx={{
        backgroundColor: "background.paper",
        borderBottom: 1,
        borderColor: "divider",
        px: 3,
        py: 1.5,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}
    >
      {/* Brand block */}
      <Stack direction="row" alignItems="center" spacing={2}>
        <Box
          component="img"
          src={jkLogo}
          alt="JK Tyre & Industries Ltd."
          sx={{
            height: 36,
            width: "auto",
            objectFit: "contain",
            display: "block",
          }}
        />
        <Box
          sx={{
            width: "1px",
            height: 24,
            backgroundColor: "divider",
          }}
        />
        <Box>
          <Typography
            sx={{ fontSize: 18, fontWeight: 700, letterSpacing: "0.3px" }}
          >
            One Factory
          </Typography>
          <Typography
            sx={{
              fontSize: 12,
              color: "text.disabled",
              textTransform: "uppercase",
              letterSpacing: "0.8px",
              fontWeight: 600,
              mt: "1px",
            }}
          >
            One Dashboard
          </Typography>
        </Box>
      </Stack>

      {/* Right side: FY pill + avatar */}
      <Stack direction="row" alignItems="center" spacing={1.5}>
        <Box
          sx={{
            fontSize: 13,
            color: "text.disabled",
            px: 1.25,
            py: 0.5,
            border: 1,
            borderColor: "divider",
            borderRadius: 0.75,
            backgroundColor: theme.custom.surface.soft,
          }}
        >
          FY 2025-26
        </Box>
        <UserMenu user={MOCK_USER} />
      </Stack>
    </Box>
  );
}

export default LandingHeader;
