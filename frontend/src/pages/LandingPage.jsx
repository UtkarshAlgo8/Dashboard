import { useCallback, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Box } from "@mui/material";
import LandingHeader from "@/components/landing/LandingHeader.jsx";
import LandingSkeleton from "@/components/landing/LandingSkeleton.jsx";
import PlantCardList from "@/components/landing/PlantCardList.jsx";
import SatelliteIndiaMap from "@/components/landing/SatelliteIndiaMap.jsx";
import PlantFunctionModal from "@/components/landing/PlantFunctionModal.jsx";
import { usePolledQuery } from "@/hooks/usePolledQuery.js";
import { monthKeyToRange } from "@/lib/timeRange.js";
import { getPlants, getFunctions } from "@/api/plants.js";
import {
  PHASE_1_ACTIVE_PLANTS,
  PHASE_1_NAVIGABLE_FUNCTIONS,
  PLANT_GEO,
  PRODUCTION_ONLY_FUNCTIONS,
  CTP_NAVIGABLE_FUNCTIONS,
} from "@/lib/landingConfig.js";

function LandingPage() {
  const navigate = useNavigate();

  // CR-10: time-range state for the landing-page KPIs. The picker's
  // Today/Month pills + Filter Date dialog drive these three. OEE /
  // OTIF / Yield stay current-snapshot on the backend (no time
  // filter applied to them); Cured Tire Production and Scrap
  // Percentage are time-range aware.
  const [range, setRange] = useState("today");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  // The month pinned from the picker's dropdown ("yyyy-MM"), or null for
  // "this month". Kept separately from from/to so the picker can light the
  // right pill; the fetch only ever sees the from/to it expands to.
  const [month, setMonth] = useState(null);

  const handleRangeChange = useCallback((value) => {
    if (typeof value === "object" && value !== null) {
      setRange(value.preset ?? "today");
      if ("from" in value) setFrom(value.from ?? "");
      if ("to" in value) setTo(value.to ?? "");
      // A pill click means the pinned month is over — the picker sends
      // month: null to say so.
      if ("month" in value) setMonth(value.month ?? null);
    } else {
      setRange(value ?? "today");
      setMonth(null);
    }
  }, []);

  // The dropdown was previously unwired here: TimeRangeSelect called an
  // undefined onMonthChange, so picking a past month did nothing at all and
  // the page stayed on the current one. /plants takes only range + from/to,
  // so the month key is expanded to its calendar window.
  const handleMonthChange = useCallback((monthKey) => {
    const window = monthKeyToRange(monthKey);
    if (!window) return;
    setRange("month");
    setMonth(monthKey);
    setFrom(window.from);
    setTo(window.to);
  }, []);

  const { data: rawPlants, isLoading: plantsLoading } = usePolledQuery(
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
  const leaveTimeoutRef = useRef(null);

  const handleHover = useCallback((plantId) => {
    if (leaveTimeoutRef.current) {
      clearTimeout(leaveTimeoutRef.current);
      leaveTimeoutRef.current = null;
    }
    setHov(plantId);
  }, []);

  const handleLeave = useCallback(() => {
    if (leaveTimeoutRef.current) clearTimeout(leaveTimeoutRef.current);
    leaveTimeoutRef.current = setTimeout(() => {
      setHov(null);
    }, 120);
  }, []);

  // Enrich raw plants with coordinates and display metadata
  const plants = Array.isArray(rawPlants)
    ? rawPlants.map((p) => ({
        ...p,
        lat: p.lat ?? PLANT_GEO[p.id]?.lat,
        lng: p.lng ?? PLANT_GEO[p.id]?.lng,
        badgeSide: p.badgeSide ?? PLANT_GEO[p.id]?.badgeSide ?? "right",
        code: p.code ?? PLANT_GEO[p.id]?.code ?? p.id.toUpperCase(),
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
      : modalPlant?.id === "chennai"
        ? CTP_NAVIGABLE_FUNCTIONS
        : PRODUCTION_ONLY_FUNCTIONS;

  const openModalFor = useCallback((plantId) => {
    if (!PHASE_1_ACTIVE_PLANTS.has(plantId)) return;
    setModalPlantId(plantId);
  }, []);

  const handleFunctionSelect = (fn) => {
    if (!modalPlant) return;
    if (fn.id === "prod" && PHASE_1_ACTIVE_PLANTS.has(modalPlant.id)) {
      navigate(`/${modalPlant.id}/production`);
    } else if (fn.id === "qual" && modalPlant.id === "banmore") {
      navigate("/banmore/quality");
    } else if (fn.id === "qual" && modalPlant.id === "chennai") {
      navigate("/chennai/quality");
    } else if (fn.id === "tech" && modalPlant.id === "banmore") {
      navigate("/banmore/technical");
    } else if (fn.id === "eng" && modalPlant.id === "banmore") {
      navigate("/banmore/engineering");
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
      <LandingHeader
        range={range}
        from={from}
        to={to}
        month={month}
        onRangeChange={handleRangeChange}
        onFromChange={setFrom}
        onToChange={setTo}
        onMonthChange={handleMonthChange}
      />

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

            {/* Right Side Floating Panel for Plant Cards */}
            <Box
              sx={{
                position: "relative",
                zIndex: 1,
                marginLeft: "auto",
                width: { xs: "100%", md: "560px", lg: "640px", xl: "720px" },
                height: "100%",
                overflowY: "auto",
                p: { xs: 2, md: 2.5, lg: 3 },
                display: "flex",
                flexDirection: "column",
                gap: 2,
                background: "transparent",
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
