import { Box, Typography } from "@mui/material";
import EngineeringKpiCard from "./EngineeringKpiCard.jsx";
import JKLoader from "@/components/JKLoader.jsx";

/**
 * Responsive grid of Engineering KPI tiles for the active tab (spec 16).
 * Loading / empty / error states mirror `production/KpiGrid.jsx`, simplified
 * for this shell (no drill state to track).
 */
function EngineeringKpiGrid({ kpis, isLoading, error }) {
  const validKpis = Array.isArray(kpis) ? kpis : [];

  return (
    <Box
      sx={{ py: 2, px: 0, display: "flex", flexDirection: "column", gap: 2 }}
    >
      {error && (
        <Box sx={{ py: 1, textAlign: "center" }}>
          <Typography sx={{ fontSize: 13, color: "error.main" }}>
            Failed to load KPIs — {error.message}
          </Typography>
        </Box>
      )}

      {isLoading ? (
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            minHeight: 145,
          }}
        >
          <JKLoader />
        </Box>
      ) : validKpis.length === 0 ? (
        <Box sx={{ py: 4, textAlign: "center", color: "text.disabled" }}>
          <Typography sx={{ fontSize: 13 }}>No KPIs for this tab.</Typography>
        </Box>
      ) : (
        <Box
          sx={{
            display: "grid",
            gap: 2,
            gridTemplateColumns: {
              xs: "1fr",
              sm: "repeat(2, minmax(0, 1fr))",
              md: "repeat(3, minmax(0, 1fr))",
              lg: "repeat(4, minmax(0, 1fr))",
            },
          }}
        >
          {validKpis.map((kpi) => (
            <EngineeringKpiCard key={kpi.id || kpi.name} kpi={kpi} />
          ))}
        </Box>
      )}
    </Box>
  );
}

export default EngineeringKpiGrid;
