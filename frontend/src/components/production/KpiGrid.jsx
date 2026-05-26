import { useMemo, useState } from "react";
import { Box, Typography, useTheme } from "@mui/material";
import KpiCard from "./KpiCard.jsx";
import KpiCardSkeleton from "./KpiCardSkeleton.jsx";
import StockSubSelector from "./StockSubSelector.jsx";
import { usePolledQuery } from "@/hooks/usePolledQuery.js";
import { getKpis } from "@/api/kpis.js";
import { presetToDateRange } from "@/lib/timeRange.js";
import OeeDrillPanel from "@/components/drills/oee/OeeDrillPanel.jsx";
import ProductionDrillPanel from "@/components/drills/production/ProductionDrillPanel.jsx";
import DowntimeDrillPanel from "@/components/drills/downtime/DowntimeDrillPanel.jsx";
import PlanComplianceDrillPanel from "@/components/drills/plan-compliance/PlanComplianceDrillPanel.jsx";
import GenericDrillPanel from "@/components/drills/generic/GenericDrillPanel.jsx";
import TrendModal from "@/components/trend/TrendModal.jsx";

/**
 * KPI grid for the current (section, tab) view. Polls every 60s
 * (Q-DATA-01). Owns the active drill state for the grid; the per-card
 * drill panels embed their own sub-selectors (e.g. Master/Final for
 * Mixing > Production) so the top of the grid stays uncluttered.
 *
 * @param {object} props
 * @param {string} props.plantId
 * @param {string} props.section
 * @param {string} props.tab
 * @param {string} [props.stockSelector] - Stock section sub-selector
 * @param {(s: string) => void} [props.onStockSelectorChange]
 */
function KpiGrid({
  plantId,
  section,
  tab,
  stockSelector,
  onStockSelectorChange,
  timeRange,
  shift,
}) {
  const theme = useTheme();
  const [openDrillId, setOpenDrillId] = useState(null);
  const [trendKpiId, setTrendKpiId] = useState(null);

  const showStockSelector = section === "stk" && tab === "p";

  // Convert preset (today/month/year/custom) → ISO yyyy-mm-dd dates
  // that the backend understands on `?from=&to=`. Memoised so we
  // don't recompute on every render — important because the result
  // feeds usePolledQuery's deps.
  const { from, to } = useMemo(() => presetToDateRange(timeRange), [timeRange]);

  const { data: kpis, isLoading } = usePolledQuery(
    () =>
      getKpis({
        plantId,
        section,
        tab,
        stockSelector,
        from,
        to,
        shift,
      }),
    {
      interval: 60_000,
      deps: [plantId, section, tab, stockSelector, from, to, shift],
    },
  );

  const handleDrillToggle = (id) => {
    setOpenDrillId((current) => (current === id ? null : id));
  };

  const handleTrendOpen = (kpiId) => {
    setTrendKpiId(kpiId);
  };

  const trendKpi =
    trendKpiId && Array.isArray(kpis)
      ? (kpis.find((k) => k.id === trendKpiId) ?? null)
      : null;

  const openKpi =
    openDrillId && Array.isArray(kpis)
      ? (kpis.find((k) => k.id === openDrillId) ?? null)
      : null;

  return (
    <Box sx={{ p: 2, display: "flex", flexDirection: "column", gap: 2 }}>
      {showStockSelector && (
        <StockSubSelector
          value={stockSelector}
          onChange={onStockSelectorChange}
        />
      )}

      {isLoading && !Array.isArray(kpis) ? (
        <Box
          sx={{
            display: "grid",
            gap: 2,
            gridTemplateColumns: {
              xs: "1fr",
              sm: "repeat(2, 1fr)",
              md: "repeat(auto-fit, minmax(220px, 1fr))",
            },
          }}
        >
          {Array.from({ length: 4 }).map((_, i) => (
            <KpiCardSkeleton key={i} />
          ))}
        </Box>
      ) : !Array.isArray(kpis) || kpis.length === 0 ? (
        <Box sx={{ py: 4, textAlign: "center", color: "text.disabled" }}>
          <Typography sx={{ fontSize: 13 }}>
            No KPIs configured for this view yet — see specs 11 / 12.
          </Typography>
        </Box>
      ) : (
        <Box
          sx={{
            display: "grid",
            gap: 2,
            gridTemplateColumns: {
              xs: "1fr",
              sm: "repeat(2, 1fr)",
              md: "repeat(auto-fit, minmax(220px, 1fr))",
            },
          }}
        >
          {kpis.map((kpi) => (
            <KpiCard
              key={kpi.id}
              kpi={kpi}
              isOpen={openDrillId === kpi.id}
              onDrillToggle={handleDrillToggle}
              onTrendOpen={handleTrendOpen}
            />
          ))}
        </Box>
      )}

      {openKpi && openKpi.id === "oee" && (
        <Box
          sx={{
            backgroundColor: "background.paper",
            border: 1,
            borderColor: "divider",
            borderRadius: 1.25,
            p: 2,
          }}
        >
          <OeeDrillPanel
            plantId={plantId}
            section={section}
            from={from}
            to={to}
            shift={shift}
          />
        </Box>
      )}

      {openKpi && openKpi.id === "production" && (
        <Box
          sx={{
            backgroundColor: "background.paper",
            border: 1,
            borderColor: "divider",
            borderRadius: 1.25,
            p: 2,
          }}
        >
          <ProductionDrillPanel
            plantId={plantId}
            section={section}
            stockSelector={stockSelector}
            from={from}
            to={to}
            shift={shift}
          />
        </Box>
      )}

      {openKpi && openKpi.id === "downtime" && (
        <Box
          sx={{
            backgroundColor: "background.paper",
            border: 1,
            borderColor: "divider",
            borderRadius: 1.25,
            p: 2,
          }}
        >
          <DowntimeDrillPanel
            plantId={plantId}
            section={section}
            from={from}
            to={to}
            shift={shift}
          />
        </Box>
      )}

      {openKpi && openKpi.id === "plan-compliance" && (
        <Box
          sx={{
            backgroundColor: "background.paper",
            border: 1,
            borderColor: "divider",
            borderRadius: 1.25,
            p: 2,
          }}
        >
          <PlanComplianceDrillPanel
            plantId={plantId}
            section={section}
            from={from}
            to={to}
            shift={shift}
          />
        </Box>
      )}

      {openKpi &&
        !["oee", "production", "downtime", "plan-compliance"].includes(
          openKpi.id,
        ) &&
        (openKpi.drill ? (
          <Box
            sx={{
              backgroundColor: "background.paper",
              border: 1,
              borderColor: "divider",
              borderRadius: 1.25,
              p: 2,
            }}
          >
            <GenericDrillPanel kpi={openKpi} />
          </Box>
        ) : (
          <Box
            sx={{
              backgroundColor: theme.custom.surface.soft,
              border: 1,
              borderColor: "divider",
              borderRadius: 1.25,
              p: 3,
              textAlign: "center",
            }}
          >
            <Typography sx={{ fontSize: 14, fontWeight: 600 }}>
              {openKpi.name} drill not configured
            </Typography>
            <Typography sx={{ fontSize: 12, color: "text.disabled", mt: 0.5 }}>
              No drill is wired for this KPI.
            </Typography>
          </Box>
        ))}

      <TrendModal
        open={Boolean(trendKpi)}
        onClose={() => setTrendKpiId(null)}
        plantId={plantId}
        kpi={trendKpi}
        section={section}
        category={tab}
      />
    </Box>
  );
}

export default KpiGrid;
