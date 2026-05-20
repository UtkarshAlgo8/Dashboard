import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Box, CircularProgress, Stack } from "@mui/material";
import LandingHeader from "@/components/landing/LandingHeader.jsx";
import PlantCardList from "@/components/landing/PlantCardList.jsx";
import IndiaMap from "@/components/landing/IndiaMap.jsx";
import PlantFunctionModal from "@/components/landing/PlantFunctionModal.jsx";
import { useToast } from "@/components/common";
import { usePolledQuery } from "@/hooks/usePolledQuery.js";
import { getPlants, getFunctions } from "@/api/plants.js";

/**
 * Phase 1 active sets — per Q-NAV-01 only Banmore and Production are
 * the navigable path. The function modal mirrors the design: every
 * data-active function (Production, Quality, Engineering) renders
 * in the active style; Plant Head + Technical render "SOON" per
 * BRD FR-L15. Clicks on Quality / Engineering toast a "Phase 2"
 * notice instead of navigating.
 */
const PHASE_1_ACTIVE_PLANTS = new Set(["banmore"]);
const PHASE_1_NAVIGABLE_FUNCTIONS = new Set(["prod"]);

function LandingPage() {
  const navigate = useNavigate();
  const toast = useToast();

  const { data: plants, isLoading: plantsLoading } = usePolledQuery(getPlants, {
    interval: 0,
  });
  const { data: functions } = usePolledQuery(getFunctions, { interval: 0 });

  const [hov, setHov] = useState(null);
  const [modalPlantId, setModalPlantId] = useState(null);

  const modalPlant =
    modalPlantId && Array.isArray(plants)
      ? (plants.find((p) => p.id === modalPlantId) ?? null)
      : null;

  // Functions that render in the "active" style in the modal — the
  // data-active set from the API. Phase 1 only navigates on
  // Production.
  const modalActiveIds = new Set(
    Array.isArray(functions)
      ? functions.filter((f) => f.active).map((f) => f.id)
      : [],
  );

  const openModalFor = (plantId) => {
    if (!PHASE_1_ACTIVE_PLANTS.has(plantId)) return;
    setModalPlantId(plantId);
  };

  const handleFunctionSelect = (fn) => {
    if (!modalPlant) return;
    if (
      fn.id === "prod" &&
      modalPlant.id === "banmore" &&
      PHASE_1_NAVIGABLE_FUNCTIONS.has(fn.id)
    ) {
      navigate("/banmore/production");
      return;
    }
    toast.info(`${fn.name} on ${modalPlant.name} arrives in Phase 2.`);
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
        {plantsLoading ||
        !Array.isArray(plants) ||
        !Array.isArray(functions) ? (
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
            <PlantCardList
              plants={plants}
              activePlantIds={PHASE_1_ACTIVE_PLANTS}
              hov={hov}
              sel={modalPlantId}
              onHover={setHov}
              onLeave={() => setHov(null)}
              onSelect={openModalFor}
            />

            <Box>
              <IndiaMap
                plants={plants}
                activePlantIds={PHASE_1_ACTIVE_PLANTS}
                hov={hov}
                sel={modalPlantId}
                onHover={setHov}
                onLeave={() => setHov(null)}
                onSelect={openModalFor}
              />
            </Box>
          </Box>
        )}
      </Box>

      <PlantFunctionModal
        open={Boolean(modalPlant)}
        onClose={() => setModalPlantId(null)}
        plant={modalPlant}
        functions={Array.isArray(functions) ? functions : []}
        activeFunctionIds={modalActiveIds}
        onSelectFunction={handleFunctionSelect}
      />
    </Box>
  );
}

export default LandingPage;
