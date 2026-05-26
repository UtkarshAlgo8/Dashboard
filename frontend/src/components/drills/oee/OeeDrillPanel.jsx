import { useMemo, useState } from "react";
import { Box, Stack, Typography } from "@mui/material";
import OverallTiles from "./OverallTiles.jsx";
import MachineSearch from "./MachineSearch.jsx";
import MachineTable from "./MachineTable.jsx";
import SubDrill from "./SubDrill.jsx";
import ScrapTraceabilityPanel from "./ScrapTraceabilityPanel.jsx";
import { useToast } from "@/components/common";
import { OeeDrillSkeleton } from "@/components/drills/DrillSkeletons.jsx";
import { usePolledQuery } from "@/hooks/usePolledQuery.js";
import { getOeeDrill } from "@/api/drills.js";

/**
 * Composes the OEE drill: overall tiles → machine search → machine
 * table → sub-drill panel (when a cell is selected) → scrap
 * traceability panel (when a traceable scrap row is clicked).
 *
 * Phase 1 ships Banmore + Mixing data. Spec 11 widens to TBM /
 * Curing / Stock.
 */
function OeeDrillPanel({ plantId, section, from, to, shift }) {
  const toast = useToast();
  const [search, setSearch] = useState("");
  const [selectedCell, setSelectedCell] = useState(null); // { machineId, component } | null
  const [subCategory, setSubCategory] = useState(null);
  const [traceItemCode, setTraceItemCode] = useState(null);

  const { data, isLoading, error } = usePolledQuery(
    () => getOeeDrill({ plantId, section, from, to, shift }),
    { interval: 60_000, deps: [plantId, section, from, to, shift] },
  );

  if (error) {
    toast.error("Could not load OEE drill.");
  }

  const machines = data?.machines ?? [];

  const filteredMachines = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return machines;
    return machines.filter((m) => m.name.toLowerCase().includes(q));
  }, [machines, search]);

  const handleSelectCell = (machineId, component) => {
    setSelectedCell((current) => {
      if (
        current?.machineId === machineId &&
        current?.component === component
      ) {
        // Same cell → deselect (FR-P36)
        setSubCategory(null);
        setTraceItemCode(null);
        return null;
      }
      // Switching → reset sub-category + traceability
      setSubCategory(null);
      setTraceItemCode(null);
      return { machineId, component };
    });
  };

  const handleSelectSubCategory = (next) => {
    setSubCategory(next);
    setTraceItemCode(null); // changing sub-category resets traceability
  };

  const handleTraceRowClick = (itemCode) => {
    setTraceItemCode((current) => (current === itemCode ? null : itemCode));
  };

  const selectedMachine = selectedCell
    ? (machines.find((m) => m.id === selectedCell.machineId) ?? null)
    : null;

  const rowsKey =
    selectedCell && subCategory
      ? `${selectedCell.machineId}/${selectedCell.component}/${subCategory}`
      : null;
  const rows = rowsKey ? (data?.subDrill?.[rowsKey] ?? []) : null;

  if (isLoading && !data) {
    return <OeeDrillSkeleton />;
  }

  if (!data || !data.overall || machines.length === 0) {
    return (
      <Box sx={{ p: 3, textAlign: "center", color: "text.disabled" }}>
        <Typography sx={{ fontSize: 13 }}>
          OEE drill not yet wired for this section — see spec 11.
        </Typography>
      </Box>
    );
  }

  return (
    <Stack spacing={2}>
      <OverallTiles overall={data.overall} />

      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        spacing={1}
      >
        <Typography sx={{ fontSize: 13, fontWeight: 600 }}>
          Machine-wise breakdown
        </Typography>
        <MachineSearch value={search} onChange={setSearch} />
      </Stack>

      <MachineTable
        machines={filteredMachines}
        selectedCell={selectedCell}
        onSelectCell={handleSelectCell}
      />

      {selectedMachine && selectedCell && (
        <>
          <SubDrill
            machine={selectedMachine}
            component={selectedCell.component}
            subCategory={subCategory}
            onSelectSubCategory={handleSelectSubCategory}
            rows={rows}
            activeTraceItemCode={traceItemCode}
            onTraceRowClick={handleTraceRowClick}
          />

          {traceItemCode && (
            <ScrapTraceabilityPanel
              plantId={plantId}
              section={section}
              machine={selectedMachine}
              itemCode={traceItemCode}
            />
          )}
        </>
      )}
    </Stack>
  );
}

export default OeeDrillPanel;
