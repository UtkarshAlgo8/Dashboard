import { Box, Stack, Typography, useTheme } from "@mui/material";

/**
 * Left vertical section sidebar (BRD FR-P4). Active row highlighted
 * with primary background + accent border. Sub-selectors (Mixing
 * Master/Final, Stock 4Roll/...) come in spec 05 and spec 11.
 */
function SectionSidebar({ sections, activeSectionId, onSelect }) {
  return (
    <Stack spacing={0.5}>
      <Typography
        sx={{
          fontSize: 10,
          color: "text.disabled",
          textTransform: "uppercase",
          letterSpacing: 0.8,
          fontWeight: 700,
          px: 1.5,
          py: 1,
        }}
      >
        Sections
      </Typography>
      {sections.map((s) => (
        <SidebarRow
          key={s.id}
          section={s}
          active={s.id === activeSectionId}
          onClick={() => onSelect(s.id)}
        />
      ))}
    </Stack>
  );
}

function SidebarRow({ section, active, onClick }) {
  const theme = useTheme();
  return (
    <Box
      onClick={onClick}
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 1.5,
        px: 1.5,
        py: 1.25,
        borderRadius: 1,
        cursor: "pointer",
        backgroundColor: active ? "primary.light" : "transparent",
        borderLeft: 3,
        borderColor: active ? "primary.main" : "transparent",
        color: active ? "primary.main" : "text.primary",
        transition: "background-color 0.15s, border-color 0.15s",
        "&:hover": {
          backgroundColor: active ? "primary.light" : theme.custom.surface.soft,
        },
      }}
    >
      <Box
        sx={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: 0.4,
          width: 36,
          textAlign: "center",
          color: active ? "primary.main" : "text.disabled",
        }}
      >
        {section.code}
      </Box>
      <Typography sx={{ fontSize: 13, fontWeight: active ? 600 : 500 }}>
        {section.name}
      </Typography>
    </Box>
  );
}

export default SectionSidebar;
