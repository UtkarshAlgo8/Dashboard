import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Box, CircularProgress, Stack, useTheme } from "@mui/material";
import LandingHeader from "@/components/landing/LandingHeader.jsx";
import PlantCardList from "@/components/landing/PlantCardList.jsx";
import FunctionTileStrip from "@/components/landing/FunctionTileStrip.jsx";
import IndiaMap from "@/components/landing/IndiaMap.jsx";
import { useToast } from "@/components/common";
import { usePolledQuery } from "@/hooks/usePolledQuery.js";
import { getPlants, getFunctions } from "@/api/plants.js";

/**
 * Phase 1 active sets — per Q-NAV-01 only Banmore and Production are
 * interactive. Everything else renders visible-but-disabled with a
 * "Phase 2" tooltip. Defined at module scope (not state) because the
 * scope never changes at runtime.
 */
const PHASE_1_ACTIVE_PLANTS = new Set(["banmore"]);
const PHASE_1_ACTIVE_FUNCTIONS = new Set(["prod"]);

function LandingPage() {
  const theme = useTheme();
  const navigate = useNavigate();
  const toast = useToast();

  const { data: plants, isLoading: plantsLoading } = usePolledQuery(getPlants, {
    interval: 0,
  });
  const { data: functions } = usePolledQuery(getFunctions, { interval: 0 });

  const [hov, setHov] = useState(null);
  const [sel, setSel] = useState(null);

  const selectedPlant = useMemo(
    () => (sel && plants ? (plants.find((p) => p.id === sel) ?? null) : null),
    [sel, plants],
  );

  const handleFunctionSelect = (fn) => {
    if (!selectedPlant) return;
    if (fn.id === "prod" && selectedPlant.id === "banmore") {
      navigate("/banmore/production");
      return;
    }
    toast.info(`${fn.name} on ${selectedPlant.name} arrives in Phase 2.`);
  };

  return (
    <Box
      sx={{
        minHeight: "100vh",
        backgroundColor: "background.default",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <LandingHeader />

      <Box sx={{ flex: 1, px: 3, py: 3 }}>
        {plantsLoading || !plants || !functions ? (
          <Stack alignItems="center" justifyContent="center" sx={{ py: 10 }}>
            <CircularProgress size={28} />
          </Stack>
        ) : (
          <Box
            sx={{
              display: "grid",
              gap: 3,
              alignItems: "flex-start",
              gridTemplateColumns: {
                xs: "1fr",
                md: "minmax(360px, 480px) 1fr",
              },
            }}
          >
            {/* Left: plant cards + function tiles strip */}
            <Stack spacing={2.5}>
              <PlantCardList
                plants={plants}
                activePlantIds={PHASE_1_ACTIVE_PLANTS}
                hov={hov}
                sel={sel}
                onHover={setHov}
                onLeave={() => setHov(null)}
                onSelect={setSel}
              />

              {selectedPlant && (
                <Box
                  sx={{
                    backgroundColor: "background.paper",
                    border: 1,
                    borderColor: "divider",
                    borderRadius: 1.25,
                    p: 2,
                    boxShadow: theme.custom.shadow,
                  }}
                >
                  <FunctionTileStrip
                    functions={functions}
                    selectedPlant={selectedPlant}
                    activeFunctionIds={
                      selectedPlant.id === "banmore"
                        ? PHASE_1_ACTIVE_FUNCTIONS
                        : new Set()
                    }
                    onSelect={handleFunctionSelect}
                  />
                </Box>
              )}
            </Stack>

            {/* Right: India map */}
            <Box>
              <IndiaMap
                plants={plants}
                activePlantIds={PHASE_1_ACTIVE_PLANTS}
                hov={hov}
                sel={sel}
                onHover={setHov}
                onLeave={() => setHov(null)}
                onSelect={setSel}
              />
            </Box>
          </Box>
        )}
      </Box>
    </Box>
  );
}

export default LandingPage;
