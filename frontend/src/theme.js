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

// Quintoplex reference palette. Applied only inside the anomaly workspace;
// the primary dashboard navbar and all existing pages retain the main theme.
const ANOMALY_PALETTES = {
  slate: {
    bg: "#c9d2dc",
    paper: "#dde3ea",
    raised: "#d3dae3",
    track: "#bcc6d2",
    line: "#b9c3cf",
    strongLine: "#5f6d7e",
    ink: "#0e1a2b",
    muted: "#3f4d60",
    accent: "#1a47b8",
    accentWash: "#c8d5f1",
    grid: "#c3cbd5",
    Normal: "#055866",
    Advisory: "#624500",
    Degraded: "#853500",
    Critical: "#9c1430",
    Unknown: "#3a4758",
    NormalWash: "#c4dfe2",
    AdvisoryWash: "#eadcb4",
    DegradedWash: "#efd2bd",
    CriticalWash: "#efc9d1",
    UnknownWash: "#cdd3db",
    charts: ["#1a4fc9", "#9a2860", "#0a6445", "#6f4b00", "#34445a", "#a23812"],
  },
  dark: {
    bg: "#0a0c0e",
    paper: "#101316",
    raised: "#161a1e",
    track: "#1d2227",
    line: "#2e363d",
    strongLine: "#66717b",
    ink: "#e8ebee",
    muted: "#aeb6be",
    accent: "#a996ff",
    accentWash: "#221d3a",
    grid: "#1f252b",
    Normal: "#5fb8c8",
    Advisory: "#e3c555",
    Degraded: "#f0913a",
    Critical: "#ff5c6c",
    Unknown: "#8d96a0",
    NormalWash: "#0f2226",
    AdvisoryWash: "#2a2410",
    DegradedWash: "#2c1b0c",
    CriticalWash: "#2e1015",
    UnknownWash: "#1b1f24",
    charts: ["#6cb4ff", "#f29ec8", "#86d3ad", "#d8c08e", "#b8c6d4", "#ff9f80"],
  },
};

/** A feature-local theme faithful to the supplied control-room reference. */
export function createAnomalyTheme(mode = "slate") {
  const p = ANOMALY_PALETTES[mode] ?? ANOMALY_PALETTES.slate;
  return createTheme(theme, {
    palette: {
      mode: mode === "dark" ? "dark" : "light",
      primary: {
        main: p.accent,
        contrastText: mode === "dark" ? p.bg : "#ffffff",
      },
      text: { primary: p.ink, secondary: p.muted, disabled: p.muted },
      background: { default: p.bg, paper: p.paper },
      action: {
        active: p.muted,
        hover: alpha(p.accent, 0.08),
        selected: alpha(p.accent, 0.14),
        disabled: alpha(p.muted, 0.5),
        disabledBackground: alpha(p.muted, 0.12),
      },
      divider: p.line,
      error: { main: p.Critical },
      warning: { main: p.Advisory },
      success: { main: p.Normal },
    },
    typography: {
      fontFamily: "Geist, system-ui, sans-serif",
      fontSize: 12,
      ...Object.fromEntries(
        [
          "h1",
          "h2",
          "h3",
          "h4",
          "h5",
          "h6",
          "subtitle1",
          "subtitle2",
          "body1",
          "body2",
          "caption",
          "button",
          "overline",
        ].map((variant) => [
          variant,
          {
            ...theme.typography[variant],
            fontFamily: "Geist, system-ui, sans-serif",
          },
        ]),
      ),
      body1: {
        fontFamily: "Geist, system-ui, sans-serif",
        fontSize: 13,
        lineHeight: "20px",
      },
      body2: {
        fontFamily: "Geist, system-ui, sans-serif",
        fontSize: 12,
        lineHeight: "18px",
      },
      caption: {
        fontFamily: "Geist, system-ui, sans-serif",
        fontSize: 11,
        lineHeight: "16px",
      },
    },
    shape: { borderRadius: 4 },
    custom: { ...theme.custom, anomaly: p },
    components: {
      MuiButton: {
        styleOverrides: {
          root: {
            borderRadius: 2,
            fontSize: 12,
            minHeight: 28,
            padding: "3px 10px",
          },
          outlined: { borderColor: p.strongLine },
        },
      },
      MuiChip: {
        styleOverrides: { root: { borderRadius: 2, height: 22, fontSize: 11 } },
      },
      MuiPaper: { styleOverrides: { root: { backgroundImage: "none" } } },
      MuiToggleButton: {
        styleOverrides: {
          root: {
            color: p.muted,
            textTransform: "none",
            "&.Mui-selected": { color: p.ink, backgroundColor: p.track },
            "&.Mui-disabled": { color: p.Unknown },
          },
        },
      },
      MuiIconButton: { styleOverrides: { root: { color: p.muted } } },
      MuiCheckbox: {
        styleOverrides: {
          root: { color: p.muted, "&.Mui-checked": { color: p.accent } },
        },
      },
      MuiTableCell: {
        styleOverrides: {
          root: {
            borderColor: p.line,
            color: p.ink,
            padding: "5px 8px",
            fontSize: 12,
          },
          head: {
            backgroundColor: p.raised,
            color: p.muted,
            fontWeight: 600,
            whiteSpace: "nowrap",
            borderBottom: `1px solid ${p.line}`,
          },
        },
      },
      MuiButtonBase: {
        styleOverrides: {
          root: {
            "&.Mui-focusVisible": {
              outline: `2px solid ${p.accent}`,
              outlineOffset: -2,
            },
          },
        },
      },
    },
  });
}

export default theme;
