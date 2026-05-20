import { useState } from "react";
import { Box, Stack, Typography, useTheme } from "@mui/material";
import KpiCard from "./KpiCard.jsx";
import CompoundSubSelector from "./CompoundSubSelector.jsx";
import { LoadingSkeleton, useToast } from "@/components/common";
import { usePolledQuery } from "@/hooks/usePolledQuery.js";
import { getKpis } from "@/api/kpis.js";
import OeeDrillPanel from "@/components/drills/oee/OeeDrillPanel.jsx";

/**
 * KPI grid for the current (section, tab) view. Polls every 60s
 * (Q-DATA-01). Owns the active drill state for the grid; drill
 * panel content is delegated to a spec-06+ child (placeholder for
 * spec 05).
 *
 * @param {object} props
 * @param {string} props.plantId
 * @param {string} props.section
 * @param {string} props.tab
 * @param {string} [props.compound] - "master" | "final" (Mixing only)
 * @param {(c: string) => void} [props.onCompoundChange] - required
 *   if Mixing+Productivity is showing.
 */
function KpiGrid({ plantId, section, tab, compound, onCompoundChange }) {
  const theme = useTheme();
  const toast = useToast();
  const [openDrillId, setOpenDrillId] = useState(null);

  const showCompound = section === "mix" && tab === "p";

  const { data: kpis, isLoading } = usePolledQuery(
    () => getKpis({ plantId, section, tab, compound }),
    {
      interval: 60_000,
      deps: [plantId, section, tab, compound],
    },
  );

  const handleDrillToggle = (id) => {
    setOpenDrillId((current) => (current === id ? null : id));
  };

  const handleTrendOpen = () => {
    toast.info("Trend modal arrives in spec 10.");
  };

  const openKpi =
    openDrillId && Array.isArray(kpis)
      ? (kpis.find((k) => k.id === openDrillId) ?? null)
      : null;

  return (
    <Box sx={{ p: 2, display: "flex", flexDirection: "column", gap: 2 }}>
      {showCompound && (
        <CompoundSubSelector value={compound} onChange={onCompoundChange} />
      )}

      {isLoading && !Array.isArray(kpis) ? (
        <Stack spacing={1.5}>
          <LoadingSkeleton variant="card" count={4} />
        </Stack>
      ) : !Array.isArray(kpis) || kpis.length === 0 ? (
        <Box sx={{ py: 4, textAlign: "center", color: "text.disabled" }}>
          <Typography sx={{ fontSize: 13 }}>
            No KPIs configured for this view yet — see specs 11 / 12.
          </Typography>
        </Box>
      ) : (
        <Box
          sx={{
            display: "grid",
            gap: 2,
            gridTemplateColumns: {
              xs: "1fr",
              sm: "repeat(2, 1fr)",
              md: "repeat(auto-fit, minmax(220px, 1fr))",
            },
          }}
        >
          {kpis.map((kpi) => (
            <KpiCard
              key={kpi.id}
              kpi={kpi}
              isOpen={openDrillId === kpi.id}
              onDrillToggle={handleDrillToggle}
              onTrendOpen={handleTrendOpen}
            />
          ))}
        </Box>
      )}

      {openKpi && openKpi.id === "oee" && (
        <Box
          sx={{
            backgroundColor: "background.paper",
            border: 1,
            borderColor: "divider",
            borderRadius: 1.25,
            p: 2,
          }}
        >
          <OeeDrillPanel plantId={plantId} section={section} />
        </Box>
      )}

      {openKpi && openKpi.id !== "oee" && (
        <Box
          sx={{
            backgroundColor: theme.custom.surface.soft,
            border: 1,
            borderColor: "divider",
            borderRadius: 1.25,
            p: 3,
            textAlign: "center",
          }}
        >
          <Typography sx={{ fontSize: 14, fontWeight: 600 }}>
            {openKpi.name} drill
          </Typography>
          <Typography sx={{ fontSize: 12, color: "text.disabled", mt: 0.5 }}>
            Arrives in spec 07 (Production) · 08 (Scrap Traceability) · 09
            (Downtime / Plan Compliance).
          </Typography>
        </Box>
      )}
    </Box>
  );
}

export default KpiGrid;
