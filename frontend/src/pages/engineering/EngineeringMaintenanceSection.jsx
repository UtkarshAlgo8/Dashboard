import { useState } from "react";
import { Alert, Stack, Typography } from "@mui/material";
import { getCompliance } from "@/api/compliance.js";
import { getCalibration } from "@/api/calibration.js";
import { calibrationCard } from "@/lib/calibration.js";
import { maintenanceKpiPresentation } from "@/lib/maintenanceKpiPresentation.js";
import CalibrationDrillPanel from "@/components/calibration/CalibrationDrillPanel.jsx";
import { usePolledQuery } from "@/hooks/usePolledQuery.js";
import JKLoader from "@/components/JKLoader.jsx";
import { QKpiCard } from "@/components/quality/shared/QualityKpiCard.jsx";
import { KpiSplitLayout } from "@/components/quality/shared/KpiSplitLayout.jsx";
import ComplianceDrillPanel from "@/components/compliance/ComplianceDrillPanel.jsx";
import ComplianceTrendModal from "@/components/compliance/ComplianceTrendModal.jsx";
import SafetyDrillPanel from "@/components/safety/SafetyDrillPanel.jsx";
import useSafetyQuery from "@/hooks/useSafetyQuery.js";
import useStockCostQuery from "@/hooks/useStockCostQuery.js";
import StockCostDrillPanel from "@/components/stock-cost/StockCostDrillPanel.jsx";
import StockCostTrendModal from "@/components/stock-cost/StockCostTrendModal.jsx";
import {
  stockCostCard,
  stockCostRange,
  STOCK_COST_PERIOD_HELP,
} from "@/lib/stockCost.js";
import { safetyCard, safetyPeriod, SAFETY_PERIOD_HELP } from "@/lib/safety.js";
import {
  complianceCard,
  COMPLIANCE_PERIOD_HELP,
  storedCompliancePeriod,
} from "@/lib/compliance.js";

/** BTP Maintenance: connected cards only, with one shared right-hand drill. */
export default function EngineeringMaintenanceSection({
  period: selectedPeriod,
  shift,
}) {
  const [open, setOpen] = useState(null);
  const [stockTrend, setStockTrend] = useState(null);
  const [complianceTrend, setComplianceTrend] = useState(null);
  const calibration = usePolledQuery(getCalibration, {
    interval: 60000,
  });
  const stockRange = stockCostRange(selectedPeriod);
  const stock = useStockCostQuery(stockRange);
  const period = storedCompliancePeriod({ ...selectedPeriod, shift });
  const query = usePolledQuery(
    () => getCompliance({ ids: ["pm", "daily"], ...period }),
    {
      enabled: Boolean(period),
      interval: 0,
      deps: [period?.date, period?.granularity],
    },
  );
  const context = query.data?.context;
  const matches =
    period &&
    context?.date === period.date &&
    context?.granularity === period.granularity;
  const safetyScope = safetyPeriod(selectedPeriod, shift);
  const safety = useSafetyQuery(
    safetyScope ? { ...safetyScope, level: "overall" } : null,
  );
  const drillOpen = Boolean(
    open &&
    (open === "calibration"
      ? true
      : open === "stock-cost"
        ? stockRange
        : open === "safety"
          ? safetyScope
          : period),
  );

  const complianceState = {
    error: period ? query.error : null,
    isLoading:
      Boolean(period) && (query.isLoading || (!matches && !query.error)),
  };
  // Background calibration refreshes keep the existing cards visible.
  const loading =
    (calibration.isLoading && !calibration.data) ||
    stock.isLoading ||
    safety.isLoading ||
    (complianceState.isLoading && !matches);
  const cards = [
    {
      id: "calibration",
      kpi: calibrationCard(calibration.data, calibration),
      state: calibration,
    },
    {
      id: "stock-cost",
      kpi: stockCostCard(stock.data, { range: stockRange, ...stock }),
      state: stock,
      onTrend: () => setStockTrend({ category: "" }),
    },
    ...["pm", "daily"].map((id) => ({
      id,
      kpi: {
        ...complianceCard(id, matches ? query.data.kpis[id] : null, {
          period,
          ...complianceState,
        }),
        trendApi: true,
      },
      state: complianceState,
      onTrend: () => setComplianceTrend(id),
    })),
    {
      id: "safety",
      kpi: safetyCard(safety.data, { period: safetyScope, ...safety }),
      state: safety,
    },
  ];

  return (
    <Stack spacing={2}>
      <Typography component="h1" sx={{ fontSize: 20, fontWeight: 700 }}>
        Maintenance
      </Typography>
      {!period && <Alert severity="info">{COMPLIANCE_PERIOD_HELP}</Alert>}
      {query.error && period && (
        <Alert severity="error">
          Compliance unavailable: {query.error.message}
        </Alert>
      )}
      {!safetyScope && <Alert severity="info">{SAFETY_PERIOD_HELP}</Alert>}
      {!stockRange && <Alert severity="info">{STOCK_COST_PERIOD_HELP}</Alert>}
      {stock.error && (
        <Alert severity="error">
          Stock Cost unavailable: {stock.error.message}
        </Alert>
      )}
      {loading ? (
        <JKLoader message="Loading Maintenance KPIs" />
      ) : (
        <KpiSplitLayout
          open={drillOpen}
          cards={cards.map(({ id, kpi, state, onTrend }) => (
            <QKpiCard
              key={id}
              kpi={maintenanceKpiPresentation(kpi, state)}
              isOpen={drillOpen && open === id}
              onToggle={() => setOpen(open === id ? null : id)}
              onTrend={onTrend}
            />
          ))}
          panel={
            drillOpen &&
            (open === "calibration" ? (
              <CalibrationDrillPanel
                query={calibration}
                onClose={() => setOpen(null)}
              />
            ) : open === "stock-cost" ? (
              <StockCostDrillPanel
                query={stock}
                onClose={() => setOpen(null)}
                onTrend={(category) => setStockTrend({ category })}
              />
            ) : open === "safety" ? (
              <SafetyDrillPanel
                key={JSON.stringify(safetyScope)}
                period={safetyScope}
                onClose={() => setOpen(null)}
              />
            ) : (
              <ComplianceDrillPanel
                enableDownloads
                key={`${open}|${period.date}|${period.granularity}`}
                id={open}
                period={period}
                onClose={() => setOpen(null)}
              />
            ))
          }
        />
      )}
      {complianceTrend && (
        <ComplianceTrendModal
          key={complianceTrend}
          id={complianceTrend}
          anchor={selectedPeriod.date}
          onClose={() => setComplianceTrend(null)}
        />
      )}
      {stockTrend && stockRange && (
        <StockCostTrendModal
          key={`${stockRange.from}|${stockRange.to}|${stockTrend.category}`}
          range={stockRange}
          initialCategory={stockTrend.category}
          onClose={() => setStockTrend(null)}
        />
      )}
    </Stack>
  );
}
