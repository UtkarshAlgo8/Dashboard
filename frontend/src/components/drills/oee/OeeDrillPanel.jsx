import { useMemo, useState } from "react";
import { Box, Stack, Typography } from "@mui/material";
import OverallTiles from "./OverallTiles.jsx";
import MachineSearch from "./MachineSearch.jsx";
import MachineTable from "./MachineTable.jsx";
import SubDrill from "./SubDrill.jsx";
import { thresholdTier } from "./thresholds.js";
import DrillSkeleton from "@/components/drills/shared/DrillSkeleton.jsx";
import { snapshotLatest } from "@/lib/drillDate.js";

/**
 * OEE drill panel — derives its data straight from the gold rows the
 * dashboard fetch already returned (`rawRows`). No second API call.
 *
 * Per journey.md §7.1, §15.5 and dashboard_kpi_map_reference §3/§11:
 *   - OEE is a MACHINE event — NOT product-scoped (§15.5). The drill
 *     ignores the active product pill entirely and pins section only.
 *   - Values are read VERBATIM from the stored row for the snapshot day
 *     (§7.1: "read VERBATIM… NEVER average daily OEE values"). We do NOT
 *     average a week of Daily rows — snapshotLatest() collapses to the
 *     latest available date so the tiles/table reconcile with the card.
 *   - Top tiles (overall A/P/Q) come from `Availability_o` /
 *     `Performance_o` / `Quality_o`; the machine table from
 *     `Availability_m` / `Performance_m` / `Quality_m`. OEE_m =
 *     A_m × P_m × Q_m display-side per §9.2.
 */
// Sub-category leaf kpi_names per spec §3 — for each (machine, A/P/Q
// component), the row click drills into one of these gold_dummy kpis.
const SUB_KPI_NAMES = {
  availability: {
    breakdown: "Breakdown",
    setupAdjustment: "Setup",
    startup: "Startup",
    toolChange: "ToolChange",
  },
  performance: {
    minorStoppage: "MinorStoppage",
    reducedSpeed: "ReducedSpeed",
  },
  quality: {
    defect: "Defect",
    scrap: "Scrap",
  },
};

const FIRST_SUB = {
  availability: "breakdown",
  performance: "minorStoppage",
  quality: "defect",
};

function OeeDrillPanel({
  section,
  rawRows,
  mode = "snapshot",
  isLoading = false,
}) {
  const [search, setSearch] = useState("");
  const [selectedCell, setSelectedCell] = useState(null);
  const [subCategory, setSubCategory] = useState(null);

  // Section name in gold values ("Mixing", "TBM", etc.) — the panel may
  // receive the UI id ("mix", "tbm") or the full name.
  const sectionName = useMemo(
    () =>
      ({ mix: "Mixing", tbm: "TBM", cur: "Curing", stk: "Stock" })[section] ??
      section,
    [section],
  );

  // OEE is machine-scoped only (§15.5): use the rows as-is, no product
  // filtering. Collapse to the latest available date in snapshot mode so
  // the drill reconciles with the card and we never average a week.
  const scopedRows = useMemo(
    () => snapshotLatest(rawRows ?? [], mode),
    [rawRows, mode],
  );

  // Read the stored value for one kpi_name VERBATIM (optionally
  // machine-scoped). scopedRows is already collapsed to the snapshot day,
  // so there is one stored row per (kpi, machine) — take it as-is and
  // never average. In aggregate mode (custom range) more than one day may
  // be present; we still read the latest matching row, never a mean of
  // percentages (§7.1).
  const latestVal = (kpiName, machine) => {
    if (!Array.isArray(scopedRows)) return null;
    const matching = scopedRows.filter(
      (r) =>
        r.section === sectionName &&
        r.kpi_name === kpiName &&
        r.granularity === "Daily" &&
        (machine == null || r.machine === machine) &&
        typeof r.actual_value === "number" &&
        Number.isFinite(r.actual_value),
    );
    if (matching.length === 0) return null;
    return matching[0].actual_value;
  };

  const overall = useMemo(() => {
    const a = latestVal("Availability_o");
    const p = latestVal("Performance_o");
    const q = latestVal("Quality_o");
    if (a == null && p == null && q == null) return null;
    return { availability: a ?? 0, performance: p ?? 0, quality: q ?? 0 };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopedRows, sectionName]);

  const machines = useMemo(() => {
    if (!Array.isArray(scopedRows)) return [];
    const names = new Set(
      scopedRows
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
        availability: latestVal("Availability_m", name),
        performance: latestVal("Performance_m", name),
        quality: latestVal("Quality_m", name),
      }))
      .filter(
        (m) =>
          m.availability != null || m.performance != null || m.quality != null,
      );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopedRows, sectionName]);

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
        setSubCategory(null);
        return null;
      }
      setSubCategory(FIRST_SUB[component]);
      return { machineId, component };
    });
  };

  // Build SubDrill rows for the currently-selected (machine, component,
  // subCategory) tuple. Group Daily rows by `remarks` (the reason text),
  // count events, sum minutes per spec §11.
  const subRows = useMemo(() => {
    if (!selectedCell || !subCategory || !Array.isArray(scopedRows)) return [];
    const leafKpi = SUB_KPI_NAMES[selectedCell.component]?.[subCategory];
    if (!leafKpi) return [];
    const matching = scopedRows.filter(
      (r) =>
        r.section === sectionName &&
        r.kpi_name === leafKpi &&
        r.granularity === "Daily" &&
        r.machine === selectedCell.machineId,
    );
    if (matching.length === 0) return [];
    // Quality / defect & scrap use itemcode rather than remarks.
    if (selectedCell.component === "quality") {
      const byItem = new Map();
      for (const r of matching) {
        const key = r.itemcode && r.itemcode !== "nan" ? r.itemcode : "—";
        const cur = byItem.get(key) ?? {
          itemCode: key,
          defectType: r.remarks && r.remarks !== "nan" ? r.remarks : "—",
          qty: 0,
          totalProduced: 0,
          traceable: subCategory === "scrap",
        };
        if (typeof r.actual_value === "number") cur.qty += r.actual_value;
        if (typeof r.threshold_value === "number")
          cur.totalProduced += r.threshold_value;
        byItem.set(key, cur);
      }
      return [...byItem.values()]
        .filter((r) => r.qty > 0)
        .sort((a, b) => b.qty - a.qty)
        .map((r) => ({
          ...r,
          qty: Math.round(r.qty),
          totalProduced: Math.round(r.totalProduced) || 1,
        }));
    }
    // Availability / Performance leaves — group by reason text.
    const byReason = new Map();
    for (const r of matching) {
      const reason = r.remarks && r.remarks !== "nan" ? r.remarks : "Other";
      const cur = byReason.get(reason) ?? {
        reason,
        reasonCategory: deriveCategory(reason),
        events: 0,
        durationMin: 0,
      };
      cur.events += 1;
      if (typeof r.actual_value === "number") cur.durationMin += r.actual_value;
      byReason.set(reason, cur);
    }
    return [...byReason.values()]
      .filter((r) => r.durationMin > 0)
      .sort((a, b) => b.durationMin - a.durationMin)
      .map((r) => ({ ...r, durationMin: Math.round(r.durationMin) }));
  }, [selectedCell, subCategory, scopedRows, sectionName]);

  const selectedMachine = selectedCell
    ? { id: selectedCell.machineId, name: selectedCell.machineId }
    : null;

  // Status tier (green/amber/red) of the selected cell's value, so the
  // SubDrill accent matches the highlighted cell's colour.
  const selectedTier = useMemo(() => {
    if (!selectedCell) return null;
    const m = machines.find((x) => x.id === selectedCell.machineId);
    if (!m) return null;
    return thresholdTier(
      selectedCell.component,
      m[selectedCell.component] ?? 0,
    );
  }, [selectedCell, machines]);

  if (!overall) {
    // While the drill fetch is in flight, show a skeleton instead of the
    // empty-state message — otherwise the user reads "no data" for the
    // 2–5s it takes the upstream Lambda to respond.
    if (isLoading) {
      return (
        <Stack spacing={3}>
          <DrillSkeleton title rows={1} cols={3} />
          <DrillSkeleton title rows={5} cols={5} />
        </Stack>
      );
    }
    return (
      <Box sx={{ p: 3, textAlign: "center", color: "text.disabled" }}>
        <Typography sx={{ fontSize: 13 }}>
          No OEE drill data for {sectionName} in this date range.
        </Typography>
      </Box>
    );
  }

  return (
    <Stack spacing={3}>
      {/* A/P/Q card row — sits as a secondary KPI band under the main grid. */}
      <OverallTiles
        overall={overall}
        sectionName={sectionName}
        machineCount={machines.length}
      />

      {/* Machine-wise breakdown — its own labelled section. */}
      <Stack spacing={1.5}>
        <Stack
          direction="row"
          alignItems="center"
          justifyContent="space-between"
          spacing={1}
        >
          <Typography
            sx={{
              fontSize: 13,
              fontWeight: 700,
              color: "primary.main",
              textTransform: "uppercase",
              letterSpacing: 0.5,
            }}
          >
            Machine-wise breakdown
          </Typography>
          {machines.length > 0 && (
            <MachineSearch value={search} onChange={setSearch} />
          )}
        </Stack>

        {machines.length === 0 ? (
          isLoading ? (
            <DrillSkeleton title={false} rows={5} cols={5} />
          ) : (
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
          )
        ) : (
          <>
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
            {selectedMachine && selectedCell && subCategory && (
              <SubDrill
                machine={selectedMachine}
                component={selectedCell.component}
                subCategory={subCategory}
                onSelectSubCategory={setSubCategory}
                rows={subRows}
                accentTier={selectedTier}
              />
            )}
          </>
        )}
      </Stack>
    </Stack>
  );
}

// Best-effort grouping of an availability reason into a high-level
// category for the spec §11 "Category | Reason | Events | Duration"
// breakdown panel. The dataset doesn't store a category column, so we
// infer from common keywords.
function deriveCategory(reason) {
  const r = (reason ?? "").toLowerCase();
  if (/elec|motor|drive|sensor|plc|circuit|wir|relay|trip/.test(r)) {
    return "Electrical";
  }
  if (/mech|bear|shaft|seal|leak|cyl|valve|pump|coupling/.test(r)) {
    return "Mechanical";
  }
  if (/hyd/.test(r)) return "Hydraulic";
  if (/pneum/.test(r)) return "Pneumatic";
  if (/process|recipe|spec|qa/.test(r)) return "Process";
  return "Other";
}

export default OeeDrillPanel;
