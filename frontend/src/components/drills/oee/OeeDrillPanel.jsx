import { useMemo, useState } from "react";
import {
  Box,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  useTheme,
} from "@mui/material";
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
  granularity = "DAY",
  isLoading = false,
  trench = false,
}) {
  const [search, setSearch] = useState("");
  const [selectedCell, setSelectedCell] = useState(null);
  const [subCategory, setSubCategory] = useState(null);
  // dashboard_doc.md §6: Curing only — a trench (Tredge) tier sits ABOVE the
  // press table. OEE_s carries one row per Tredge (with trench-level
  // Availability_s / Performance_s / Quality_s). Selecting a Tredge scopes
  // the OEE_m press table to that sub_section. Non-Curing sections pass
  // trench=false and keep the flat overall→press→leaf flow unchanged.
  const [selectedTredge, setSelectedTredge] = useState(null);

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
        r.granularity === granularity &&
        (machine == null || r.machine === machine) &&
        typeof r.actual_value === "number" &&
        Number.isFinite(r.actual_value),
    );
    if (matching.length === 0) return null;
    return matching[0].actual_value;
  };

  // Like latestVal but pinned to a sub_section (Tredge) — used by the
  // Curing trench tier to read OEE_s / Availability_s / etc. per Tredge.
  const latestValSub = (kpiName, subSection) => {
    if (!Array.isArray(scopedRows)) return null;
    const m = scopedRows.filter(
      (r) =>
        r.section === sectionName &&
        r.kpi_name === kpiName &&
        r.granularity === granularity &&
        r.sub_section === subSection &&
        typeof r.actual_value === "number" &&
        Number.isFinite(r.actual_value),
    );
    return m.length ? m[0].actual_value : null;
  };

  // Curing trench rows (§6): one per Tredge from OEE_s, each carrying its
  // trench-level Availability_s / Performance_s / Quality_s.
  const tredges = useMemo(() => {
    if (!trench || !Array.isArray(scopedRows)) return [];
    const names = new Set(
      scopedRows
        .filter(
          (r) =>
            r.section === sectionName &&
            r.kpi_name === "OEE_s" &&
            r.granularity === granularity &&
            r.sub_section &&
            r.sub_section !== "nan",
        )
        .map((r) => r.sub_section),
    );
    return [...names]
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
      .map((t) => ({
        id: t,
        name: t,
        oee: latestValSub("OEE_s", t),
        availability: latestValSub("Availability_s", t),
        performance: latestValSub("Performance_s", t),
        quality: latestValSub("Quality_s", t),
      }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trench, scopedRows, sectionName, granularity]);

  const overall = useMemo(() => {
    // When a Tredge is selected (Curing §6), the tiles show that trench's
    // Availability_s / Performance_s / Quality_s; otherwise the section
    // overall (_o). This keeps the tiles consistent with the press table
    // below, which is scoped to the selected trench.
    if (trench && selectedTredge) {
      const a = latestValSub("Availability_s", selectedTredge);
      const p = latestValSub("Performance_s", selectedTredge);
      const q = latestValSub("Quality_s", selectedTredge);
      if (a == null && p == null && q == null) return null;
      return { availability: a ?? 0, performance: p ?? 0, quality: q ?? 0 };
    }
    const a = latestVal("Availability_o");
    const p = latestVal("Performance_o");
    const q = latestVal("Quality_o");
    if (a == null && p == null && q == null) return null;
    return { availability: a ?? 0, performance: p ?? 0, quality: q ?? 0 };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopedRows, sectionName, trench, selectedTredge]);

  const machines = useMemo(() => {
    if (!Array.isArray(scopedRows)) return [];
    const names = new Set(
      scopedRows
        .filter(
          (r) =>
            r.section === sectionName &&
            r.kpi_name === "OEE_m" &&
            r.granularity === granularity &&
            // Curing trench drill (§6): once a Tredge is picked, scope the
            // press table to that trench's sub_section.
            (!trench || selectedTredge == null || r.sub_section === selectedTredge) &&
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
  }, [scopedRows, sectionName, trench, selectedTredge]);

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
        r.granularity === granularity &&
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
  }, [selectedCell, subCategory, scopedRows, sectionName, granularity]);

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

  const showTrench = trench && tredges.length > 0;

  return (
    <Stack spacing={3}>
      {/* A/P/Q card row — sits as a secondary KPI band under the main grid.
          For Curing, reflects the selected trench (or section overall). */}
      <OverallTiles
        overall={overall}
        sectionName={
          showTrench && selectedTredge
            ? `${sectionName} · ${selectedTredge}`
            : sectionName
        }
        machineCount={machines.length}
      />

      {/* Curing trench tier (§6): Tredge list (OEE_s + A_s/P_s/Q_s). Click a
          Tredge to drill into its presses. */}
      {showTrench && (
        <TrenchTable
          tredges={tredges}
          selected={selectedTredge}
          onSelect={(t) => {
            setSelectedTredge((cur) => (cur === t ? null : t));
            setSelectedCell(null);
            setSubCategory(null);
          }}
        />
      )}

      {/* Machine-wise breakdown — for Curing, only after a Tredge is picked. */}
      {(!showTrench || selectedTredge) && (
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
      )}
    </Stack>
  );
}

/**
 * Curing trench tier (§6): one clickable row per Tredge, showing the
 * trench's OEE_s + Availability_s / Performance_s / Quality_s. Selecting a
 * Tredge drills into its presses (OEE_m) below.
 */
function TrenchTable({ tredges, selected, onSelect }) {
  const theme = useTheme();
  const fmtPct = (v) => (v == null ? "—" : `${v.toFixed(1)}%`);
  return (
    <Stack spacing={1.5}>
      <Typography
        sx={{
          fontSize: 13,
          fontWeight: 700,
          color: "primary.main",
          textTransform: "uppercase",
          letterSpacing: 0.5,
        }}
      >
        Trench-wise OEE — click to drill into presses
      </Typography>
      <TableContainer
        sx={{ border: 1, borderColor: "divider", borderRadius: 1.25 }}
      >
        <Table size="small">
          <TableHead>
            <TableRow>
              <TrenchTh align="left">Tredge</TrenchTh>
              <TrenchTh>OEE</TrenchTh>
              <TrenchTh>Availability</TrenchTh>
              <TrenchTh>Performance</TrenchTh>
              <TrenchTh>Quality</TrenchTh>
            </TableRow>
          </TableHead>
          <TableBody>
            {tredges.map((t) => {
              const isSel = selected === t.id;
              return (
                <TableRow
                  key={t.id}
                  hover
                  onClick={() => onSelect(t.id)}
                  sx={{
                    cursor: "pointer",
                    backgroundColor: isSel
                      ? `${theme.custom.brand.orange}1f`
                      : undefined,
                  }}
                >
                  <TableCell sx={{ fontSize: 13, fontWeight: 600 }}>
                    {t.name}
                  </TableCell>
                  <TableCell
                    align="center"
                    sx={{ fontSize: 13, fontWeight: 700 }}
                  >
                    {fmtPct(t.oee)}
                  </TableCell>
                  <TableCell align="center" sx={{ fontSize: 13 }}>
                    {fmtPct(t.availability)}
                  </TableCell>
                  <TableCell align="center" sx={{ fontSize: 13 }}>
                    {fmtPct(t.performance)}
                  </TableCell>
                  <TableCell align="center" sx={{ fontSize: 13 }}>
                    {fmtPct(t.quality)}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>
    </Stack>
  );
}

function TrenchTh({ children, align = "center" }) {
  return (
    <TableCell
      align={align}
      sx={{
        fontSize: 11,
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: 0.6,
        color: "text.disabled",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </TableCell>
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
