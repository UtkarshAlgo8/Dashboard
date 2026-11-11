import { useState } from "react";
import { Alert, Stack, Typography } from "@mui/material";
import { getCompliance } from "@/api/compliance.js";
import { getCalibration } from "@/api/calibration.js";
import { calibrationCard } from "@/lib/calibration.js";
import CalibrationDrillPanel from "@/components/calibration/CalibrationDrillPanel.jsx";
import { usePolledQuery } from "@/hooks/usePolledQuery.js";
import { QKpiCard } from "@/components/quality/shared/QualityKpiCard.jsx";
import { KpiSplitLayout } from "@/components/quality/shared/KpiSplitLayout.jsx";
import ComplianceDrillPanel from "@/components/compliance/ComplianceDrillPanel.jsx";
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
      <KpiSplitLayout
        open={drillOpen}
        cards={[
          <QKpiCard
            key="calibration"
            kpi={calibrationCard(calibration.data, {
              error: calibration.error,
              isLoading: calibration.isLoading,
            })}
            isOpen={drillOpen && open === "calibration"}
            onToggle={() =>
              setOpen(open === "calibration" ? null : "calibration")
            }
          />,
          <QKpiCard
            key="stock-cost"
            kpi={stockCostCard(stock.data, {
              range: stockRange,
              error: stock.error,
              isLoading: stock.isLoading,
            })}
            isOpen={drillOpen && open === "stock-cost"}
            onToggle={() =>
              setOpen(open === "stock-cost" ? null : "stock-cost")
            }
            onTrend={() => setStockTrend({ category: "" })}
          />,
          ...["pm", "daily"].map((id) => (
            <QKpiCard
              key={id}
              kpi={complianceCard(id, matches ? query.data.kpis[id] : null, {
                period,
                error: query.error,
                isLoading: query.isLoading || (period && !matches),
              })}
              isOpen={drillOpen && open === id}
              onToggle={() => setOpen(open === id ? null : id)}
            />
          )),
          <QKpiCard
            key="safety"
            kpi={safetyCard(safety.data, {
              period: safetyScope,
              error: safety.error,
              isLoading: safety.isLoading,
            })}
            isOpen={drillOpen && open === "safety"}
            onToggle={() => setOpen(open === "safety" ? null : "safety")}
          />,
        ]}
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
              key={`${open}|${period.date}|${period.granularity}`}
              id={open}
              period={period}
              onClose={() => setOpen(null)}
            />
          ))
        }
      />
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
