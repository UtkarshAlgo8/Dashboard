import { alpha, createTheme } from "@mui/material/styles";

/**
 * Adobe XD Design System Palette Tokens
 * The single source of truth for hex codes in this project.
 */
const C = {
  // Texts and Icons
  tx: "#2B2F33", // Primary Text / Icons (Crisp dark charcoal)
  md: "#636B74", // Secondary Text / Subtext / Captions (High-contrast neutral)
  mu: "#959EA6", // Disabled / Muted Text (Legible WCAG compliant)

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
  purple: "#5856D6",
  drillCloseBg: "#8E959E",
  drillCloseHover: "#737B85",

  // Distinct brand, chart and map shades without a close palette equivalent.
  deepBlue: "#2563EB",
  skyBlue: "#0284C7",
  orangeAccent: "#E8651A",
  orangeStrong: "#E8590C",
  liveRed: "#DC2626",
  rose: "#E11D48",
  liveGreen: "#16A34A",
  teal: "#0F9D9A",
  utilityBrown: "#A0522D",
  planned: "#FFA3A3",
  slateHeading: "#0F172A",
  slateText: "#1E293B",
  slateBody: "#374151",
  slateMuted: "#64748B",
  slateDisabled: "#94A3B8",
  mapSpace: "#0B132B",
  mapMask: "#070D18",
  mapGlow: "#38BDF8",
  mapGlowCore: "#F0F9FF",
  pinGlow: "#3B82F6",
  loginAccent: "#0077B6",
  loginHover: "#005F94",
  borderStrong: "#CCCCCC",
  formAccent: "#1F4E79",
  formBorder: "#D4DAE0",
  formError: "#B42318",
  tooltipDark: "#1E1E1E",
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
    // A ripple can remain visible if its release event is lost when the
    // browser tab changes. Keep keyboard focus visible without relying on it.
    MuiButtonBase: {
      defaultProps: { disableRipple: true },
      styleOverrides: {
        root: {
          "&.Mui-focusVisible": {
            outline: `2px solid ${C.ac}`,
            outlineOffset: -2,
          },
        },
      },
    },
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
  // Close neutral surfaces reuse the main palette; distinct accents stay intact.
  landing: {
    heading: C.slateHeading,
    text: C.slateText,
    body: C.slateBody,
    muted: C.slateMuted,
    blue: C.deepBlue,
    scrap: C.skyBlue,
    live: C.liveRed,
    green: C.liveGreen,
    orange: C.orangeStrong,
    yield: C.rose,
    disabled: C.slateDisabled,
    yieldBorder: "#FFE4E6",
    greenBorder: "#DCFCE7",
    orangeBorder: "#FFEDD5",
    pinGlow: C.pinGlow,
  },
  map: {
    background: C.mapSpace,
    mask: C.mapMask,
    glow: C.mapGlow,
    glowCore: C.mapGlowCore,
  },
  login: {
    text: "#404040",
    accent: C.loginAccent,
    hover: C.loginHover,
    focus: "#1976D2",
    border: C.borderStrong,
  },
  rca: {
    accent: C.formAccent,
    accentSoft: C.activePillBg,
    text: "#1D2329",
    muted: C.md,
    border: C.formBorder,
    background: C.cd,
    surface: C.bg,
    error: C.formError,
    errorSoft: C.rdCard,
    success: "#1E7A46",
  },
  charts: {
    planned: C.planned,
    tooltipDark: C.tooltipDark,
    teal: C.teal,
    electrical: C.orangeStrong,
    utility: C.utilityBrown,
  },
  // Shared Quality / Engineering vocabulary, including hex-valued accents
  // consumed by their SVG charts and opacity helpers.
  dashboard: {
    bg: C.c2,
    cd: C.cd,
    c2: C.bg,
    bd: C.bd,
    tx: "#1A1D26",
    md: "#4A5168",
    mu: "#8891A5",
    ac: C.orangeAccent,
    aL: alpha(C.orangeAccent, 0.07),
    aB: alpha(C.orangeAccent, 0.28),
    rowAlt: "rgba(0,119,182,0.04)",
    thBg: "#EAEDF3",
    tl: "#1A9A3E",
    bl: C.deepBlue,
    rd: C.liveRed,
    am: "#CA8A04",
    gn: "#1A9A3E",
    pp: "#7C3AED",
    cy: "#0D9488",
    sh: C.navbarShadow,
    r: 8,
  },
  text: { strong: C.tx, medium: C.md, muted: C.mu },
  table: { alternateRow: C.rowAlt, headerBg: C.thBg },
  cards: {
    neutral: C.cd,
    green: C.gnCard,
    amber: C.amCard,
    red: C.rdCard,
  },
  // Engineering uses stronger fills so status colors remain distinct.
  engineeringKpiTints: {
    green: { background: "#D6F3DC", foreground: "#176B2B" },
    amber: { background: "#FFEAC8", foreground: "#985000" },
    red: { background: "#FFE0DE", foreground: "#AE0010" },
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
    purple: C.purple,
    ocean: C.ocean,
  },
  shadow: C.sh,
  navbarShadow: C.navbarShadow,
  floatingShadow: C.floatingShadow,
  radius: C.r,
  drillClose: {
    bg: C.drillCloseBg,
    hover: C.drillCloseHover,
  },
};

export default theme;
