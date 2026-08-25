import { Box, Typography } from "@mui/material";
import KpiCard from "./KpiCard.jsx";
import StockSubSelector from "./StockSubSelector.jsx";
import JKLoader from "@/components/JKLoader.jsx";

/**
 * KPI Grid component for Production & other categories.
 * Maps dynamic KPIs passed from useDashboardFetch.
 */
function KpiGrid({
  kpis,
  isLoading,
  error,
  openDrillKpiId,
  onDrillKpi,
  onCloseDrill,
  onTrendOpen,
  showStockSubSelector = false,
  stockSelector,
  onStockSelectorChange,
}) {
  const handleCardClick = (kpi) => {
    onDrillKpi?.(kpi);
  };

  const validKpis = Array.isArray(kpis) ? kpis : [];

  return (
    <Box
      sx={{ py: 2, px: 0, display: "flex", flexDirection: "column", gap: 2 }}
    >
      {showStockSubSelector && (
        <StockSubSelector
          value={stockSelector}
          onChange={onStockSelectorChange}
        />
      )}

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
          <Typography sx={{ fontSize: 13 }}>
            No KPIs for this section / category combination.
          </Typography>
        </Box>
      ) : (
        <Box
          sx={{
            display: "grid",
            gap: 2,
            gridTemplateColumns: openDrillKpiId 
              ? "1fr" 
              : {
                  xs: "1fr",
                  sm: "repeat(2, minmax(0, 1fr))",
                  md: `repeat(${validKpis.length}, minmax(0, 1fr))`,
                },
          }}
        >
          {validKpis.map((kpi) => (
            <KpiCard
              key={kpi.id || kpi.name}
              kpi={kpi}
              isDrilling={openDrillKpiId === kpi.id}
              onClick={() => handleCardClick(kpi)}
              onTrendOpen={() => onTrendOpen?.(kpi)}
              onCloseDrill={() => onCloseDrill?.()}
            />
          ))}
        </Box>
      )}
    </Box>
  );
}

export default KpiGrid;
