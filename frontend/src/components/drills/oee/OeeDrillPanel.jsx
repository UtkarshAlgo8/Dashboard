import { useMemo, useState } from "react";
import { Box, Stack, Typography } from "@mui/material";
import OverallTiles from "./OverallTiles.jsx";
import MachineSearch from "./MachineSearch.jsx";
import MachineTable from "./MachineTable.jsx";

/**
 * OEE drill panel — derives its data straight from the gold_dummy rows
 * the dashboard fetch already returned (`rawRows`). No second API call.
 *
 * Per dashboard_kpi_map_reference §3 and §11:
 *   - Top tiles (overall A/P/Q) come from `Availability_o`,
 *     `Performance_o`, `Quality_o` rows for the active section,
 *     averaged over the selected date range (AVG of Daily rows).
 *   - Machine table comes from `Availability_m`, `Performance_m`,
 *     `Quality_m` rows for the section, grouped by machine and
 *     averaged. OEE_m = A_m × P_m × Q_m display-side per §9.2.
 *
 * Sub-cell click and scrap traceability are intentionally not wired in
 * this commit — once the section-level table works the drill-deeper
 * panels can be re-added against the same data path.
 */
function OeeDrillPanel({ section, rawRows }) {
  const [search, setSearch] = useState("");
  const [selectedCell, setSelectedCell] = useState(null);

  // Section name in gold_dummy values ("Mixing", "TBM", etc.) — the
  // panel may receive the UI id ("mix", "tbm") or the full name.
  const sectionName = useMemo(
    () =>
      ({ mix: "Mixing", tbm: "TBM", cur: "Curing", stk: "Stock" })[section] ??
      section,
    [section],
  );

  // Average Daily rows for one kpi_name (optionally machine-scoped).
  const avgDaily = (kpiName, machine) => {
    if (!Array.isArray(rawRows)) return null;
    const vals = rawRows
      .filter(
        (r) =>
          r.section === sectionName &&
          r.kpi_name === kpiName &&
          r.granularity === "Daily" &&
          (machine == null || r.machine === machine),
      )
      .map((r) => r.actual_value)
      .filter((v) => typeof v === "number" && Number.isFinite(v));
    if (vals.length === 0) return null;
    return vals.reduce((s, v) => s + v, 0) / vals.length;
  };

  const overall = useMemo(() => {
    const a = avgDaily("Availability_o");
    const p = avgDaily("Performance_o");
    const q = avgDaily("Quality_o");
    if (a == null && p == null && q == null) return null;
    return { availability: a ?? 0, performance: p ?? 0, quality: q ?? 0 };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawRows, sectionName]);

  const machines = useMemo(() => {
    if (!Array.isArray(rawRows)) return [];
    const names = new Set(
      rawRows
        .filter(
          (r) =>
            r.section === sectionName &&
            r.kpi_name === "OEE_m" &&
            r.granularity === "Daily" &&
            r.machine &&
            r.machine !== "nan",
        )
        .map((r) => r.machine),
    );
    return [...names]
      .sort()
      .map((name) => ({
        id: name,
        name,
        availability: avgDaily("Availability_m", name),
        performance: avgDaily("Performance_m", name),
        quality: avgDaily("Quality_m", name),
      }))
      .filter(
        (m) =>
          m.availability != null ||
          m.performance != null ||
          m.quality != null,
      );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawRows, sectionName]);

  const filteredMachines = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return machines;
    return machines.filter((m) => m.name.toLowerCase().includes(q));
  }, [machines, search]);

  const handleSelectCell = (machineId, component) => {
    setSelectedCell((current) =>
      current?.machineId === machineId && current?.component === component
        ? null
        : { machineId, component },
    );
  };

  if (!overall) {
    return (
      <Box sx={{ p: 3, textAlign: "center", color: "text.disabled" }}>
        <Typography sx={{ fontSize: 13 }}>
          No OEE drill data for {sectionName} in this date range.
        </Typography>
      </Box>
    );
  }

  return (
    <Stack spacing={2}>
      <OverallTiles overall={overall} />

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

      {machines.length === 0 ? (
        <Box
          sx={{
            p: 2,
            border: 1,
            borderColor: "divider",
            borderRadius: 1.25,
            textAlign: "center",
            color: "text.disabled",
          }}
        >
          <Typography sx={{ fontSize: 13 }}>
            Machine-level rows for {sectionName} weren&rsquo;t in this fetch
            (Lambda 5000-row cap). Pick a narrower date range to see them.
          </Typography>
        </Box>
      ) : (
        <MachineTable
          machines={filteredMachines.map((m) => ({
            id: m.id,
            name: m.name,
            availability: m.availability ?? 0,
            performance: m.performance ?? 0,
            quality: m.quality ?? 0,
          }))}
          selectedCell={selectedCell}
          onSelectCell={handleSelectCell}
        />
      )}
    </Stack>
  );
}

export default OeeDrillPanel;
