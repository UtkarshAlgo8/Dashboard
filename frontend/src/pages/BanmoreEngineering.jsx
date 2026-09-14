import { useEffect, useState } from "react";
import { Box, useTheme } from "@mui/material";
import ProductionHeader from "@/components/production/ProductionHeader.jsx";
import EngineeringKpiGrid from "@/components/engineering/EngineeringKpiGrid.jsx";
import { usePolledQuery } from "@/hooks/usePolledQuery.js";
import { getPlant, getEngineeringKpis } from "@/api/plants.js";
import { ENGINEERING_TABS } from "@/lib/mockData.js";
import { useToast } from "@/components/common";

/**
 * Engineering Head dashboard shell for Banmore (spec 16). Ships page chrome,
 * the 6-tab strip and a per-tab KPI grid populated with real (mocked)
 * top-level values — no drill-down panels yet (specs 17+).
 */
function BanmoreEngineering() {
  const theme = useTheme();
  const plantId = "banmore";
  const toast = useToast();

  const [activeTab, setActiveTab] = useState("overall");
  const [timeRange, setTimeRange] = useState({
    preset: "today",
    from: "",
    to: "",
  });

  const { data: plant } = usePolledQuery(() => getPlant(plantId), {
    interval: 0,
    deps: [plantId],
  });

  const {
    data: kpis,
    isLoading: kpisLoading,
    error: kpisError,
  } = usePolledQuery(() => getEngineeringKpis(plantId, activeTab), {
    interval: 0,
    deps: [plantId, activeTab],
    keepPreviousData: true,
  });

  useEffect(() => {
    if (kpisError) toast.error("Could not load Engineering dashboard");
  }, [kpisError, toast]);

  const onTimeRangeChange = (updater) => {
    setTimeRange((prev) =>
      typeof updater === "function" ? updater(prev) : updater,
    );
  };

  return (
    <Box
      sx={{
        minHeight: "100vh",
        backgroundColor: "background.default",
      }}
    >
      <Box sx={{ flexShrink: 0, zIndex: theme.zIndex.appBar }}>
        <ProductionHeader
          plant={plant}
          timeRange={timeRange}
          onTimeRangeChange={onTimeRangeChange}
          onExport={() => {}}
          categoryTabs={ENGINEERING_TABS}
          activeCategory={activeTab}
          onCategoryChange={setActiveTab}
          tyreTypes={[]}
        />
      </Box>

      <Box sx={{ px: { xs: 2, md: 3 }, py: 2 }}>
        <EngineeringKpiGrid
          kpis={kpis}
          isLoading={kpisLoading}
          error={kpisError}
        />
      </Box>
    </Box>
  );
}

export default BanmoreEngineering;
