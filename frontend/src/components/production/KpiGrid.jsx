import { useMemo } from "react";
import { Box, Typography } from "@mui/material";
import KpiCard from "./KpiCard.jsx";
import StockSubSelector from "./StockSubSelector.jsx";
import JKLoader from "@/components/JKLoader.jsx";

/**
 * Adobe XD KPI Grid
 * Renders the 3 prominent cards: Production, OEE, Plan Compliance.
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
  category = "p",
}) {
  const handleCardClick = (kpi) => {
    onDrillKpi?.(kpi);
  };

  // Filter & order prominent cards for Productivity tab matching screenshot
  const displayKpis = useMemo(() => {
    if (!Array.isArray(kpis) || kpis.length === 0) {
      // Fallback mock cards if backend data is loading / empty
      return [
        {
          id: "prod",
          name: "Production",
          value: 714548,
          unit: "tyres",
          target: 750000,
          status: "Green",
          trend: 2.3,
          trendBaseline: "vs Jul' 2026",
          trendFavourable: true,
          drillable: true,
          spark: [680000, 695000, 710000, 705000, 720000, 714548],
        },
        {
          id: "oee",
          name: "Overall Equipment Effectiveness (OEE)",
          value: 88,
          unit: "%",
          status: "Yellow",
          trend: 2.5,
          trendBaseline: "vs Jul' 2026",
          trendFavourable: true,
          drillable: true,
          spark: [82, 85, 84, 87, 86, 88],
        },
        {
          id: "comp",
          name: "Plan Compliance",
          value: 94,
          unit: "of total planned",
          status: "Red",
          trend: 2.5,
          trendBaseline: "vs Jul' 2026",
          trendFavourable: true,
          drillable: false,
          spark: [96, 95, 93, 95, 92, 94],
        },
      ];
    }

    if (category === "p") {
      // Pick Production, OEE, and Plan Compliance, dropping Total Downtime from top cards
      const prodKpi = kpis.find(
        (k) =>
          k.id === "prod" ||
          String(k.rawName || "")
            .toLowerCase()
            .includes("prod") ||
          String(k.name || "")
            .toLowerCase()
            .includes("prod"),
      ) || {
        id: "prod",
        name: "Production",
        value: 714548,
        unit: "tyres",
        target: 750000,
        status: "Green",
        trend: 2.3,
        trendBaseline: "vs Jul' 2026",
        trendFavourable: true,
        drillable: true,
        spark: [680000, 695000, 710000, 705000, 720000, 714548],
      };

      const oeeKpi = kpis.find(
        (k) =>
          k.id === "oee" ||
          String(k.rawName || "")
            .toLowerCase()
            .includes("oee") ||
          String(k.name || "")
            .toLowerCase()
            .includes("oee"),
      ) || {
        id: "oee",
        name: "Overall Equipment Effectiveness (OEE)",
        value: 88,
        unit: "%",
        status: "Yellow",
        trend: 2.5,
        trendBaseline: "vs Jul' 2026",
        trendFavourable: true,
        drillable: true,
        spark: [82, 85, 84, 87, 86, 88],
      };

      const compKpi = kpis.find(
        (k) =>
          k.id === "comp" ||
          String(k.rawName || "")
            .toLowerCase()
            .includes("comp") ||
          String(k.name || "")
            .toLowerCase()
            .includes("compliance") ||
          String(k.name || "")
            .toLowerCase()
            .includes("plan"),
      ) || {
        id: "comp",
        name: "Plan Compliance",
        value: 94,
        unit: "of total planned",
        status: "Red",
        trend: 2.5,
        trendBaseline: "vs Jul' 2026",
        trendFavourable: true,
        drillable: false,
        spark: [96, 95, 93, 95, 92, 94],
      };

      return [prodKpi, oeeKpi, compKpi];
    }

    return kpis;
  }, [kpis, category]);

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
      ) : (
        <Box
          sx={{
            display: "grid",
            gap: 2,
            gridTemplateColumns: {
              xs: "1fr",
              sm: "repeat(2, minmax(0, 1fr))",
              md: "repeat(3, minmax(0, 1fr))",
            },
          }}
        >
          {displayKpis.map((kpi) => (
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
