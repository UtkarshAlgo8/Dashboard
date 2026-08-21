import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Box, useTheme } from "@mui/material";
import LandingHeader from "@/components/landing/LandingHeader.jsx";
import LandingSkeleton from "@/components/landing/LandingSkeleton.jsx";
import PlantCardList from "@/components/landing/PlantCardList.jsx";
import IndiaMap from "@/components/landing/IndiaMap.jsx";
import PlantFunctionModal from "@/components/landing/PlantFunctionModal.jsx";
import { usePolledQuery } from "@/hooks/usePolledQuery.js";
import { getPlants, getFunctions } from "@/api/plants.js";

/**
 * Phase 1 active sets — per Q-NAV-01 only Banmore + Production are
 * interactive. Quality / Engineering / Plant Head / Technical all
 * render with the "SOON" pill in the modal (FR-L15 explicit
 * deferrals plus the Phase-1 Q-NAV-01 deferral for Quality and
 * Engineering).
 */
const PHASE_1_ACTIVE_PLANTS = new Set(["banmore", "chennai"]);
// Production and Quality are both navigable (Banmore only). Quality opens the
// Quality Head dashboard; the remaining functions stay "SOON".
const PHASE_1_NAVIGABLE_FUNCTIONS = new Set(["prod", "qual"]);
const PRODUCTION_ONLY_FUNCTIONS = new Set(["prod"]);

function LandingPage() {
  const navigate = useNavigate();
  const theme = useTheme();

  // CR-10: time-range state for the landing-page KPIs. The picker's
  // Today/Month pills + Filter Date dialog drive these three. OEE /
  // OTIF / Yield stay current-snapshot on the backend (no time
  // filter applied to them); Cured Tire Production and Scrap
  // Percentage are time-range aware.
  const [range, setRange] = useState("today");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const { data: plants, isLoading: plantsLoading } = usePolledQuery(
    () => getPlants({ range, from, to }),
    {
      // Re-fetch when the time range changes; otherwise no polling.
      interval: 0,
      deps: [range, from, to],
    },
  );
  const { data: functions } = usePolledQuery(getFunctions, { interval: 0 });

  const [hov, setHov] = useState(null);
  const [modalPlantId, setModalPlantId] = useState(null);

  const modalPlant =
    modalPlantId && Array.isArray(plants)
      ? (plants.find((p) => p.id === modalPlantId) ?? null)
      : null;

  // Functions that render in the "active" style in the modal. Phase 1
  // only ships Production; Quality / Engineering join in Phase 2.
  const modalActiveIds =
    modalPlant?.id === "banmore"
      ? PHASE_1_NAVIGABLE_FUNCTIONS
      : PRODUCTION_ONLY_FUNCTIONS;

  const openModalFor = (plantId) => {
    if (!PHASE_1_ACTIVE_PLANTS.has(plantId)) return;
    setModalPlantId(plantId);
  };

  const handleFunctionSelect = (fn) => {
    if (!modalPlant) return;
    if (fn.id === "prod" && PHASE_1_ACTIVE_PLANTS.has(modalPlant.id)) {
      navigate(`/${modalPlant.id}/production`);
    } else if (fn.id === "qual" && modalPlant.id === "banmore") {
      navigate("/banmore/quality");
    }
    // Inactive rows can't be clicked (PlantFunctionModal guards
    // onClick), so this handler only fires for the navigable case.
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
      <LandingHeader
        range={range}
        from={from}
        to={to}
        onRangeChange={setRange}
        onFromChange={setFrom}
        onToChange={setTo}
      />

      <Box sx={{ flex: 1, px: 3, py: 3 }}>
        {plantsLoading ||
        !Array.isArray(plants) ||
        !Array.isArray(functions) ? (
          <LandingSkeleton />
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

            <Box
              sx={{
                backgroundColor: "background.paper",
                border: 1,
                borderColor: "divider",
                borderRadius: 2,
                p: 2,
                boxShadow: theme.custom.shadow,
                // Clip the enlarged (zoomed) map to THIS panel so it fills
                // the panel but never spills out onto the page. The
                // zoomed-out 540 map fits inside, so this is invisible until
                // you zoom.
                overflow: "hidden",
              }}
            >
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
