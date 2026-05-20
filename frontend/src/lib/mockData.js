/**
 * Deterministic mock data for Phase 1.
 *
 * Source of truth for data structure is docs/artifact.jsx. Edits to
 * shape (new fields, renames) should be made here AND in the relevant
 * resource module under src/api/, never in components.
 *
 * Phase 1 data path is selected via VITE_USE_MOCK_DATA in .env. See
 * docs/architecture.md#data-flow.
 *
 * This file grows incrementally: each spec adds the data it needs.
 * Current contents = spec 02 (landing-page support).
 */

/**
 * Four plants. `sx`/`sy` are the SVG coordinates used by the India
 * map marker positioning in the Landing page (spec 03).
 */
export const PLANTS = [
  {
    id: "chennai",
    name: "Chennai Plant",
    sub: "Tamil Nadu",
    sx: 202.0,
    sy: 446.6,
    oe: 94.2,
    otif: 96.8,
    yield: 98.5,
  },
  {
    id: "banmore",
    name: "Banmore Plant",
    sub: "Gwalior, Madhya Pradesh",
    sx: 169.7,
    sy: 228.6,
    oe: 91.5,
    otif: 94.3,
    yield: 97.8,
  },
  {
    id: "laksar",
    name: "Laksar Plant",
    sub: "Haridwar, Uttarakhand",
    sx: 167.6,
    sy: 170.2,
    oe: 93.1,
    otif: 95.6,
    yield: 98.1,
  },
  {
    id: "mysore",
    name: "Mysore Plant",
    sub: "Karnataka",
    sx: 163.0,
    sy: 441.0,
    oe: 92.6,
    otif: 95.1,
    yield: 98.0,
  },
];

/**
 * Function tiles surfaced on each plant card. `active` is the
 * artifact's data-level flag (Plant Head + Technical are
 * placeholders). Spec 03 additionally renders Quality + Engineering
 * as visible-but-disabled per Q-NAV-01 (Phase 1 ships Production only).
 */
export const FUNCTIONS = [
  { id: "ph", name: "Plant Head", icon: "⌂", active: false },
  { id: "prod", name: "Production", icon: "⚡", active: true },
  { id: "qual", name: "Quality", icon: "◆", active: true },
  { id: "tech", name: "Technical", icon: "⚙", active: false },
  { id: "eng", name: "Engineering", icon: "⚒", active: true },
];

/**
 * Banmore-specific tyre-mix lock. Banmore produces PCR only — the
 * Tyre Type filter is disabled and a "PCR ONLY" badge replaces it
 * (BRD FR-X2). Bundled with this spec so the data lives next to the
 * plant list; consumed later by the tyre-type-filter spec.
 */
export const BANMORE_TYRE_MIX = { pcr: 100, tbr: 0 };

/**
 * Production-dashboard sections (spec 04). Default active = "mix".
 * BRD FR-P4 lists exactly these four. The internal sub-selectors
 * (Mixing Master/Final, Stock 4Roll/Extruder/...) are added in later
 * specs when their consuming KPIs come online.
 */
export const SECTIONS = [
  { id: "mix", code: "MIX", name: "Mixing" },
  { id: "tbm", code: "TBM", name: "TBM" },
  { id: "cur", code: "CUR", name: "Curing" },
  { id: "stk", code: "STK", name: "Stock" },
];

/**
 * Production-dashboard category tabs (spec 04). Default active = "p"
 * (Productivity). BRD FR-P7 lists the codes + labels verbatim.
 * Inventory ("I") replaces the section view when active (BRD §6.13)
 * — spec 15 implements the Inventory page.
 */
export const CATEGORY_TABS = [
  { id: "p", code: "P", name: "Productivity" },
  { id: "q", code: "Q", name: "Quality" },
  { id: "c", code: "C", name: "Cost" },
  { id: "d", code: "D", name: "Delivery" },
  { id: "m", code: "M", name: "Morale" },
  { id: "s", code: "S", name: "Safety" },
  { id: "i", code: "I", name: "Inventory" },
];

/**
 * Plant-card summary pinned at the bottom of the Production
 * dashboard sidebar (BRD FR-P6). Values are static mocks matching
 * the artifact's example numbers; replace with derived metrics when
 * the KPI engine arrives in spec 05+.
 */
export const PLANT_SUMMARIES = {
  banmore: { prodPct: 92, scrapPct: 1.05 },
};

/**
 * Mixing > Productivity KPI definitions (spec 05). Keyed by compound
 * — "master" and "final" — per BRD FR-P11. Production values 285 MT
 * (Master) and 183 MT (Final) come from the BRD; other KPIs are
 * deterministic mocks. Sparkline arrays are 8 points each, recent →
 * latest.
 *
 * Spec 11 wraps this into PRODUCTIVITY_KPIS_BY_SECTION further down
 * for TBM / Curing / Stock parity; this export stays as the Mixing
 * leaf for backwards compatibility within the file.
 */
export const MIXING_PRODUCTIVITY_KPIS = {
  master: [
    {
      id: "oee",
      name: "OEE",
      value: 79.4,
      unit: "%",
      trend: 1.8,
      trendFavourable: true,
      spark: [76.5, 77.1, 77.8, 78.0, 78.6, 78.9, 79.1, 79.4],
      target: 85,
      drillable: true,
    },
    {
      id: "production",
      name: "Production",
      value: 285,
      unit: "MT",
      trend: 4.2,
      trendFavourable: true,
      spark: [262, 268, 271, 275, 278, 281, 283, 285],
      target: 300,
      drillable: true,
    },
    {
      id: "downtime",
      name: "Downtime",
      value: 6.4,
      unit: "hrs",
      trend: -8.5,
      trendFavourable: true,
      spark: [8.1, 7.6, 7.5, 7.2, 7.0, 6.8, 6.6, 6.4],
      target: 5,
      drillable: true,
    },
    {
      id: "plan-compliance",
      name: "Plan Compliance",
      value: 94.2,
      unit: "%",
      trend: 0.6,
      trendFavourable: true,
      spark: [93.4, 93.6, 93.7, 93.9, 94.0, 94.0, 94.1, 94.2],
      target: 95,
      drillable: true,
    },
  ],
  final: [
    {
      id: "oee",
      name: "OEE",
      value: 78.5,
      unit: "%",
      trend: -1.1,
      trendFavourable: false,
      spark: [79.6, 79.3, 79.1, 79.0, 78.8, 78.7, 78.6, 78.5],
      target: 85,
      drillable: true,
    },
    {
      id: "production",
      name: "Production",
      value: 183,
      unit: "MT",
      trend: 2.4,
      trendFavourable: true,
      spark: [171, 173, 175, 177, 179, 180, 182, 183],
      target: 200,
      drillable: true,
    },
    {
      id: "downtime",
      name: "Downtime",
      value: 5.2,
      unit: "hrs",
      trend: -3.7,
      trendFavourable: true,
      spark: [6.0, 5.8, 5.7, 5.5, 5.4, 5.3, 5.3, 5.2],
      target: 5,
      drillable: true,
    },
    {
      id: "plan-compliance",
      name: "Plan Compliance",
      value: 91.6,
      unit: "%",
      trend: -1.3,
      trendFavourable: false,
      spark: [92.9, 92.7, 92.5, 92.3, 92.1, 91.9, 91.8, 91.6],
      target: 95,
      drillable: true,
    },
  ],
};

/**
 * Machines per Production section (spec 06 + spec 11). Phase 1 only
 * fills `mix`; spec 11 adds TBM (VMI Max, VMI Exium, BJ Modules,
 * Stage 1, Stage 2), CUR (Tredge 1–6), STK (sub-selector driven).
 */
export const MACHINES_BY_SECTION = {
  mix: [
    { id: "banbury-1", name: "Banbury 1" },
    { id: "banbury-2", name: "Banbury 2" },
    { id: "banbury-3", name: "Banbury 3" },
    { id: "banbury-4", name: "Banbury 4" },
    { id: "banbury-5", name: "Banbury 5" },
  ],
  // TBM per BRD FR-P13. No sub-selector.
  tbm: [
    { id: "vmi-max", name: "VMI Max" },
    { id: "vmi-exium", name: "VMI Exium" },
    { id: "bj-modules", name: "BJ Modules" },
    { id: "stage-1", name: "Stage 1" },
    { id: "stage-2", name: "Stage 2" },
  ],
  // Curing per BRD FR-P15. Press counts in display name.
  cur: [
    { id: "tredge-1", name: "Tredge 1 (8 press)" },
    { id: "tredge-2", name: "Tredge 2 (8 press)" },
    { id: "tredge-3", name: "Tredge 3 (10 press)" },
    { id: "tredge-4", name: "Tredge 4 (10 press)" },
    { id: "tredge-5", name: "Tredge 5 (8 press)" },
    { id: "tredge-6", name: "Tredge 6 (6 press)" },
  ],
  // Stock — Phase 1 only fills the 4 Roll sub-selector's machine
  // list. Other sub-selectors render the empty state (Phase 2).
  stk: [
    { id: "stk-4roll-1", name: "4 Roll Line 1" },
    { id: "stk-4roll-2", name: "4 Roll Line 2" },
    { id: "stk-4roll-3", name: "4 Roll Line 3" },
  ],
};

/**
 * OEE drill data per plant + section (spec 06). Spec 11 widens to
 * the other Banmore sections.
 *
 * Shape:
 *   overall: { availability, performance, quality }
 *   machines: [{ id, name, availability, performance, quality, oee }]
 *   subDrill: {
 *     "${machineId}/${component}/${subCategory}": [...rows]
 *   }
 *
 * Threshold logic (per FR-P26):
 *   Availability: green ≥95%, amber ≥85%, red <85%
 *   Performance: green ≥95%, amber ≥90%, red <90%
 *   Quality: green ≥99%, amber ≥98%, red <98%
 *
 * Detail-row shapes vary by component (see spec 06 §Mock data
 * additions). The `traceable` flag on Scrap rows is the hook for
 * spec 08; here it just sits on the data.
 */
export const OEE_DRILL_BY_PLANT_SECTION = {
  "banmore/mix": {
    overall: { availability: 91.4, performance: 88.2, quality: 98.6 },
    machines: [
      {
        id: "banbury-1",
        name: "Banbury 1",
        availability: 95.3,
        performance: 91.4,
        quality: 99.1,
      },
      {
        id: "banbury-2",
        name: "Banbury 2",
        availability: 92.1,
        performance: 88.6,
        quality: 98.7,
      },
      {
        id: "banbury-3",
        name: "Banbury 3",
        availability: 88.7,
        performance: 86.2,
        quality: 98.3,
      },
      {
        id: "banbury-4",
        name: "Banbury 4",
        availability: 90.8,
        performance: 87.4,
        quality: 98.5,
      },
      {
        id: "banbury-5",
        name: "Banbury 5",
        availability: 83.5,
        performance: 84.9,
        quality: 97.8,
      },
    ],
    subDrill: {
      // Banbury 1
      "banbury-1/availability/breakdown": [
        {
          reasonCategory: "Mechanical",
          reason: "Rotor seal leak",
          events: 1,
          durationMin: 38,
        },
        {
          reasonCategory: "Electrical",
          reason: "Motor overload trip",
          events: 2,
          durationMin: 22,
        },
      ],
      "banbury-1/availability/setupAdjustment": [
        { reason: "Compound changeover", events: 3, durationMin: 24 },
      ],
      "banbury-1/availability/startup": [
        { reason: "Cold-start warmup", events: 1, durationMin: 12 },
      ],
      "banbury-1/availability/toolChange": [],
      "banbury-1/performance/minorStoppage": [
        { reason: "Feeder jam", events: 4, durationMin: 8 },
      ],
      "banbury-1/performance/reducedSpeed": [
        { reason: "TCU recovery", events: 2, durationMin: 14 },
      ],
      "banbury-1/quality/defect": [
        {
          itemCode: "COMP-FIN-001",
          defectType: "Underdispersion",
          qty: 280,
          totalProduced: 22400,
        },
      ],
      "banbury-1/quality/scrap": [
        { itemCode: "COMP-FIN-001", qty: 120, traceable: true },
        { itemCode: "COMP-FIN-003", qty: 60, traceable: false },
      ],

      // Banbury 2
      "banbury-2/availability/breakdown": [
        {
          reasonCategory: "Instrumentation",
          reason: "TCU sensor drift",
          events: 1,
          durationMin: 28,
        },
      ],
      "banbury-2/availability/setupAdjustment": [],
      "banbury-2/availability/startup": [],
      "banbury-2/availability/toolChange": [
        { reason: "Rotor blade swap", events: 1, durationMin: 45 },
      ],
      "banbury-2/performance/minorStoppage": [
        { reason: "Door interlock", events: 3, durationMin: 5 },
      ],
      "banbury-2/performance/reducedSpeed": [],
      "banbury-2/quality/defect": [],
      "banbury-2/quality/scrap": [
        { itemCode: "COMP-FIN-002", qty: 85, traceable: true },
      ],

      // Banbury 3
      "banbury-3/availability/breakdown": [
        {
          reasonCategory: "Mechanical",
          reason: "Discharge door stuck",
          events: 2,
          durationMin: 62,
        },
        {
          reasonCategory: "Electrical",
          reason: "Drive VFD fault",
          events: 1,
          durationMin: 41,
        },
      ],
      "banbury-3/availability/setupAdjustment": [
        { reason: "Compound changeover", events: 2, durationMin: 18 },
      ],
      "banbury-3/availability/startup": [],
      "banbury-3/availability/toolChange": [],
      "banbury-3/performance/minorStoppage": [
        { reason: "Feeder jam", events: 6, durationMin: 12 },
      ],
      "banbury-3/performance/reducedSpeed": [
        { reason: "TCU recovery", events: 3, durationMin: 22 },
      ],
      "banbury-3/quality/defect": [
        {
          itemCode: "COMP-MST-005",
          defectType: "Mooney out of range",
          qty: 180,
          totalProduced: 18000,
        },
      ],
      "banbury-3/quality/scrap": [
        { itemCode: "COMP-MST-005", qty: 95, traceable: true },
      ],

      // Banbury 4
      "banbury-4/availability/breakdown": [
        {
          reasonCategory: "Mechanical",
          reason: "Hopper clog",
          events: 1,
          durationMin: 18,
        },
      ],
      "banbury-4/availability/setupAdjustment": [],
      "banbury-4/availability/startup": [],
      "banbury-4/availability/toolChange": [],
      "banbury-4/performance/minorStoppage": [
        { reason: "Feeder jam", events: 2, durationMin: 4 },
      ],
      "banbury-4/performance/reducedSpeed": [],
      "banbury-4/quality/defect": [],
      "banbury-4/quality/scrap": [],

      // Banbury 5 (worst performer — exercises red thresholds)
      "banbury-5/availability/breakdown": [
        {
          reasonCategory: "Mechanical",
          reason: "Major bearing failure",
          events: 1,
          durationMin: 215,
        },
        {
          reasonCategory: "Electrical",
          reason: "Control panel replace",
          events: 1,
          durationMin: 95,
        },
      ],
      "banbury-5/availability/setupAdjustment": [
        { reason: "Repeated changeover", events: 5, durationMin: 35 },
      ],
      "banbury-5/availability/startup": [
        { reason: "Post-repair recommissioning", events: 1, durationMin: 40 },
      ],
      "banbury-5/availability/toolChange": [],
      "banbury-5/performance/minorStoppage": [
        { reason: "Feeder jam", events: 8, durationMin: 22 },
      ],
      "banbury-5/performance/reducedSpeed": [
        { reason: "Cold-zone derate", events: 4, durationMin: 38 },
      ],
      "banbury-5/quality/defect": [
        {
          itemCode: "COMP-FIN-002",
          defectType: "Overdispersion",
          qty: 220,
          totalProduced: 14000,
        },
        {
          itemCode: "COMP-MST-001",
          defectType: "Visual contamination",
          qty: 110,
          totalProduced: 9000,
        },
      ],
      "banbury-5/quality/scrap": [
        { itemCode: "COMP-FIN-002", qty: 240, traceable: true },
        { itemCode: "COMP-MST-001", qty: 110, traceable: true },
      ],
    },
  },
};

/**
 * Production drill data per plant + section (spec 07). Compound-wise
 * rows grouped under "master" and "final".
 *
 * Row shape:
 *   { itemCode, machine, planned, actual, batchesPlan, batchesActual }
 *
 * Variance is derived in the renderer: (actual - planned) / planned
 * * 100, colour-coded per FR-P46.
 *
 * Machine assignment per FR-P47:
 *   Master cycles Banbury 1–3 (larger Banburys handle master batches)
 *   Final cycles Banbury 1–5
 *
 * Batch counts derived per FR-P48:
 *   Master ≈ 1.80 MT/batch
 *   Final ≈ 1.95 MT/batch
 */
export const PRODUCTION_DRILL_BY_PLANT_SECTION = {
  "banmore/mix": {
    master: [
      {
        itemCode: "COMP-MST-001",
        machine: "Banbury 1",
        planned: 34.2,
        actual: 33.1,
        batchesPlan: 19,
        batchesActual: 18,
      },
      {
        itemCode: "COMP-MST-002",
        machine: "Banbury 2",
        planned: 28.6,
        actual: 29.4,
        batchesPlan: 16,
        batchesActual: 16,
      },
      {
        itemCode: "COMP-MST-003",
        machine: "Banbury 3",
        planned: 41.8,
        actual: 40.5,
        batchesPlan: 23,
        batchesActual: 23,
      },
      {
        itemCode: "COMP-MST-004",
        machine: "Banbury 1",
        planned: 22.5,
        actual: 19.8,
        batchesPlan: 13,
        batchesActual: 11,
      },
      {
        itemCode: "COMP-MST-005",
        machine: "Banbury 2",
        planned: 36.0,
        actual: 35.6,
        batchesPlan: 20,
        batchesActual: 20,
      },
      {
        itemCode: "COMP-MST-006",
        machine: "Banbury 3",
        planned: 30.4,
        actual: 31.5,
        batchesPlan: 17,
        batchesActual: 18,
      },
      {
        itemCode: "COMP-MST-007",
        machine: "Banbury 1",
        planned: 47.2,
        actual: 44.3,
        batchesPlan: 26,
        batchesActual: 25,
      },
      {
        itemCode: "COMP-MST-008",
        machine: "Banbury 2",
        planned: 44.3,
        actual: 50.8,
        batchesPlan: 25,
        batchesActual: 28,
      },
    ],
    final: [
      {
        itemCode: "COMP-FIN-001",
        machine: "Banbury 1",
        planned: 22.4,
        actual: 22.0,
        batchesPlan: 11,
        batchesActual: 11,
      },
      {
        itemCode: "COMP-FIN-002",
        machine: "Banbury 2",
        planned: 18.6,
        actual: 17.1,
        batchesPlan: 10,
        batchesActual: 9,
      },
      {
        itemCode: "COMP-FIN-003",
        machine: "Banbury 3",
        planned: 26.0,
        actual: 25.9,
        batchesPlan: 13,
        batchesActual: 13,
      },
      {
        itemCode: "COMP-FIN-004",
        machine: "Banbury 4",
        planned: 21.2,
        actual: 22.5,
        batchesPlan: 11,
        batchesActual: 12,
      },
      {
        itemCode: "COMP-FIN-005",
        machine: "Banbury 5",
        planned: 28.4,
        actual: 24.1,
        batchesPlan: 15,
        batchesActual: 12,
      },
      {
        itemCode: "COMP-FIN-006",
        machine: "Banbury 1",
        planned: 19.5,
        actual: 19.0,
        batchesPlan: 10,
        batchesActual: 10,
      },
      {
        itemCode: "COMP-FIN-007",
        machine: "Banbury 2",
        planned: 23.1,
        actual: 22.4,
        batchesPlan: 12,
        batchesActual: 11,
      },
      {
        itemCode: "COMP-FIN-008",
        machine: "Banbury 3",
        planned: 24.0,
        actual: 25.5,
        batchesPlan: 12,
        batchesActual: 13,
      },
    ],
  },
};

/**
 * Banbury process-parameter normal ranges (spec 08). Drives the
 * out-of-range flag and tooltip on Machine Parameter chips per
 * BRD FR-P55.
 */
export const BANBURY_PARAM_RANGES = {
  dropTemp: { min: 145, max: 158, unit: "°C", label: "Drop Temp" },
  tcu: { min: 60, max: 78, unit: "°C", label: "TCU" },
  rotor: { min: 35, max: 45, unit: "rpm", label: "Rotor" },
  mixTime: { min: 180, max: 220, unit: "s", label: "Mix Time" },
  power: { min: 220, max: 260, unit: "kW", label: "Power" },
};

/**
 * Scrap traceability records (spec 08). Keyed by
 * `${plantId}/${section}/${machineId}/${itemCode}`. Each entry is
 * an array of Production ID records consumed by ScrapTraceabilityPanel.
 *
 * Item codes that appear in OEE_DRILL_BY_PLANT_SECTION's
 * quality/scrap detail rows with `traceable: true` MUST have a key
 * here; otherwise the panel shows the empty state.
 */
export const SCRAP_TRACEABILITY = {
  // Banbury 1 — Final compound COMP-FIN-001 (120 kg traceable scrap)
  "banmore/mix/banbury-1/COMP-FIN-001": [
    {
      productionId: "B1-2026-1015-A-001",
      shift: "A",
      operator: "R. Kumar",
      produced: 1800,
      scrap: 35,
      scrapReason: "Underdispersion",
      batchLot: "FIN-001-LOT-0042",
      dateTime: "2026-10-15T07:23:00",
      params: { dropTemp: 152, tcu: 68, rotor: 41, mixTime: 198, power: 234 },
      alarmParam: null,
    },
    {
      productionId: "B1-2026-1015-A-002",
      shift: "A",
      operator: "R. Kumar",
      produced: 1800,
      scrap: 28,
      scrapReason: "Visual flow mark",
      batchLot: "FIN-001-LOT-0043",
      dateTime: "2026-10-15T08:14:00",
      params: { dropTemp: 160, tcu: 70, rotor: 39, mixTime: 205, power: 240 },
      alarmParam: "dropTemp",
    },
    {
      productionId: "B1-2026-1015-B-001",
      shift: "B",
      operator: "S. Iyer",
      produced: 1800,
      scrap: 30,
      scrapReason: "Underdispersion",
      batchLot: "FIN-001-LOT-0051",
      dateTime: "2026-10-15T15:48:00",
      params: { dropTemp: 150, tcu: 66, rotor: 38, mixTime: 188, power: 228 },
      alarmParam: null,
    },
    {
      productionId: "B1-2026-1015-C-001",
      shift: "C",
      operator: "A. Patel",
      produced: 1800,
      scrap: 27,
      scrapReason: "Mooney out of spec",
      batchLot: "FIN-001-LOT-0061",
      dateTime: "2026-10-15T23:11:00",
      params: { dropTemp: 154, tcu: 72, rotor: 47, mixTime: 195, power: 252 },
      alarmParam: "rotor",
    },
  ],

  // Banbury 2 — Final compound COMP-FIN-002 (85 kg traceable scrap)
  "banmore/mix/banbury-2/COMP-FIN-002": [
    {
      productionId: "B2-2026-1015-A-001",
      shift: "A",
      operator: "M. Singh",
      produced: 1850,
      scrap: 45,
      scrapReason: "Overdispersion",
      batchLot: "FIN-002-LOT-0021",
      dateTime: "2026-10-15T08:02:00",
      params: { dropTemp: 156, tcu: 75, rotor: 44, mixTime: 226, power: 258 },
      alarmParam: "mixTime",
    },
    {
      productionId: "B2-2026-1015-B-001",
      shift: "B",
      operator: "P. Sharma",
      produced: 1850,
      scrap: 40,
      scrapReason: "Mooney out of spec",
      batchLot: "FIN-002-LOT-0034",
      dateTime: "2026-10-15T16:30:00",
      params: { dropTemp: 153, tcu: 71, rotor: 42, mixTime: 210, power: 246 },
      alarmParam: null,
    },
  ],

  // Banbury 3 — Master compound COMP-MST-005 (95 kg traceable scrap)
  "banmore/mix/banbury-3/COMP-MST-005": [
    {
      productionId: "B3-2026-1015-A-001",
      shift: "A",
      operator: "V. Joshi",
      produced: 2100,
      scrap: 55,
      scrapReason: "TCU overshoot",
      batchLot: "MST-005-LOT-0011",
      dateTime: "2026-10-15T06:48:00",
      params: { dropTemp: 159, tcu: 82, rotor: 43, mixTime: 215, power: 263 },
      alarmParam: "tcu",
    },
    {
      productionId: "B3-2026-1015-B-001",
      shift: "B",
      operator: "N. Bose",
      produced: 2100,
      scrap: 40,
      scrapReason: "Underdispersion",
      batchLot: "MST-005-LOT-0017",
      dateTime: "2026-10-15T14:55:00",
      params: { dropTemp: 148, tcu: 64, rotor: 36, mixTime: 192, power: 230 },
      alarmParam: null,
    },
  ],

  // Banbury 5 — multiple traceable item codes
  "banmore/mix/banbury-5/COMP-FIN-002": [
    {
      productionId: "B5-2026-1015-A-001",
      shift: "A",
      operator: "J. Reddy",
      produced: 1750,
      scrap: 120,
      scrapReason: "Bearing chatter — visual contamination",
      batchLot: "FIN-002-LOT-0089",
      dateTime: "2026-10-15T09:18:00",
      params: { dropTemp: 165, tcu: 85, rotor: 50, mixTime: 230, power: 275 },
      alarmParam: "dropTemp",
    },
    {
      productionId: "B5-2026-1015-B-001",
      shift: "B",
      operator: "T. Banerjee",
      produced: 1750,
      scrap: 120,
      scrapReason: "Cold-zone underdispersion",
      batchLot: "FIN-002-LOT-0092",
      dateTime: "2026-10-15T17:42:00",
      params: { dropTemp: 142, tcu: 58, rotor: 33, mixTime: 175, power: 215 },
      alarmParam: "dropTemp",
    },
  ],
  "banmore/mix/banbury-5/COMP-MST-001": [
    {
      productionId: "B5-2026-1015-A-002",
      shift: "A",
      operator: "J. Reddy",
      produced: 2050,
      scrap: 60,
      scrapReason: "Visual contamination",
      batchLot: "MST-001-LOT-0023",
      dateTime: "2026-10-15T11:35:00",
      params: { dropTemp: 158, tcu: 76, rotor: 44, mixTime: 218, power: 256 },
      alarmParam: null,
    },
    {
      productionId: "B5-2026-1015-C-001",
      shift: "C",
      operator: "K. Menon",
      produced: 2050,
      scrap: 50,
      scrapReason: "Mooney out of spec",
      batchLot: "MST-001-LOT-0029",
      dateTime: "2026-10-15T23:05:00",
      params: { dropTemp: 155, tcu: 73, rotor: 42, mixTime: 209, power: 248 },
      alarmParam: null,
    },
  ],
};

/**
 * Downtime drill data per plant + section (spec 09).
 * Row shape: { reasonCategory, machine, reason, events, durationMin, lossHrs }
 * Categories per BRD FR-P60:
 *   Breakdown — Electrical / Mechanical / Instrumentation
 *   Setup     — FTC / size change
 *   PM
 *   Process
 *   Utility   — power failure / steam / compressed air
 *   Other
 */
export const DOWNTIME_DRILL_BY_PLANT_SECTION = {
  "banmore/mix": [
    {
      reasonCategory: "Breakdown — Mechanical",
      machine: "Banbury 5",
      reason: "Major bearing failure",
      events: 1,
      durationMin: 215,
      lossHrs: 3.6,
    },
    {
      reasonCategory: "Breakdown — Mechanical",
      machine: "Banbury 1",
      reason: "Rotor seal leak",
      events: 1,
      durationMin: 38,
      lossHrs: 0.6,
    },
    {
      reasonCategory: "Breakdown — Mechanical",
      machine: "Banbury 3",
      reason: "Discharge door stuck",
      events: 2,
      durationMin: 62,
      lossHrs: 1.0,
    },
    {
      reasonCategory: "Breakdown — Electrical",
      machine: "Banbury 1",
      reason: "Motor overload trip",
      events: 2,
      durationMin: 22,
      lossHrs: 0.4,
    },
    {
      reasonCategory: "Breakdown — Electrical",
      machine: "Banbury 3",
      reason: "Drive VFD fault",
      events: 1,
      durationMin: 41,
      lossHrs: 0.7,
    },
    {
      reasonCategory: "Breakdown — Electrical",
      machine: "Banbury 5",
      reason: "Control panel replace",
      events: 1,
      durationMin: 95,
      lossHrs: 1.6,
    },
    {
      reasonCategory: "Breakdown — Instrumentation",
      machine: "Banbury 2",
      reason: "TCU sensor drift",
      events: 1,
      durationMin: 28,
      lossHrs: 0.5,
    },
    {
      reasonCategory: "Setup — FTC",
      machine: "Banbury 1",
      reason: "Compound changeover",
      events: 3,
      durationMin: 24,
      lossHrs: 0.4,
    },
    {
      reasonCategory: "Setup — size change",
      machine: "Banbury 5",
      reason: "Repeated changeover",
      events: 5,
      durationMin: 35,
      lossHrs: 0.6,
    },
    {
      reasonCategory: "PM",
      machine: "Banbury 2",
      reason: "Scheduled rotor blade swap",
      events: 1,
      durationMin: 45,
      lossHrs: 0.75,
    },
    {
      reasonCategory: "Process",
      machine: "Banbury 3",
      reason: "TCU recovery",
      events: 3,
      durationMin: 22,
      lossHrs: 0.37,
    },
    {
      reasonCategory: "Utility",
      machine: "All Banburys",
      reason: "Steam pressure drop",
      events: 1,
      durationMin: 18,
      lossHrs: 1.5,
    },
    {
      reasonCategory: "Other",
      machine: "Banbury 4",
      reason: "Hopper clog",
      events: 1,
      durationMin: 18,
      lossHrs: 0.3,
    },
  ],
};

/**
 * Plan Compliance drill data per plant + section (spec 09). Two
 * views: SKU-wise and Machine-wise, per BRD FR-P61.
 */
export const PLAN_COMPLIANCE_DRILL_BY_PLANT_SECTION = {
  "banmore/mix": {
    skuWise: [
      { itemCode: "COMP-MST-001", planned: 34.2, actual: 33.1 },
      { itemCode: "COMP-MST-002", planned: 28.6, actual: 29.4 },
      { itemCode: "COMP-MST-003", planned: 41.8, actual: 40.5 },
      { itemCode: "COMP-MST-004", planned: 22.5, actual: 19.8 },
      { itemCode: "COMP-FIN-001", planned: 22.4, actual: 22.0 },
      { itemCode: "COMP-FIN-002", planned: 18.6, actual: 17.1 },
      { itemCode: "COMP-FIN-003", planned: 26.0, actual: 25.9 },
      { itemCode: "COMP-FIN-005", planned: 28.4, actual: 24.1 },
    ],
    machineWise: [
      { machine: "Banbury 1", planned: 78.1, actual: 74.1 },
      { machine: "Banbury 2", planned: 70.3, actual: 69.6 },
      { machine: "Banbury 3", planned: 91.8, actual: 91.9 },
      { machine: "Banbury 4", planned: 21.2, actual: 22.5 },
      { machine: "Banbury 5", planned: 28.4, actual: 24.1 },
    ],
  },
};

/**
 * Trend series per (compound, KPI, range) for the KPI Trend Modal
 * (spec 10). Each entry: { labels, values }. Manually authored so
 * lines look believable; not derived from spark deltas.
 *
 * Custom date ranges (from/to) fall back to the "month" series in
 * Phase 1 — see api/trends.js.
 */
export const MIXING_PRODUCTIVITY_TRENDS = {
  final: {
    oee: {
      today: {
        labels: ["00", "03", "06", "09", "12", "15", "18", "21"],
        values: [76.4, 77.1, 77.8, 78.4, 79.2, 78.9, 78.6, 78.5],
      },
      week: {
        labels: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
        values: [79.6, 79.3, 79.1, 79.0, 78.8, 78.7, 78.5],
      },
      month: {
        labels: [
          "W1",
          "W2",
          "W3",
          "W4",
          "W5",
          "W6",
          "W7",
          "W8",
          "W9",
          "W10",
          "W11",
          "W12",
        ],
        values: [
          80.1, 79.8, 79.5, 79.4, 79.2, 79.0, 78.8, 78.7, 78.6, 78.6, 78.5,
          78.5,
        ],
      },
      year: {
        labels: [
          "Jan",
          "Feb",
          "Mar",
          "Apr",
          "May",
          "Jun",
          "Jul",
          "Aug",
          "Sep",
          "Oct",
          "Nov",
          "Dec",
        ],
        values: [
          81.2, 80.6, 80.1, 80.5, 79.8, 79.4, 79.0, 78.8, 78.6, 78.5, 78.4,
          78.5,
        ],
      },
    },
    production: {
      today: {
        labels: ["00", "03", "06", "09", "12", "15", "18", "21"],
        values: [22, 23, 23, 24, 24, 23, 22, 22],
      },
      week: {
        labels: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
        values: [171, 173, 175, 177, 179, 180, 183],
      },
      month: {
        labels: [
          "W1",
          "W2",
          "W3",
          "W4",
          "W5",
          "W6",
          "W7",
          "W8",
          "W9",
          "W10",
          "W11",
          "W12",
        ],
        values: [158, 162, 165, 167, 170, 172, 175, 177, 178, 180, 182, 183],
      },
      year: {
        labels: [
          "Jan",
          "Feb",
          "Mar",
          "Apr",
          "May",
          "Jun",
          "Jul",
          "Aug",
          "Sep",
          "Oct",
          "Nov",
          "Dec",
        ],
        values: [165, 168, 172, 174, 175, 177, 178, 179, 181, 182, 183, 183],
      },
    },
    downtime: {
      today: {
        labels: ["00", "03", "06", "09", "12", "15", "18", "21"],
        values: [0.8, 0.6, 0.7, 0.5, 0.6, 0.6, 0.7, 0.7],
      },
      week: {
        labels: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
        values: [6.0, 5.8, 5.7, 5.5, 5.4, 5.3, 5.2],
      },
      month: {
        labels: [
          "W1",
          "W2",
          "W3",
          "W4",
          "W5",
          "W6",
          "W7",
          "W8",
          "W9",
          "W10",
          "W11",
          "W12",
        ],
        values: [7.4, 7.1, 6.8, 6.6, 6.4, 6.1, 5.9, 5.7, 5.5, 5.4, 5.3, 5.2],
      },
      year: {
        labels: [
          "Jan",
          "Feb",
          "Mar",
          "Apr",
          "May",
          "Jun",
          "Jul",
          "Aug",
          "Sep",
          "Oct",
          "Nov",
          "Dec",
        ],
        values: [8.2, 8.0, 7.6, 7.2, 6.9, 6.5, 6.2, 5.9, 5.6, 5.4, 5.3, 5.2],
      },
    },
    "plan-compliance": {
      today: {
        labels: ["00", "03", "06", "09", "12", "15", "18", "21"],
        values: [92.5, 92.1, 91.9, 91.8, 91.6, 91.5, 91.6, 91.6],
      },
      week: {
        labels: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
        values: [92.9, 92.7, 92.5, 92.3, 92.1, 91.9, 91.6],
      },
      month: {
        labels: [
          "W1",
          "W2",
          "W3",
          "W4",
          "W5",
          "W6",
          "W7",
          "W8",
          "W9",
          "W10",
          "W11",
          "W12",
        ],
        values: [
          93.8, 93.5, 93.1, 92.9, 92.7, 92.5, 92.2, 92.0, 91.8, 91.7, 91.7,
          91.6,
        ],
      },
      year: {
        labels: [
          "Jan",
          "Feb",
          "Mar",
          "Apr",
          "May",
          "Jun",
          "Jul",
          "Aug",
          "Sep",
          "Oct",
          "Nov",
          "Dec",
        ],
        values: [
          94.5, 94.1, 93.6, 93.2, 92.8, 92.5, 92.2, 92.0, 91.8, 91.7, 91.6,
          91.6,
        ],
      },
    },
  },
  master: {
    oee: {
      today: {
        labels: ["00", "03", "06", "09", "12", "15", "18", "21"],
        values: [77.0, 77.5, 78.1, 78.6, 79.0, 79.2, 79.3, 79.4],
      },
      week: {
        labels: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
        values: [76.5, 77.1, 77.8, 78.0, 78.6, 78.9, 79.4],
      },
      month: {
        labels: [
          "W1",
          "W2",
          "W3",
          "W4",
          "W5",
          "W6",
          "W7",
          "W8",
          "W9",
          "W10",
          "W11",
          "W12",
        ],
        values: [
          75.2, 75.8, 76.3, 76.7, 77.1, 77.6, 78.0, 78.4, 78.7, 79.0, 79.2,
          79.4,
        ],
      },
      year: {
        labels: [
          "Jan",
          "Feb",
          "Mar",
          "Apr",
          "May",
          "Jun",
          "Jul",
          "Aug",
          "Sep",
          "Oct",
          "Nov",
          "Dec",
        ],
        values: [
          73.5, 74.2, 75.0, 75.8, 76.5, 77.1, 77.6, 78.1, 78.6, 78.9, 79.2,
          79.4,
        ],
      },
    },
    production: {
      today: {
        labels: ["00", "03", "06", "09", "12", "15", "18", "21"],
        values: [34, 35, 36, 36, 37, 36, 35, 35],
      },
      week: {
        labels: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
        values: [262, 268, 271, 275, 278, 281, 285],
      },
      month: {
        labels: [
          "W1",
          "W2",
          "W3",
          "W4",
          "W5",
          "W6",
          "W7",
          "W8",
          "W9",
          "W10",
          "W11",
          "W12",
        ],
        values: [248, 254, 259, 263, 267, 270, 273, 276, 279, 281, 283, 285],
      },
      year: {
        labels: [
          "Jan",
          "Feb",
          "Mar",
          "Apr",
          "May",
          "Jun",
          "Jul",
          "Aug",
          "Sep",
          "Oct",
          "Nov",
          "Dec",
        ],
        values: [255, 260, 263, 266, 270, 273, 276, 278, 281, 283, 284, 285],
      },
    },
    downtime: {
      today: {
        labels: ["00", "03", "06", "09", "12", "15", "18", "21"],
        values: [1.0, 0.9, 0.8, 0.7, 0.8, 0.8, 0.7, 0.7],
      },
      week: {
        labels: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
        values: [8.1, 7.6, 7.5, 7.2, 7.0, 6.8, 6.4],
      },
      month: {
        labels: [
          "W1",
          "W2",
          "W3",
          "W4",
          "W5",
          "W6",
          "W7",
          "W8",
          "W9",
          "W10",
          "W11",
          "W12",
        ],
        values: [9.2, 8.8, 8.5, 8.1, 7.8, 7.5, 7.2, 7.0, 6.8, 6.6, 6.5, 6.4],
      },
      year: {
        labels: [
          "Jan",
          "Feb",
          "Mar",
          "Apr",
          "May",
          "Jun",
          "Jul",
          "Aug",
          "Sep",
          "Oct",
          "Nov",
          "Dec",
        ],
        values: [9.8, 9.4, 8.9, 8.5, 8.2, 7.9, 7.5, 7.2, 6.9, 6.7, 6.5, 6.4],
      },
    },
    "plan-compliance": {
      today: {
        labels: ["00", "03", "06", "09", "12", "15", "18", "21"],
        values: [93.5, 93.8, 94.0, 94.1, 94.2, 94.2, 94.1, 94.2],
      },
      week: {
        labels: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
        values: [93.4, 93.6, 93.7, 93.9, 94.0, 94.0, 94.2],
      },
      month: {
        labels: [
          "W1",
          "W2",
          "W3",
          "W4",
          "W5",
          "W6",
          "W7",
          "W8",
          "W9",
          "W10",
          "W11",
          "W12",
        ],
        values: [
          92.5, 92.8, 93.0, 93.2, 93.4, 93.6, 93.8, 93.9, 94.0, 94.1, 94.1,
          94.2,
        ],
      },
      year: {
        labels: [
          "Jan",
          "Feb",
          "Mar",
          "Apr",
          "May",
          "Jun",
          "Jul",
          "Aug",
          "Sep",
          "Oct",
          "Nov",
          "Dec",
        ],
        values: [
          91.5, 92.0, 92.3, 92.7, 93.1, 93.4, 93.6, 93.8, 94.0, 94.1, 94.1,
          94.2,
        ],
      },
    },
  },
};

/**
 * Productivity-tab KPIs grouped by section (spec 11). Phase 1
 * coverage:
 *   mix → reuses MIXING_PRODUCTIVITY_KPIS (compound-keyed)
 *   tbm → flat 4-KPI array
 *   cur → flat 4-KPI array
 *   stk → keyed by Stock sub-selector; only "4roll" is populated
 *
 * Production KPI in non-Mixing sections is non-drillable per BRD
 * §6.10 (Mixing-only).
 */
const TBM_PRODUCTIVITY = [
  {
    id: "oee",
    name: "OEE",
    value: 82.1,
    unit: "%",
    trend: 1.4,
    trendFavourable: true,
    spark: [79.8, 80.2, 80.6, 81.0, 81.3, 81.7, 81.9, 82.1],
    target: 85,
    drillable: true,
  },
  {
    id: "production",
    name: "Production",
    value: 4280,
    unit: "nos",
    trend: 2.1,
    trendFavourable: true,
    spark: [4080, 4120, 4160, 4190, 4220, 4240, 4260, 4280],
    target: 4500,
    drillable: false,
  },
  {
    id: "downtime",
    name: "Downtime",
    value: 3.8,
    unit: "hrs",
    trend: -5.0,
    trendFavourable: true,
    spark: [5.0, 4.7, 4.5, 4.3, 4.1, 4.0, 3.9, 3.8],
    target: 3,
    drillable: true,
  },
  {
    id: "plan-compliance",
    name: "Plan Compliance",
    value: 95.6,
    unit: "%",
    trend: 0.8,
    trendFavourable: true,
    spark: [94.4, 94.7, 94.9, 95.1, 95.3, 95.4, 95.5, 95.6],
    target: 95,
    drillable: true,
  },
];

const CUR_PRODUCTIVITY = [
  {
    id: "oee",
    name: "OEE",
    value: 87.4,
    unit: "%",
    trend: 0.6,
    trendFavourable: true,
    spark: [86.3, 86.5, 86.7, 86.9, 87.1, 87.2, 87.3, 87.4],
    target: 90,
    drillable: true,
  },
  {
    id: "production",
    name: "Production",
    value: 4115,
    unit: "nos",
    trend: 1.7,
    trendFavourable: true,
    spark: [3970, 4000, 4030, 4055, 4080, 4095, 4105, 4115],
    target: 4300,
    drillable: false,
  },
  {
    id: "downtime",
    name: "Downtime",
    value: 4.6,
    unit: "hrs",
    trend: -2.3,
    trendFavourable: true,
    spark: [5.2, 5.0, 4.9, 4.8, 4.7, 4.7, 4.6, 4.6],
    target: 4,
    drillable: true,
  },
  {
    id: "plan-compliance",
    name: "Plan Compliance",
    value: 93.8,
    unit: "%",
    trend: -0.4,
    trendFavourable: false,
    spark: [94.5, 94.3, 94.2, 94.1, 94.0, 93.9, 93.9, 93.8],
    target: 95,
    drillable: true,
  },
];

const STK_4ROLL_PRODUCTIVITY = [
  {
    id: "oee",
    name: "OEE",
    value: 84.0,
    unit: "%",
    trend: 0.9,
    trendFavourable: true,
    spark: [82.6, 82.9, 83.2, 83.4, 83.6, 83.8, 83.9, 84.0],
    target: 88,
    drillable: true,
  },
  {
    id: "production",
    name: "Production",
    value: 1240,
    unit: "units",
    trend: 1.2,
    trendFavourable: true,
    spark: [1192, 1205, 1212, 1220, 1228, 1232, 1236, 1240],
    target: 1300,
    drillable: false,
  },
  {
    id: "downtime",
    name: "Downtime",
    value: 4.1,
    unit: "hrs",
    trend: -1.4,
    trendFavourable: true,
    spark: [4.6, 4.5, 4.4, 4.3, 4.2, 4.2, 4.1, 4.1],
    target: 3.5,
    drillable: true,
  },
  {
    id: "plan-compliance",
    name: "Plan Compliance",
    value: 92.6,
    unit: "%",
    trend: 0.3,
    trendFavourable: true,
    spark: [92.0, 92.1, 92.2, 92.3, 92.4, 92.5, 92.6, 92.6],
    target: 95,
    drillable: true,
  },
];

export const PRODUCTIVITY_KPIS_BY_SECTION = {
  mix: MIXING_PRODUCTIVITY_KPIS,
  tbm: TBM_PRODUCTIVITY,
  cur: CUR_PRODUCTIVITY,
  stk: {
    "4roll": STK_4ROLL_PRODUCTIVITY,
    extruder: [],
    "3roll": [],
    cutter: [],
    slitter: [],
  },
};

/**
 * OEE drill data for TBM / Curing / Stock (spec 11). Same shape as
 * OEE_DRILL_BY_PLANT_SECTION["banmore/mix"]; sub-drill maps are
 * intentionally lean — 1–2 detail rows per (machine, component,
 * sub-category) to keep the file manageable. Empty combos exercise
 * the FR-P42 empty state.
 */
OEE_DRILL_BY_PLANT_SECTION["banmore/tbm"] = {
  overall: { availability: 94.6, performance: 91.2, quality: 99.0 },
  machines: [
    {
      id: "vmi-max",
      name: "VMI Max",
      availability: 96.4,
      performance: 92.5,
      quality: 99.3,
    },
    {
      id: "vmi-exium",
      name: "VMI Exium",
      availability: 94.8,
      performance: 91.4,
      quality: 99.1,
    },
    {
      id: "bj-modules",
      name: "BJ Modules",
      availability: 93.1,
      performance: 90.2,
      quality: 98.8,
    },
    {
      id: "stage-1",
      name: "Stage 1",
      availability: 95.7,
      performance: 91.7,
      quality: 99.0,
    },
    {
      id: "stage-2",
      name: "Stage 2",
      availability: 92.8,
      performance: 90.0,
      quality: 98.7,
    },
  ],
  subDrill: {
    "vmi-max/availability/breakdown": [
      {
        reasonCategory: "Mechanical",
        reason: "Drum bearing wear",
        events: 1,
        durationMin: 28,
      },
    ],
    "vmi-max/availability/setupAdjustment": [],
    "vmi-max/availability/startup": [],
    "vmi-max/availability/toolChange": [
      { reason: "Size changeover", events: 2, durationMin: 22 },
    ],
    "vmi-max/performance/minorStoppage": [
      { reason: "Material misalign", events: 3, durationMin: 6 },
    ],
    "vmi-max/performance/reducedSpeed": [],
    "vmi-max/quality/defect": [
      {
        itemCode: "TYRE-PCR-A1",
        defectType: "Bead misplace",
        qty: 18,
        totalProduced: 1380,
      },
    ],
    "vmi-max/quality/scrap": [
      { itemCode: "TYRE-PCR-A1", qty: 6, traceable: false },
    ],
    "bj-modules/availability/breakdown": [
      {
        reasonCategory: "Electrical",
        reason: "Servo drive trip",
        events: 2,
        durationMin: 41,
      },
    ],
    "bj-modules/availability/setupAdjustment": [],
    "bj-modules/availability/startup": [],
    "bj-modules/availability/toolChange": [],
    "bj-modules/performance/minorStoppage": [
      { reason: "Conveyor jam", events: 5, durationMin: 14 },
    ],
    "bj-modules/performance/reducedSpeed": [],
    "bj-modules/quality/defect": [],
    "bj-modules/quality/scrap": [],
    "stage-2/availability/breakdown": [
      {
        reasonCategory: "Mechanical",
        reason: "Hydraulic seal leak",
        events: 1,
        durationMin: 35,
      },
    ],
    "stage-2/quality/defect": [
      {
        itemCode: "TYRE-PCR-B3",
        defectType: "Ply misalign",
        qty: 12,
        totalProduced: 720,
      },
    ],
    "stage-2/quality/scrap": [
      { itemCode: "TYRE-PCR-B3", qty: 4, traceable: false },
    ],
  },
};

OEE_DRILL_BY_PLANT_SECTION["banmore/cur"] = {
  overall: { availability: 95.8, performance: 93.5, quality: 99.4 },
  machines: [
    {
      id: "tredge-1",
      name: "Tredge 1 (8 press)",
      availability: 96.5,
      performance: 94.0,
      quality: 99.5,
    },
    {
      id: "tredge-2",
      name: "Tredge 2 (8 press)",
      availability: 95.2,
      performance: 93.4,
      quality: 99.4,
    },
    {
      id: "tredge-3",
      name: "Tredge 3 (10 press)",
      availability: 94.8,
      performance: 92.6,
      quality: 99.2,
    },
    {
      id: "tredge-4",
      name: "Tredge 4 (10 press)",
      availability: 96.1,
      performance: 94.1,
      quality: 99.5,
    },
    {
      id: "tredge-5",
      name: "Tredge 5 (8 press)",
      availability: 95.4,
      performance: 93.2,
      quality: 99.3,
    },
    {
      id: "tredge-6",
      name: "Tredge 6 (6 press)",
      availability: 96.8,
      performance: 93.9,
      quality: 99.6,
    },
  ],
  subDrill: {
    "tredge-1/availability/breakdown": [
      {
        reasonCategory: "Mechanical",
        reason: "Bladder rupture",
        events: 1,
        durationMin: 32,
      },
    ],
    "tredge-3/availability/breakdown": [
      {
        reasonCategory: "Instrumentation",
        reason: "Pressure transducer fault",
        events: 1,
        durationMin: 26,
      },
    ],
    "tredge-3/availability/setupAdjustment": [],
    "tredge-3/performance/minorStoppage": [
      { reason: "Slow press cycle", events: 4, durationMin: 18 },
    ],
    "tredge-3/quality/defect": [
      {
        itemCode: "TYRE-PCR-C2",
        defectType: "Cure short",
        qty: 8,
        totalProduced: 980,
      },
    ],
    "tredge-3/quality/scrap": [],
  },
};

OEE_DRILL_BY_PLANT_SECTION["banmore/stk"] = {
  overall: { availability: 92.4, performance: 90.0, quality: 99.0 },
  machines: [
    {
      id: "stk-4roll-1",
      name: "4 Roll Line 1",
      availability: 93.6,
      performance: 90.8,
      quality: 99.2,
    },
    {
      id: "stk-4roll-2",
      name: "4 Roll Line 2",
      availability: 92.1,
      performance: 89.5,
      quality: 99.0,
    },
    {
      id: "stk-4roll-3",
      name: "4 Roll Line 3",
      availability: 91.5,
      performance: 89.7,
      quality: 98.8,
    },
  ],
  subDrill: {
    "stk-4roll-1/availability/breakdown": [
      {
        reasonCategory: "Mechanical",
        reason: "Roll alignment slip",
        events: 1,
        durationMin: 20,
      },
    ],
    "stk-4roll-2/performance/reducedSpeed": [
      { reason: "Material tension trim", events: 2, durationMin: 12 },
    ],
    "stk-4roll-3/quality/defect": [
      {
        itemCode: "STK-SHT-A1",
        defectType: "Thickness variance",
        qty: 28,
        totalProduced: 4200,
      },
    ],
    "stk-4roll-3/quality/scrap": [
      { itemCode: "STK-SHT-A1", qty: 12, traceable: false },
    ],
  },
};

/**
 * Downtime drill rows for TBM / Curing / Stock (spec 11). Lean but
 * realistic.
 */
DOWNTIME_DRILL_BY_PLANT_SECTION["banmore/tbm"] = [
  {
    reasonCategory: "Breakdown — Mechanical",
    machine: "BJ Modules",
    reason: "Conveyor drive slip",
    events: 1,
    durationMin: 32,
    lossHrs: 0.54,
  },
  {
    reasonCategory: "Breakdown — Electrical",
    machine: "Stage 2",
    reason: "Encoder failure",
    events: 1,
    durationMin: 28,
    lossHrs: 0.46,
  },
  {
    reasonCategory: "Setup — size change",
    machine: "VMI Max",
    reason: "Size changeover",
    events: 2,
    durationMin: 22,
    lossHrs: 0.37,
  },
  {
    reasonCategory: "PM",
    machine: "VMI Exium",
    reason: "Scheduled servo lubrication",
    events: 1,
    durationMin: 18,
    lossHrs: 0.3,
  },
  {
    reasonCategory: "Process",
    machine: "Stage 1",
    reason: "Material change wait",
    events: 2,
    durationMin: 12,
    lossHrs: 0.2,
  },
];

DOWNTIME_DRILL_BY_PLANT_SECTION["banmore/cur"] = [
  {
    reasonCategory: "Breakdown — Mechanical",
    machine: "Tredge 1 (8 press)",
    reason: "Bladder rupture",
    events: 1,
    durationMin: 32,
    lossHrs: 0.6,
  },
  {
    reasonCategory: "Breakdown — Instrumentation",
    machine: "Tredge 3 (10 press)",
    reason: "Pressure transducer fault",
    events: 1,
    durationMin: 26,
    lossHrs: 0.5,
  },
  {
    reasonCategory: "PM",
    machine: "Tredge 4 (10 press)",
    reason: "Scheduled bladder swap",
    events: 1,
    durationMin: 45,
    lossHrs: 0.9,
  },
  {
    reasonCategory: "Utility",
    machine: "All Tredges",
    reason: "Steam pressure low",
    events: 1,
    durationMin: 22,
    lossHrs: 2.2,
  },
];

DOWNTIME_DRILL_BY_PLANT_SECTION["banmore/stk"] = [
  {
    reasonCategory: "Breakdown — Mechanical",
    machine: "4 Roll Line 1",
    reason: "Roll alignment slip",
    events: 1,
    durationMin: 20,
    lossHrs: 0.33,
  },
  {
    reasonCategory: "Process",
    machine: "4 Roll Line 2",
    reason: "Material tension trim",
    events: 2,
    durationMin: 12,
    lossHrs: 0.2,
  },
  {
    reasonCategory: "Setup — FTC",
    machine: "4 Roll Line 3",
    reason: "Compound changeover",
    events: 1,
    durationMin: 28,
    lossHrs: 0.47,
  },
];

/**
 * Plan Compliance drill data for TBM / Curing / Stock (spec 11).
 * Machine-wise + SKU-wise variants.
 */
PLAN_COMPLIANCE_DRILL_BY_PLANT_SECTION["banmore/tbm"] = {
  skuWise: [
    { itemCode: "TYRE-PCR-A1", planned: 1400, actual: 1370 },
    { itemCode: "TYRE-PCR-A2", planned: 1200, actual: 1230 },
    { itemCode: "TYRE-PCR-B1", planned: 980, actual: 945 },
    { itemCode: "TYRE-PCR-B3", planned: 720, actual: 680 },
  ],
  machineWise: [
    { machine: "VMI Max", planned: 920, actual: 905 },
    { machine: "VMI Exium", planned: 860, actual: 855 },
    { machine: "BJ Modules", planned: 740, actual: 705 },
    { machine: "Stage 1", planned: 880, actual: 870 },
    { machine: "Stage 2", planned: 700, actual: 685 },
  ],
};

PLAN_COMPLIANCE_DRILL_BY_PLANT_SECTION["banmore/cur"] = {
  skuWise: [
    { itemCode: "TYRE-PCR-C1", planned: 1200, actual: 1190 },
    { itemCode: "TYRE-PCR-C2", planned: 980, actual: 920 },
    { itemCode: "TYRE-PCR-C3", planned: 1100, actual: 1080 },
  ],
  machineWise: [
    { machine: "Tredge 1 (8 press)", planned: 760, actual: 745 },
    { machine: "Tredge 2 (8 press)", planned: 740, actual: 730 },
    { machine: "Tredge 3 (10 press)", planned: 900, actual: 845 },
    { machine: "Tredge 4 (10 press)", planned: 880, actual: 875 },
    { machine: "Tredge 5 (8 press)", planned: 720, actual: 710 },
    { machine: "Tredge 6 (6 press)", planned: 540, actual: 535 },
  ],
};

PLAN_COMPLIANCE_DRILL_BY_PLANT_SECTION["banmore/stk"] = {
  skuWise: [
    { itemCode: "STK-SHT-A1", planned: 4200, actual: 4150 },
    { itemCode: "STK-SHT-A2", planned: 3600, actual: 3520 },
    { itemCode: "STK-SHT-B1", planned: 2800, actual: 2710 },
  ],
  machineWise: [
    { machine: "4 Roll Line 1", planned: 430, actual: 420 },
    { machine: "4 Roll Line 2", planned: 410, actual: 400 },
    { machine: "4 Roll Line 3", planned: 400, actual: 420 },
  ],
};
