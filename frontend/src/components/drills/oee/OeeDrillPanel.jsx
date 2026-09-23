import { useMemo, useState, useRef } from "react";
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
import MachineTable from "./MachineTable.jsx";
import SubDrill from "./SubDrill.jsx";
import { thresholdTier } from "./thresholds.js";
import DrillSkeleton from "@/components/drills/shared/DrillSkeleton.jsx";
import { usePolledQuery } from "@/hooks/usePolledQuery.js";
import client from "@/api/client.js";
import { dateKey, snapshotLatest } from "@/lib/drillDate.js";
import { toDisplayDate } from "@/lib/dateFormat.js";
import { parseDrillAttribute } from "@/lib/kpi-transformer.js";
import { denanDimension, hasMachine } from "@/lib/dashboardRowScopes.js";
import CardDownloadButton from "@/components/CardDownloadButton.jsx";
import DrillCloseButton from "@/components/drills/shared/DrillCloseButton.jsx";

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
// Each A/P/Q machine component drills into its own set of OEE-loss reason
// leaves. The real gold data (realdata.md §19) stores those leaf kpi_names
// on the parent {component}_m row's drill_down_attribute — e.g.
// Availability_m → ["Breakdown", "No Schedule", "Operations/Material/
// Manpower", "Power Failure", "Preventive Maintenance", "Setup & Change"].
// We read them from the data rather than hardcode the (now-removed) dummy
// names Setup/Startup/ToolChange, which matched zero real rows and blanked
// every sub-category but Breakdown (realdata.md §9/§15).
const COMPONENT_PARENT_KPI = {
  availability: "Availability_m",
  performance: "Performance_m",
  quality: "Quality_m",
};
const OEE_CORE_KPIS = new Set([
  "OEE_o",
  "OEE_s",
  "OEE_m",
  "Availability_o",
  "Availability_s",
  "Availability_m",
  "Performance_o",
  "Performance_s",
  "Performance_m",
  "Quality_o",
  "Quality_s",
  "Quality_m",
]);

function OeeDrillPanel({
  section,
  // The sub-section the dashboard is scoped to. Stock is the only section
  // that records OEE per sub_section (OEE_s / OEE_m carry one; Mixing, TBM
  // and Curing leave it blank), so without this the Stock drill lists every
  // sub-section's machines regardless of which tab is active.
  subSection = null,
  rawRows,
  mode = "snapshot",
  granularity = "DAY",
  // new_change.md C3/C6: the CARD's resolved date. The drill inherits it and
  // never resolves its own — `rawRows` also carries Production rows that run
  // days ahead of OEE, so a bare "latest date" collapse would drop every OEE
  // row and render an empty drill.
  cardDate = null,
  isLoading = false,
  trench = false,
  // Window + plant for the date-wise leaf fetch below. Only used when the
  // panel is on MONTH, where the shared rows carry no per-date detail.
  plantId = "banmore",
  from = null,
  to = null,
  onClose,
}) {
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
  const scopedRows = useMemo(() => {
    const pinnedSub = subSection
      ? String(subSection).trim().toLowerCase()
      : null;
    const rows = (rawRows ?? []).filter((r) => {
      if (r?.section !== sectionName) return false;
      // A row that carries NO sub_section belongs to the section as a whole
      // (that is how every non-Stock section stores OEE) and is kept; only a
      // row explicitly tagged with a DIFFERENT sub-section is dropped.
      if (pinnedSub) {
        const rowSub = denanDimension(r.sub_section);
        if (rowSub && String(rowSub).trim().toLowerCase() !== pinnedSub) {
          return false;
        }
      }
      if (OEE_CORE_KPIS.has(r.kpi_name)) return true;
      return hasMachine(r);
    });
    if (cardDate) {
      // C3/C6: pinned to the card's day — no "latest date" resolution at all.
      const want = dateKey(cardDate);
      return rows.filter((r) => dateKey(r?.date) === want);
    }
    return snapshotLatest(rows, mode);
  }, [rawRows, sectionName, mode, cardDate, subSection]);

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

  // Like latestVal but pinned to a sub_section — used by the Curing trench
  // tier (per Tredge) and by the Stock tiles (per sub-section). The compare
  // is trimmed + case-insensitive so a tab label spelled differently from
  // the stored value still matches.
  const latestValSub = (kpiName, wantSub) => {
    if (!Array.isArray(scopedRows) || !wantSub) return null;
    const want = String(wantSub).trim().toLowerCase();
    const m = scopedRows.filter(
      (r) =>
        r.section === sectionName &&
        r.kpi_name === kpiName &&
        r.granularity === granularity &&
        String(r.sub_section ?? "")
          .trim()
          .toLowerCase() === want &&
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
    // Stock has no section-wide OEE_o worth showing here: its OEE lives on
    // the per-sub_section *_s rows, and the CARD reads OEE_s for the active
    // tab. Read the same rows so the tiles reconcile with the card instead
    // of showing the whole section's average. Falls back to the *_o family
    // for the sections that only store that.
    if (subSection) {
      const a = latestValSub("Availability_s", subSection);
      const p = latestValSub("Performance_s", subSection);
      const q = latestValSub("Quality_s", subSection);
      if (a != null || p != null || q != null) {
        return { availability: a ?? 0, performance: p ?? 0, quality: q ?? 0 };
      }
    }
    const a = latestVal("Availability_o");
    const p = latestVal("Performance_o");
    const q = latestVal("Quality_o");
    if (a == null && p == null && q == null) return null;
    return { availability: a ?? 0, performance: p ?? 0, quality: q ?? 0 };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopedRows, sectionName, trench, selectedTredge, subSection]);

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
            (!trench ||
              selectedTredge == null ||
              r.sub_section === selectedTredge) &&
            hasMachine(r),
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

  const handleSelectCell = (machineId, component) => {
    setSelectedCell((current) => {
      if (
        current?.machineId === machineId &&
        current?.component === component
      ) {
        setSubCategory(null);
        return null;
      }
      // Clear the pill; activeSubCategory (below) defaults it to the first
      // leaf once the leaf list resolves from drill_down_attribute.
      setSubCategory(null);
      return { machineId, component };
    });
  };

  // OEE-loss reason leaves for the selected (machine, component), read
  // VERBATIM from the parent {component}_m row's drill_down_attribute
  // (realdata.md §19). Each leaf is one pill; its kpi_name is both the id
  // and the display label ("Breakdown", "Setup & Change", …).
  const subLeaves = useMemo(() => {
    if (!selectedCell || !Array.isArray(scopedRows)) return [];
    const parentKpi = COMPONENT_PARENT_KPI[selectedCell.component];
    if (!parentKpi) return [];
    const parentRow = scopedRows.find(
      (r) =>
        r.section === sectionName &&
        r.kpi_name === parentKpi &&
        r.granularity === granularity &&
        r.machine === selectedCell.machineId,
    );
    const leaves = parseDrillAttribute(parentRow?.drill_down_attribute) ?? [];
    return leaves.map((name) => ({ id: name, name }));
  }, [selectedCell, scopedRows, sectionName, granularity]);

  // The effective pill: the user's pick when it still exists in the current
  // leaf set, otherwise the first leaf. Derived in render (no effect) so a
  // stale sub-category from a previous cell never leaks through.
  const activeSubCategory =
    subCategory && subLeaves.some((s) => s.id === subCategory)
      ? subCategory
      : (subLeaves[0]?.id ?? null);

  // Build SubDrill rows for the currently-selected (machine, component,
  // subCategory) tuple. Group rows by `remarks` (the reason text), count
  // events, sum minutes per spec §11.
  const subRows = useMemo(() => {
    if (!selectedCell || !activeSubCategory || !Array.isArray(scopedRows))
      return [];
    // The active pill IS the leaf kpi_name (e.g. "Breakdown", "Setup & Change").
    const leafKpi = activeSubCategory;
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
          traceable: /scrap/i.test(activeSubCategory),
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
  }, [selectedCell, activeSubCategory, scopedRows, sectionName, granularity]);

  // ---------- date-wise leaf rows ----------
  //
  // "By date" wants one row per DATE. Under a MONTH card the shared drill
  // rows cannot supply that: the month's leaves are stored one row per
  // REASON, all stamped the 1st of the month, so grouping them by date
  // collapses to a single bar. Fetch the DAY rows for just this
  // (machine, leaf, window) instead — ~28 rows — rather than putting the
  // whole ~3.4k-row DAY payload back on every drill open.
  //
  // On DAY / SHIFT the shared rows are already date-wise, so this stays off.
  const needsDayLeafRows =
    String(granularity).toUpperCase() === "MONTH" &&
    Boolean(selectedCell) &&
    Boolean(activeSubCategory) &&
    selectedCell?.component !== "quality" &&
    Boolean(from && to);

  const dayLeafPayload = needsDayLeafRows
    ? {
        plantId,
        context: {
          section: sectionName,
          category: "Productivity",
          granularity: "DAY",
        },
        from,
        to,
        drillKpis: [activeSubCategory],
        parentFilters: { machine: selectedCell.machineId },
        drillOnly: true,
        limit: 2000,
      }
    : null;

  const { data: dayLeafData } = usePolledQuery(
    () =>
      dayLeafPayload
        ? client
            .post("/dashboard/kpi-data", dayLeafPayload)
            .then((r) => r.data ?? r)
        : Promise.resolve(null),
    {
      enabled: Boolean(dayLeafPayload),
      interval: 0,
      keepPreviousData: false,
      deps: [JSON.stringify(dayLeafPayload)],
    },
  );

  // Timestamp-wise view of the SAME availability/performance leaves: one row
  // per dated record (the data is day-level, so the timestamp is the date),
  // sorted chronologically. Quality leaves keep only the item-code view.
  const subRowsByDate = useMemo(() => {
    if (!selectedCell || !activeSubCategory) return [];
    if (selectedCell.component === "quality") return [];
    const leafKpi = activeSubCategory;
    // Athena returns measures as strings on this direct call (the shared
    // fetch coerces them at its own boundary), so normalise here.
    const coerce = (v) =>
      typeof v === "number" ? v : Number.parseFloat(v ?? "");
    const source = needsDayLeafRows
      ? (dayLeafData ?? []).map((r) => ({
          ...r,
          actual_value: coerce(r.actual_value),
        }))
      : (scopedRows ?? []);
    const wantGran = needsDayLeafRows ? "DAY" : granularity;
    const matching = source.filter(
      (r) =>
        r.section === sectionName &&
        r.kpi_name === leafKpi &&
        r.granularity === wantGran &&
        r.machine === selectedCell.machineId,
    );
    return matching
      .filter((r) => typeof r.actual_value === "number" && r.actual_value > 0)
      .map((r) => {
        const reason = r.remarks && r.remarks !== "nan" ? r.remarks : "Other";
        const k = dateKey(r.date);
        const date =
          toDisplayDate(
            k ? `${k.slice(0, 4)}-${k.slice(4, 6)}-${k.slice(6, 8)}` : r.date,
          ) ?? "—";
        return {
          date,
          sortKey: k ?? "",
          reason,
          reasonCategory: deriveCategory(reason),
          durationMin: Math.round(r.actual_value),
        };
      })
      .sort((a, b) =>
        a.sortKey > b.sortKey ? 1 : a.sortKey < b.sortKey ? -1 : 0,
      );
  }, [
    selectedCell,
    activeSubCategory,
    scopedRows,
    sectionName,
    granularity,
    needsDayLeafRows,
    dayLeafData,
  ]);

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

  const cardRef = useRef(null);
  const machineExcelRows = useMemo(
    () =>
      machines.map((m) => ({
        Machine: m.name,
        Availability:
          m.availability != null ? Number(m.availability.toFixed(2)) : "",
        Performance:
          m.performance != null ? Number(m.performance.toFixed(2)) : "",
        Quality: m.quality != null ? Number(m.quality.toFixed(2)) : "",
        OEE:
          m.availability != null && m.performance != null && m.quality != null
            ? Number(
                (
                  (m.availability / 100) *
                  (m.performance / 100) *
                  (m.quality / 100) *
                  100
                ).toFixed(2),
              )
            : "",
      })),
    [machines],
  );

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
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        spacing={1}
      >
        <Typography
          sx={{
            fontSize: 15,
            fontWeight: 700,
            color: "primary.main",
            textTransform: "uppercase",
            letterSpacing: 0.6,
          }}
        >
          {sectionName} OEE
        </Typography>
        <Stack direction="row" alignItems="center" spacing={1}>
          <CardDownloadButton
            cardRef={cardRef}
            rows={machineExcelRows}
            headers={[
              "Machine",
              "Availability",
              "Performance",
              "Quality",
              "OEE",
            ]}
            filename={`drill-oee-${sectionName.toLowerCase().replace(/\s+/g, "-")}`}
            sheetName="OEE"
          />
          <DrillCloseButton onClose={onClose} />
        </Stack>
      </Stack>
      <Box ref={cardRef}>
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
          <Stack spacing={1.5} sx={{ mt: 2 }}>
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
                    Machine-level rows for {sectionName} are not available for
                    this selection.
                  </Typography>
                </Box>
              )
            ) : (
              <>
                <MachineTable
                  machines={machines.map((m) => ({
                    id: m.id,
                    name: m.name,
                    availability: m.availability ?? 0,
                    performance: m.performance ?? 0,
                    quality: m.quality ?? 0,
                  }))}
                  selectedCell={selectedCell}
                  onSelectCell={handleSelectCell}
                />
                {selectedMachine && selectedCell && activeSubCategory && (
                  <SubDrill
                    machine={selectedMachine}
                    component={selectedCell.component}
                    subCategory={activeSubCategory}
                    subCategories={subLeaves}
                    onSelectSubCategory={setSubCategory}
                    rows={subRows}
                    rowsByDate={subRowsByDate}
                    accentTier={selectedTier}
                  />
                )}
              </>
            )}
          </Stack>
        )}
      </Box>
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
        <Table
          size="small"
          sx={(t) => ({
            "& .MuiTableCell-root": {
              borderBottom: "1px solid",
              borderRight: "1px solid",
              borderColor: t.palette.divider,
              "&:last-child": {
                borderRight: "none",
              },
            },
            "& thead .MuiTableCell-root": {
              backgroundColor:
                t.custom?.table?.headerBg ?? t.custom?.surface?.soft,
              borderBottom: "2px solid",
              borderColor: t.palette.divider,
            },
          })}
        >
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
            {tredges.map((t, i) => {
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
                      : (th) =>
                          i % 2 === 0
                            ? "background.paper"
                            : (th.custom?.table?.alternateRow ??
                              "rgba(0, 119, 182, 0.04)"),
                    "&:hover": {
                      backgroundColor: isSel
                        ? `${theme.custom.brand.orange}2f`
                        : (th) => th.palette.action.hover,
                    },
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
        color: "text.primary",
        backgroundColor: (t) =>
          t.custom?.table?.headerBg ?? t.custom?.surface?.soft,
        borderBottom: 2,
        borderRight: 1,
        borderColor: "divider",
        "&:last-child": {
          borderRight: "none",
        },
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
