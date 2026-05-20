import { Avatar, Box, Stack, Typography, useTheme } from "@mui/material";

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
          sx={{
            width: 36,
            height: 36,
            borderRadius: 1,
            backgroundColor: "primary.main",
            color: "primary.contrastText",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: 700,
            fontSize: 14,
            letterSpacing: 0.5,
          }}
        >
          JK
        </Box>
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
        <Avatar
          sx={{
            width: 36,
            height: 36,
            fontSize: 13,
            fontWeight: 600,
            backgroundColor: "primary.main",
            color: "primary.contrastText",
          }}
        >
          PH
        </Avatar>
      </Stack>
    </Box>
  );
}

export default LandingHeader;
