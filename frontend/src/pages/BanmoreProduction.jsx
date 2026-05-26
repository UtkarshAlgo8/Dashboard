import { useState } from "react";
import { Box, Stack, useTheme } from "@mui/material";
import ProductionHeader from "@/components/production/ProductionHeader.jsx";
import SectionSidebar from "@/components/production/SectionSidebar.jsx";
import PlantSummaryCard from "@/components/production/PlantSummaryCard.jsx";
import CategoryTabs from "@/components/production/CategoryTabs.jsx";
import KpiGrid from "@/components/production/KpiGrid.jsx";
import ProductionBodySkeleton from "@/components/production/ProductionBodySkeleton.jsx";
import InventoryPage from "@/components/inventory/InventoryPage.jsx";
import { usePolledQuery } from "@/hooks/usePolledQuery.js";
import {
  getPlant,
  getSections,
  getCategoryTabs,
  getPlantSummary,
} from "@/api/plants.js";

/**
 * Banmore Production dashboard — spec 04 ships the chrome only.
 * KPI grid (spec 05+), drills (specs 06–09), trend modal (spec 10),
 * and print (spec 13) fill in over subsequent specs.
 */
function BanmoreProduction() {
  const theme = useTheme();

  const { data: plant, isLoading: plantLoading } = usePolledQuery(
    () => getPlant("banmore"),
    { interval: 0 },
  );
  const { data: sections } = usePolledQuery(getSections, { interval: 0 });
  const { data: tabs } = usePolledQuery(getCategoryTabs, { interval: 0 });
  const { data: summary } = usePolledQuery(() => getPlantSummary("banmore"), {
    interval: 0,
  });

  const [section, setSection] = useState("mix");
  const [category, setCategory] = useState("p");
  const [stockSelector, setStockSelector] = useState("4roll"); // Stock default per FR-P18
  const [timeRange, setTimeRange] = useState({
    preset: "today",
    from: "",
    to: "",
  });
  // CR-05: shift filter is UI-only for Phase 1 (Q-SH-01 resolved
  // "pure UI"). Visible only while the Today preset is active.
  // Wired through to the dashboard so consumers can opt in later
  // when shift-tagged mock data lands.
  const [shift, setShift] = useState("all");

  const ready =
    !plantLoading &&
    plant &&
    Array.isArray(sections) &&
    Array.isArray(tabs) &&
    summary;

  return (
    <Box
      sx={{
        minHeight: "100vh",
        backgroundColor: "background.default",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <ProductionHeader
        plant={plant}
        timeRange={timeRange}
        onTimeRangeChange={setTimeRange}
        shift={shift}
        onShiftChange={setShift}
      />

      {!ready ? (
        <ProductionBodySkeleton />
      ) : (
        <Box
          sx={{
            flex: 1,
            display: "grid",
            gridTemplateColumns:
              category === "i" ? "1fr" : { xs: "1fr", md: "220px 1fr" },
            gap: 2,
            p: 2,
          }}
        >
          {/* Sections sidebar hidden when Inventory is active (full-width view per artifact). */}
          {category !== "i" && (
            <Stack spacing={2} sx={{ height: "100%" }}>
              <Box
                sx={{
                  backgroundColor: "background.paper",
                  border: 1,
                  borderColor: "divider",
                  borderRadius: 1.25,
                  p: 1,
                  flex: 1,
                }}
              >
                <SectionSidebar
                  sections={sections}
                  activeSectionId={section}
                  onSelect={setSection}
                />
              </Box>
              <PlantSummaryCard plant={plant} summary={summary} />
            </Stack>
          )}

          <Box
            sx={{
              backgroundColor: "background.paper",
              border: 1,
              borderColor: "divider",
              borderRadius: 1.25,
              boxShadow: theme.custom.shadow,
              display: "flex",
              flexDirection: "column",
            }}
          >
            <CategoryTabs
              tabs={tabs}
              activeTabId={category}
              onSelect={setCategory}
            />
            {category === "i" ? (
              <InventoryPage plantId="banmore" />
            ) : (
              <KpiGrid
                plantId="banmore"
                section={section}
                tab={category}
                stockSelector={stockSelector}
                onStockSelectorChange={setStockSelector}
              />
            )}
          </Box>
        </Box>
      )}
    </Box>
  );
}

export default BanmoreProduction;
