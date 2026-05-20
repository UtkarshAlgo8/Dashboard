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
 * KPI shape (drives KpiCard rendering):
 *   id, name, value, unit, trend, trendFavourable, spark, target, drillable
 *
 * As subsequent specs (06, 07, 09) wire up real drills, the
 * `drillable: true` cards become interactive. Until then, clicking
 * a drillable card opens a placeholder panel.
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
  tbm: [],
  cur: [],
  stk: [],
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
