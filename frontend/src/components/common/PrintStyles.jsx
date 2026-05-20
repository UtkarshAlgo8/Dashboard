import { GlobalStyles } from "@mui/material";

/**
 * Global @media print rules per BRD §9.5 (FR-X27). Mounted once in
 * App.jsx so every route inherits the same print behaviour.
 *
 * Strategy:
 *   - Hide interactive chrome (icon buttons, sub-selectors, modals,
 *     toasts, chevrons).
 *   - Force theme colours to print exactly (light backgrounds
 *     become explicit; coloured chips and threshold cells stay
 *     coloured).
 *   - Apply a half-inch margin so the dashboard content fits the
 *     printable area.
 *
 * Anything that should be hidden ad-hoc can take the `.no-print`
 * class.
 */
function PrintStyles() {
  return (
    <GlobalStyles
      styles={{
        "@media print": {
          "*": {
            WebkitPrintColorAdjust: "exact",
            printColorAdjust: "exact",
          },
          "@page": { margin: "0.5in" },
          "html, body": {
            backgroundColor: "#FFFFFF",
            margin: 0,
            padding: 0,
          },
          // Hide interactive controls
          ".no-print": { display: "none !important" },
          ".MuiIconButton-root": { display: "none !important" },
          ".MuiToggleButtonGroup-root": { display: "none !important" },
          ".MuiSnackbar-root": { display: "none !important" },
          ".MuiDialog-root": { display: "none !important" },
          // Drill chevrons (used in MachineTable A/P/Q cells)
          ".MuiTableCell-root svg[data-testid='ChevronRightIcon']": {
            display: "none !important",
          },
          ".MuiTableCell-root svg[data-testid='ExpandMoreIcon']": {
            display: "none !important",
          },
          // Tooltips never need to print
          ".MuiTooltip-popper": { display: "none !important" },
          // Make sure the dashboard background prints as the
          // light grey it shows on screen
          ".MuiBox-root, .MuiPaper-root": {
            boxShadow: "none !important",
          },
        },
      }}
    />
  );
}

export default PrintStyles;
