import { useState } from "react";
import { Alert, Box, Stack, Typography } from "@mui/material";
import ChecklistOutlinedIcon from "@mui/icons-material/ChecklistOutlined";
import FactCheckOutlinedIcon from "@mui/icons-material/FactCheckOutlined";
import HealthAndSafetyOutlinedIcon from "@mui/icons-material/HealthAndSafetyOutlined";
import Inventory2OutlinedIcon from "@mui/icons-material/Inventory2Outlined";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import TuneOutlinedIcon from "@mui/icons-material/TuneOutlined";
import { getCalibration } from "@/api/calibration.js";
import { calibrationCard } from "@/lib/calibration.js";
import { maintenanceKpiPresentation } from "@/lib/maintenanceKpiPresentation.js";
import CalibrationDrillPanel from "@/components/calibration/CalibrationDrillPanel.jsx";
import { usePolledQuery } from "@/hooks/usePolledQuery.js";
import JKLoader from "@/components/JKLoader.jsx";
import { QKpiCard } from "@/components/quality/shared/QualityKpiCard.jsx";
import { engineeringKpiStatus } from "./engineeringKpiStatus.js";
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

const MAINTENANCE_APP_URL = "http://35.208.174.2:3001/";

const KPI_ICONS = {
  calibration: TuneOutlinedIcon,
  "stock-cost": Inventory2OutlinedIcon,
  pm: FactCheckOutlinedIcon,
  daily: ChecklistOutlinedIcon,
  safety: HealthAndSafetyOutlinedIcon,
};

/** External links use the shared card's appearance without implying a KPI value. */
function MaintenanceLinkCard({ name, description, href, iconComponent }) {
  return (
    <Box
      component="a"
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`${name} — open maintenance app in a new tab`}
      sx={{
        display: "block",
        minWidth: 0,
        color: "inherit",
        textDecoration: "none",
        borderRadius: 2.5,
        "&:hover > div": { borderColor: "primary.main", boxShadow: 3 },
        "&:focus-visible": {
          outline: "2px solid",
          outlineColor: "primary.main",
          outlineOffset: 2,
        },
      }}
    >
      <QKpiCard
        kpi={{
          n: name,
          metricAvailable: true,
          footerLabel: "Opens in a new tab",
          showProgress: false,
          alignMetrics: true,
          cardMinHeight: 160,
        }}
        iconComponent={iconComponent}
        metricContent={
          <Box sx={{ flex: 1, minWidth: 0, mt: 0.5 }}>
            <Stack direction="row" alignItems="center" spacing={0.75}>
              <Typography
                sx={{ fontSize: 18, fontWeight: 700, color: "text.primary" }}
              >
                Open maintenance app
              </Typography>
              <OpenInNewIcon
                aria-hidden="true"
                sx={{ fontSize: 17, color: "primary.main" }}
              />
            </Stack>
            <Typography sx={{ mt: 0.5, fontSize: 12, color: "text.secondary" }}>
              {description}
            </Typography>
          </Box>
        }
      />
    </Box>
  );
}

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
  const safetyScope = safetyPeriod(selectedPeriod, shift);
  const safety = useSafetyQuery(
    safetyScope ? { ...safetyScope, level: "overall" } : null,
  );
  const drillOpen = Boolean(
    open &&
    (open === "calibration" ||
      (open === "stock-cost" && stockRange) ||
      (open === "safety" && safetyScope)),
  );
  // Background calibration refreshes keep the existing cards visible.
  const loading =
    (calibration.isLoading && !calibration.data) ||
    stock.isLoading ||
    safety.isLoading;
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
    {
      id: "pm",
      link: {
        name: "PM Compliance",
        description: "View preventive maintenance compliance",
      },
    },
    {
      id: "daily",
      link: {
        name: "Daily Checksheet Compliance",
        description: "View daily checksheet compliance",
      },
    },
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
        <Box
          sx={{
            display: "flex",
            flexDirection: { xs: "column", lg: drillOpen ? "row" : "column" },
            gap: 1.5,
            alignItems: "flex-start",
            width: "100%",
          }}
        >
          <Box
            sx={{
              display: "grid",
              gap: 1.5,
              width: { xs: "100%", lg: drillOpen ? 340 : "100%" },
              flex: { lg: drillOpen ? "0 0 340px" : "1 1 auto" },
              gridTemplateColumns: drillOpen
                ? "1fr"
                : {
                    xs: "1fr",
                    sm: "repeat(2, minmax(0, 1fr))",
                    md: "repeat(3, minmax(0, 1fr))",
                  },
            }}
          >
            {cards.map(({ id, kpi, state, onTrend, link }) => {
              if (link)
                return (
                  <MaintenanceLinkCard
                    key={id}
                    {...link}
                    href={MAINTENANCE_APP_URL}
                    iconComponent={KPI_ICONS[id]}
                  />
                );
              const presentation = maintenanceKpiPresentation(kpi, state);
              const { status, info, target } = engineeringKpiStatus(
                id,
                presentation.v,
              );
              const ragInfo = (presentation.ragInfo ?? []).filter(
                (line) => !line.startsWith("Card accent colors are decorative"),
              );
              return (
                <QKpiCard
                  key={id}
                  kpi={{
                    ...presentation,
                    status,
                    presentationTone: undefined,
                    cardTintPalette: "engineering",
                    target: target ?? presentation.target,
                    footerLabel:
                      target || presentation.target
                        ? undefined
                        : "No status target",
                    showProgress: true,
                    keepProgressWhenOpen: true,
                    alignProgress: true,
                    progressValue: null,
                    progressLabel:
                      "No target is used for this bar; the unfilled track is not a performance measure.",
                    ragInfo: [...ragInfo, ...info],
                  }}
                  iconComponent={KPI_ICONS[id]}
                  isOpen={drillOpen && open === id}
                  onToggle={() => setOpen(open === id ? null : id)}
                  onTrend={onTrend}
                />
              );
            })}
          </Box>
          {drillOpen && (
            <Box sx={{ flex: 1, minWidth: 0, width: "100%" }}>
              {open === "calibration" ? (
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
              ) : null}
            </Box>
          )}
        </Box>
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
