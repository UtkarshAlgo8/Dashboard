/**
 * Quality KPI grid with the drill panel beside it. Closed: a 4-column card
 * grid. Open (lg+): the cards collapse into a 340px column on the left and
 * the drill panel fills the right; below lg the two stack.
 */
import { Box } from "@mui/material";

export function KpiSplitLayout({ open, cards, panel, stackCards = false }) {
  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: {
          xs: "column",
          lg: open ? "row" : "column",
        },
        gap: 2,
        alignItems: "flex-start",
        width: "100%",
        transition: "all .3s ease",
      }}
    >
      <Box
        sx={{
          display: "grid",
          gap: 2,
          width: open || stackCards ? { xs: "100%", lg: "340px" } : "100%",
          flex: open
            ? stackCards
              ? { xs: "1 1 auto", lg: "0 0 340px" }
              : "0 0 340px"
            : "1 1 auto",
          gridTemplateColumns:
            open || stackCards
              ? "1fr"
              : {
                  xs: "1fr",
                  sm: "repeat(2, minmax(0, 1fr))",
                  md: "repeat(4, minmax(0, 1fr))",
                },
          transition: "all .3s ease",
        }}
      >
        {cards}
      </Box>

      {open && (
        <Box
          sx={{
            flex: 1,
            minWidth: 0,
            width: "100%",
            pt: { xs: 0, lg: 0 },
            animation: "fadeIn .3s ease",
          }}
        >
          {panel}
        </Box>
      )}
    </Box>
  );
}
