import { createTheme } from "@mui/material/styles";

/**
 * Artifact palette tokens (from docs/artifact.jsx `const C`).
 * The single source of truth for hex codes in this project — the
 * forbidden-pattern grep in scripts/check.sh disallows hex codes
 * anywhere else.
 */
const C = {
  bg: "#F3F4F8",
  cd: "#FFFFFF",
  c2: "#F7F8FA",
  bd: "#E0E3EA",
  tx: "#1A1D26",
  md: "#4A5168",
  mu: "#8891A5",
  // Accent / primary = company blue (#0077B6). aL / aB are its soft tint
  // and ring variants used for active highlights, pills, and hovers.
  ac: "#0077B6",
  aL: "rgba(0,119,182,0.07)",
  aB: "rgba(0,119,182,0.28)",
  rowAlt: "rgba(0, 119, 182, 0.04)",
  thBg: "#EAEDF3",
  tl: "#1A9A3E",
  bl: "#2563EB",
  rd: "#DC2626",
  am: "#F59E0B",
  gn: "#1A9A3E",
  pp: "#7C3AED",
  cy: "#0D9488",
  ocean: "#0077B6",
  sh: "0 1px 3px rgba(0,0,0,0.06), 0 2px 8px rgba(0,0,0,0.04)",
  r: 8,
};

const theme = createTheme({
  palette: {
    mode: "light",
    primary: { main: C.ac, light: C.aL, dark: C.aB, contrastText: "#FFFFFF" },
    success: { main: C.gn },
    warning: { main: C.am },
    error: { main: C.rd },
    info: { main: C.bl },
    text: { primary: C.tx, secondary: C.md, disabled: C.mu },
    background: { default: C.bg, paper: C.cd },
    divider: C.bd,
  },
  typography: {
    fontFamily:
      'Montserrat, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    fontWeightRegular: 400,
    fontWeightMedium: 500,
    fontWeightBold: 700,
  },
  shape: {
    borderRadius: C.r,
  },
  components: {
    MuiTableCell: {
      styleOverrides: {
        root: {
          borderBottom: `1px solid ${C.bd}`,
          borderRight: `1px solid ${C.bd}`,
          "&:last-child": {
            borderRight: "none",
          },
        },
        head: {
          backgroundColor: C.thBg,
          color: C.tx,
          fontWeight: 700,
          borderBottom: `2px solid ${C.bd}`,
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: { textTransform: "none" },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: { borderRadius: 10 },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: { borderRadius: 10 },
      },
    },
  },
});

/**
 * Project-specific tokens that don't map cleanly onto MUI's semantic
 * palette. Access via `theme.custom.*` in components (typed via JSDoc
 * since this is JavaScript).
 */
theme.custom = {
  surface: { default: C.bg, paper: C.cd, soft: C.c2 },
  text: { strong: C.tx, medium: C.md, muted: C.mu },
  table: { alternateRow: C.rowAlt, headerBg: C.thBg },
  brand: {
    orange: C.ac,
    orangeSoft: C.aL,
    orangeRing: C.aB,
    teal: C.tl,
    blue: C.bl,
    green: C.gn,
    amber: C.am,
    red: C.rd,
    purple: C.pp,
    cyan: C.cy,
    ocean: C.ocean,
  },
  shadow: C.sh,
  radius: C.r,
};

export default theme;
