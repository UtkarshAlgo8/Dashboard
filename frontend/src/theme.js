import { createTheme } from "@mui/material/styles";

/**
 * Adobe XD Design System Palette Tokens
 * The single source of truth for hex codes in this project.
 */
const C = {
  // Texts and Icons
  tx: "#404040", // Primary Text / Icons
  md: "#9F9F9F", // Secondary Text / Subtext / Timestamps
  mu: "#E4E4E4", // Disabled Text / Inactive elements

  // Brand / Interactive / Actions
  ac: "#147EFB", // Links / Button Text / Primary Action
  aL: "rgba(20, 126, 251, 0.08)", // Soft blue active pill background
  aB: "rgba(20, 126, 251, 0.25)", // Blue focus / ring
  activePillBg: "#EAF3FE", // Active pill light blue fill
  activePillBorder: "#147EFB",
  activePillText: "#147EFB",

  // Positive / Green Tokens
  gn: "#238B3D", // Green (Positive) Text & Icons
  gnAccent: "#33C75A", // Success Element / Progress fill / Stem
  gnCard: "#EAF9EE", // Green Positive Card Background
  gnTrack: "rgba(35, 139, 61, 0.15)", // Green Progress Bar Track
  gnGradient: "linear-gradient(90deg, #238B3D 0%, #33C75A 100%)",

  // Secondary / Amber Tokens
  am: "#FF9601", // Amber (Medium/Secondary) Text, Icons & Elements
  amCard: "#FFF4E5", // Amber Secondary Card Background
  amTrack: "rgba(255, 150, 1, 0.18)", // Amber Progress Bar Track
  amGradient: "linear-gradient(90deg, #FF8800 0%, #FFB347 100%)",

  // Negative / Red Tokens
  rd: "#D70014", // Red (Negative) Text & Icons
  rdAccent: "#FF3B30", // Error Element / Progress fill
  rdCard: "#FFEBEA", // Red Negative Card Background
  rdTrack: "rgba(215, 0, 20, 0.15)", // Red Progress Bar Track
  rdGradient: "linear-gradient(90deg, #D70014 0%, #FF3B30 100%)",

  // Surfaces & Canvas
  bg: "#F8F9FA", // Dashboard Canvas Background
  cd: "#FFFFFF", // Neutral White Card Background
  c2: "#F4F6F8", // Soft Container Background
  bd: "#E4E4E4", // Divider / Border Line
  thBg: "#F4F6F8", // Table / Header background
  rowAlt: "rgba(20, 126, 251, 0.03)",

  // Other Accents
  bl: "#147EFB",
  tl: "#238B3D",
  ocean: "#147EFB",
  sh: "0 2px 8px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.03)",
  navbarShadow: "0 1px 3px rgba(0,0,0,0.06), 0 2px 8px rgba(0,0,0,0.04)",
  floatingShadow: "0 3px 12px rgba(0,0,0,0.09), 0 1px 4px rgba(0,0,0,0.05)",
  r: 10,
};

const theme = createTheme({
  palette: {
    mode: "light",
    primary: { main: C.ac, light: C.aL, dark: C.aB, contrastText: "#FFFFFF" },
    secondary: { main: C.am },
    success: { main: C.gnAccent, dark: C.gn },
    warning: { main: C.am },
    error: { main: C.rdAccent, dark: C.rd },
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
          color: C.tx,
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
        root: { textTransform: "none", borderRadius: 8 },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: { borderRadius: 12 },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: { borderRadius: 12 },
      },
    },
  },
});

/**
 * Project-specific tokens that map onto Adobe XD design system.
 */
theme.custom = {
  surface: { default: C.bg, paper: C.cd, soft: C.c2 },
  text: { strong: C.tx, medium: C.md, muted: C.mu },
  table: { alternateRow: C.rowAlt, headerBg: C.thBg },
  cards: {
    neutral: C.cd,
    green: C.gnCard,
    amber: C.amCard,
    red: C.rdCard,
  },
  status: {
    green: C.gn,
    greenAccent: C.gnAccent,
    greenCard: C.gnCard,
    greenTrack: C.gnTrack,
    greenGradient: C.gnGradient,
    amber: C.am,
    amberCard: C.amCard,
    amberTrack: C.amTrack,
    amberGradient: C.amGradient,
    red: C.rd,
    redAccent: C.rdAccent,
    redCard: C.rdCard,
    redTrack: C.rdTrack,
    redGradient: C.rdGradient,
  },
  pills: {
    activeBg: C.activePillBg,
    activeBorder: C.activePillBorder,
    activeText: C.activePillText,
  },
  brand: {
    orange: C.ac,
    orangeSoft: C.aL,
    orangeRing: C.aB,
    teal: C.tl,
    blue: C.bl,
    green: C.gn,
    greenLight: C.gnCard,
    amber: C.am,
    amberLight: C.amCard,
    red: C.rd,
    redLight: C.rdCard,
    ocean: C.ocean,
  },
  shadow: C.sh,
  navbarShadow: C.navbarShadow,
  floatingShadow: C.floatingShadow,
  radius: C.r,
};

export default theme;
