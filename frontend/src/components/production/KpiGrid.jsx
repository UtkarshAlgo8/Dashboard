import { Box, Typography } from "@mui/material";
import KpiCard from "./KpiCard.jsx";
import StockSubSelector from "./StockSubSelector.jsx";
import JKLoader from "@/components/JKLoader.jsx";

/**
 * KPI grid — CR-08 refactor.
 *
 * CR-08: parent (BanmoreProduction) owns data fetch via useDashboardFetch.
 * KpiGrid is a pure presentational component — receives kpis as props,
 * manages only drill-click delegation up to the parent.
 * TrendModal lives in BanmoreProduction so it doesn't need local state.
 *
 * @param {object[]} [props.kpis]
 * @param {boolean}  props.isLoading
 * @param {Error|null} props.error
 * @param {string|null} props.openDrillKpiId — id of the currently open drill card, or null
 * @param {Function} props.onDrillKpi     — (kpi) => void — toggle drill
 * @param {Function} props.onCloseDrill    — () => void — close the open drill
 * @param {Function} props.onTrendOpen    - (kpi) => void
 * @param {boolean}  [props.showStockSubSelector]
 * @param {string}   [props.stockSelector]
 * @param {Function} [props.onStockSelectorChange]
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
    onDrillKpi(kpi);
  };

  return (
    <Box sx={{ p: 2, display: "flex", flexDirection: "column", gap: 2 }}>
      {showStockSubSelector && (
        <StockSubSelector
          value={stockSelector}
          onChange={onStockSelectorChange}
        />
      )}

      {error && (
        <Box sx={{ py: 2, textAlign: "center" }}>
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
            minHeight: 140,
          }}
        >
          <JKLoader />
        </Box>
      ) : !kpis || kpis.length === 0 ? (
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
            // minmax(0, 1fr) — not just 1fr — so cards can shrink below
            // their content's intrinsic width without forcing one off
            // the row. Without this, a card with a wide sparkline or
            // long label can push the 4th card onto a new line on
            // narrower viewports.
            gridTemplateColumns: {
              xs: "1fr",
              sm: "repeat(2, minmax(0, 1fr))",
              md: `repeat(${kpis.length}, minmax(0, 1fr))`,
            },
          }}
        >
          {kpis.map((kpi) => (
            <KpiCard
              key={kpi.id}
              kpi={kpi}
              isDrilling={openDrillKpiId === kpi.id}
              onClick={() => handleCardClick(kpi)}
              onTrendOpen={() => onTrendOpen(kpi)}
              onCloseDrill={() => onCloseDrill()}
            />
          ))}
        </Box>
      )}
    </Box>
  );
}

export default KpiGrid;
