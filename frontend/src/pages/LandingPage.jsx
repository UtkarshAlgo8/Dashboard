import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Box, useTheme } from "@mui/material";
import LandingHeader from "@/components/landing/LandingHeader.jsx";
import LandingSkeleton from "@/components/landing/LandingSkeleton.jsx";
import PlantCardList from "@/components/landing/PlantCardList.jsx";
import SatelliteIndiaMap from "@/components/landing/SatelliteIndiaMap.jsx";
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

const PLANT_GEO = {
  banmore: {
    code: "BTP",
    lat: 26.392750216401705,
    lng: 78.072224113494,
    prodToday: "18,240 Tyres Today",
    revenue: "₹ 6,38,00,000",
    change: "- 2.1%",
    isPositive: false,
    pqr: 94.8,
  },
  chennai: {
    code: "CTP",
    lat: 12.938622726364054,
    lng: 80.00271264232934,
    prodToday: "23,455 Tyres Today",
    revenue: "₹ 8,21,00,000",
    change: "+ 5.6%",
    isPositive: true,
    pqr: 96.2,
  },
  laksar: {
    code: "LTP",
    lat: 29.7428,
    lng: 78.0264,
    prodToday: "20,112 Tyres Today",
    revenue: "₹ 7,04,00,000",
    change: "+ 3.4%",
    isPositive: true,
    pqr: 95.4,
  },
  mysore: {
    code: "RTP",
    lat: 12.3556,
    lng: 76.6026,
    prodToday: "19,506 Tyres Today",
    revenue: "₹ 6,83,00,000",
    change: "- 1.8%",
    isPositive: false,
    pqr: 95.0,
  },
};

function LandingPage() {
  const navigate = useNavigate();
  const theme = useTheme();

  const { data: rawPlants, isLoading: plantsLoading } = usePolledQuery(getPlants, {
    interval: 0,
  });
  const { data: functions } = usePolledQuery(getFunctions, { interval: 0 });

  const [hov, setHov] = useState(null);
  const [modalPlantId, setModalPlantId] = useState(null);
  const leaveTimeoutRef = useRef(null);

  const handleHover = (plantId) => {
    if (leaveTimeoutRef.current) {
      clearTimeout(leaveTimeoutRef.current);
      leaveTimeoutRef.current = null;
    }
    setHov(plantId);
  };

  const handleLeave = () => {
    if (leaveTimeoutRef.current) clearTimeout(leaveTimeoutRef.current);
    leaveTimeoutRef.current = setTimeout(() => {
      setHov(null);
    }, 120);
  };

  // Enrich raw plants with coordinates and display metadata
  const plants = Array.isArray(rawPlants)
    ? rawPlants.map((p) => ({
        ...p,
        lat: p.lat ?? PLANT_GEO[p.id]?.lat,
        lng: p.lng ?? PLANT_GEO[p.id]?.lng,
        code: p.code ?? PLANT_GEO[p.id]?.code ?? p.id.toUpperCase(),
        prodToday: p.prodToday ?? PLANT_GEO[p.id]?.prodToday ?? "20,000 Tyres Today",
        revenue: p.revenue ?? PLANT_GEO[p.id]?.revenue ?? "₹ 7,00,00,000",
        change: p.change ?? PLANT_GEO[p.id]?.change ?? "+ 2.5%",
        isPositive: p.isPositive ?? PLANT_GEO[p.id]?.isPositive ?? true,
        pqr: p.pqr ?? PLANT_GEO[p.id]?.pqr ?? 95.0,
      }))
    : null;

  const modalPlant =
    modalPlantId && Array.isArray(plants)
      ? (plants.find((p) => p.id === modalPlantId) ?? null)
      : null;

  // Functions that render in the "active" style in the modal.
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
  };

  return (
    <Box
      sx={{
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        backgroundColor: "#0B132B",
      }}
    >
      <LandingHeader />

      <Box
        sx={{
          flex: 1,
          position: "relative",
          display: "flex",
          overflow: "hidden",
        }}
      >
        {plantsLoading ||
        !Array.isArray(plants) ||
        !Array.isArray(functions) ? (
          <LandingSkeleton />
        ) : (
          <>
            {/* Map Container (fills viewport / left section) */}
            <Box
              sx={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                zIndex: 0,
              }}
            >
              <SatelliteIndiaMap
                plants={plants}
                activePlantIds={PHASE_1_ACTIVE_PLANTS}
                hov={hov}
                sel={modalPlantId}
                onHover={handleHover}
                onLeave={handleLeave}
                onSelect={openModalFor}
              />
            </Box>

            {/* Right Side Floating Glass Panel for Plant Cards */}
            <Box
              sx={{
                position: "relative",
                zIndex: 1,
                marginLeft: "auto",
                width: { xs: "100%", md: "520px", lg: "580px" },
                height: "100%",
                overflowY: "auto",
                p: { xs: 2, md: 3 },
                display: "flex",
                flexDirection: "column",
                gap: 2,
                /* Smooth gradient mask to blend with satellite map on large screens */
                background: {
                  xs: "rgba(11, 19, 43, 0.85)",
                  md: "linear-gradient(to right, rgba(11, 19, 43, 0) 0%, rgba(11, 19, 43, 0.35) 15%, rgba(11, 19, 43, 0.72) 100%)",
                },
                backdropFilter: "blur(4px)",
                "&::-webkit-scrollbar": {
                  width: "6px",
                },
                "&::-webkit-scrollbar-thumb": {
                  backgroundColor: "rgba(255,255,255,0.2)",
                  borderRadius: "4px",
                },
              }}
            >
              <PlantCardList
                plants={plants}
                activePlantIds={PHASE_1_ACTIVE_PLANTS}
                hov={hov}
                sel={modalPlantId}
                onHover={handleHover}
                onLeave={handleLeave}
                onSelect={openModalFor}
              />
            </Box>
          </>
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

