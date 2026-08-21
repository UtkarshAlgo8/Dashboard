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
    name: "Chennai Tyre Plant",
    sub: "Tamil Nadu",
    sx: 202.0,
    sy: 446.6,
    oee: 94.2,
    otif: 96.8,
    yield: 98.5,
    // CR-10: landing KPIs scoped to the active time-range window.
    curedTyreProduction: 8420,
    scrap: 38,
    scrapPct: 0.45,
  },
  {
    id: "banmore",
    name: "Banmore Tyre Plant",
    sub: "Gwalior, Madhya Pradesh",
    sx: 169.7,
    sy: 228.6,
    oee: 91.5,
    otif: 94.3,
    yield: 97.8,
    curedTyreProduction: 4280,
    scrap: 21,
    scrapPct: 0.49,
  },
  {
    id: "laksar",
    name: "Laksar Tyre Plant",
    sub: "Haridwar, Uttarakhand",
    sx: 167.6,
    sy: 170.2,
    oee: 93.1,
    otif: 95.6,
    yield: 98.1,
    curedTyreProduction: 7610,
    scrap: 31,
    scrapPct: 0.41,
  },
  {
    id: "mysore",
    name: "Mysore Tyre Plant",
    sub: "Karnataka",
    sx: 163.0,
    sy: 441.0,
    oee: 92.6,
    otif: 95.1,
    yield: 98.0,
    curedTyreProduction: 6840,
    scrap: 28,
    scrapPct: 0.41,
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
  { id: "mix", code: "MIX", name: "Mixing", oee: 91.5 },
  { id: "stk", code: "STK", name: "Stock", oee: 87.2 },
  { id: "tbm", code: "TBM", name: "TBM", oee: 82.4 },
  { id: "cur", code: "CUR", name: "Curing", oee: 88.1 },
];

/**
 * Production-dashboard category tabs (spec 04). Default active = "p"
 * (Productivity). BRD FR-P7 lists the codes + labels verbatim.
 * Inventory ("I") replaces the section view when active (BRD §6.13)
 * — spec 15 implements the Inventory page.
 */
// realdata.md §5: Cost / Morale / Safety shown but NOT clickable
// (enabled:false) — no data in the real set yet.
export const CATEGORY_TABS = [
  { id: "p", code: "P", name: "Productivity", enabled: true },
  { id: "q", code: "Q", name: "Quality", enabled: true },
  { id: "c", code: "C", name: "Cost", enabled: false },
  { id: "m", code: "M", name: "Morale", enabled: false },
  { id: "s", code: "S", name: "Safety", enabled: false },
  { id: "i", code: "I", name: "Inventory", enabled: true },
];

/**
 * Plant-card summary pinned at the bottom of the Production
 * dashboard sidebar (BRD FR-P6). Values are static mocks matching
 * the artifact's example numbers; replace with derived metrics when
 * the KPI engine arrives in spec 05+.
 */
export const PLANT_SUMMARIES = {
  banmore: { prodPct: 92, scrapPct: 1.05, ftqPct: 95.4, safeDays: 78 },
};

/**
 * Mixing > Productivity KPI definitions. Production card is a single
 * tile showing Master + Final combined (468 MT); compound selection
 * moves into the Production drill panel itself (spec-aligned with
 * docs/artifact.jsx).
 */
export const MIXING_PRODUCTIVITY_KPIS = [
  {
    id: "oee",
    name: "OEE",
    value: 91.5,
    unit: "%",
    trend: 1.2,
    trendFavourable: true,
    spark: [89.5, 90.1, 90.4, 90.8, 91.0, 91.2, 91.3, 91.5],
    target: 92,
    drillable: true,
  },
  {
    id: "production",
    name: "Production",
    value: 468,
    unit: "MT",
    trend: 2.5,
    trendFavourable: true,
    spark: [433, 441, 446, 453, 458, 461, 465, 468],
    target: 500,
    drillable: true,
  },
  {
    id: "downtime",
    name: "Total Downtime",
    value: 126,
    unit: "min",
    trend: -2.5,
    trendFavourable: true,
    spark: [210, 192, 180, 168, 150, 138, 132, 126],
    target: 120,
    drillable: true,
  },
  {
    id: "plan-compliance",
    name: "Plan Compliance",
    value: 92,
    unit: "%",
    trend: -0.5,
    trendFavourable: false,
    spark: [94, 93.5, 93, 92.8, 92.5, 92.3, 92.1, 92],
    target: 95,
    drillable: true,
  },
];

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
  // TBM Production drill: keyed by tyre family per artifact (Passenger
  // Radial / LT Radial / SCV Radial). Row shape (CR-05, Q-PD-01):
  //   { sku, machine, planned, actual }
  // `machine` is required so the View-by Machine / Machine+SKU lenses
  // in ProductionDrillPanel can aggregate without synthesising. TBM
  // machine pool comes from the artifact: VMI Max, VMI Exium, BJ
  // Modules, Stage 1, Stage 2.
  "banmore/tbm": {
    "passenger-radial": [
      {
        sku: "145/80R13 Ultima Neo 75S TL",
        machine: "VMI Max",
        planned: 400,
        actual: 328,
      },
      {
        sku: "155R13 ULTIMAX PC1 90/89S TL",
        machine: "VMI Exium",
        planned: 450,
        actual: 383,
      },
      {
        sku: "175/70R13 ULTIMA NEO 82T TL",
        machine: "BJ Modules",
        planned: 500,
        actual: 440,
      },
      {
        sku: "185/65R15 ULTIMA SPORT 88H TL",
        machine: "Stage 1",
        planned: 550,
        actual: 495,
      },
      {
        sku: "195/55R16 ULTIMA SPORT 87V TL",
        machine: "Stage 2",
        planned: 600,
        actual: 552,
      },
      {
        sku: "175/70R13 ULTIMA NEO 82T EUEX TL",
        machine: "VMI Max",
        planned: 500,
        actual: 470,
      },
    ],
    "lt-radial": [
      {
        sku: "7.00R15 STEEL KING 10PR L TT",
        machine: "VMI Max",
        planned: 300,
        actual: 255,
      },
      {
        sku: "7.00R15 STEEL KING 12PR L TT",
        machine: "VMI Exium",
        planned: 340,
        actual: 296,
      },
      {
        sku: "215/75R15 115/113S 10PR SK TL",
        machine: "BJ Modules",
        planned: 380,
        actual: 335,
      },
      {
        sku: "7.00R16 STEEL KING 12PR TT",
        machine: "Stage 1",
        planned: 420,
        actual: 378,
      },
      {
        sku: "8.25R16 JETWAY JUH5 14PR TT",
        machine: "Stage 2",
        planned: 460,
        actual: 423,
      },
    ],
    "scv-radial": [
      {
        sku: "235/65R16 STEELKING+ 121P TL",
        machine: "VMI Max",
        planned: 200,
        actual: 160,
      },
      {
        sku: "195R15 ULTIMA NXT 106S TL",
        machine: "VMI Exium",
        planned: 230,
        actual: 193,
      },
      {
        sku: "215/75R15 STEEL KING+ TL",
        machine: "BJ Modules",
        planned: 260,
        actual: 226,
      },
      {
        sku: "205/65R16 ULTIMA NXT 107T TL",
        machine: "Stage 1",
        planned: 290,
        actual: 261,
      },
    ],
  },
  // Curing Production drill: same shape as TBM. Machine pool from
  // the artifact: Tredge 1–6. Higher volumes.
  "banmore/cur": {
    "passenger-radial": [
      {
        sku: "145/80R13 Ultima Neo 75S TL",
        machine: "Tredge 1",
        planned: 1200,
        actual: 1062,
      },
      {
        sku: "155R13 ULTIMAX PC1 90/89S TL",
        machine: "Tredge 2",
        planned: 1350,
        actual: 1228,
      },
      {
        sku: "175/70R13 ULTIMA NEO 82T TL",
        machine: "Tredge 3",
        planned: 1500,
        actual: 1400,
      },
      {
        sku: "185/65R15 ULTIMA SPORT 88H TL",
        machine: "Tredge 4",
        planned: 1650,
        actual: 1551,
      },
      {
        sku: "195/55R16 ULTIMA SPORT 87V TL",
        machine: "Tredge 5",
        planned: 1800,
        actual: 1710,
      },
    ],
    "lt-radial": [
      {
        sku: "7.00R15 STEEL KING 10PR L TT",
        machine: "Tredge 1",
        planned: 900,
        actual: 783,
      },
      {
        sku: "7.00R15 STEEL KING 12PR L TT",
        machine: "Tredge 2",
        planned: 980,
        actual: 872,
      },
      {
        sku: "215/75R15 115/113S 10PR SK TL",
        machine: "Tredge 3",
        planned: 1050,
        actual: 945,
      },
      {
        sku: "7.00R16 STEEL KING 12PR TT",
        machine: "Tredge 4",
        planned: 1120,
        actual: 1030,
      },
    ],
    "scv-radial": [
      {
        sku: "235/65R16 STEELKING+ 121P TL",
        machine: "Tredge 1",
        planned: 700,
        actual: 595,
      },
      {
        sku: "195R15 ULTIMA NXT 106S TL",
        machine: "Tredge 2",
        planned: 780,
        actual: 686,
      },
      {
        sku: "215/75R15 STEEL KING+ TL",
        machine: "Tredge 3",
        planned: 850,
        actual: 765,
      },
      {
        sku: "205/65R16 ULTIMA NXT 107T TL",
        machine: "Tredge 4",
        planned: 920,
        actual: 855,
      },
    ],
  },
  // Stock Production drill: keyed by `${stockSelector}/${category}`.
  // The categories per sub-selector come from the artifact's stkProd
  // routing table (artifact.jsx). Machine pools per sub-selector also
  // come from the artifact: 4 Roll #1/#2, Duplex/Triplex/Quadraplex,
  // 3 Roll #1/#2, LTBC/HTBC, Slitter-1/Slitter-2.
  "banmore/stk/4roll": {
    "4-roll-production": [
      {
        sku: "145/80R13 Ultima Neo 75S TL",
        machine: "4 Roll #1",
        planned: 80,
        actual: 68,
      },
      {
        sku: "155R13 ULTIMAX PC1 90/89S TL",
        machine: "4 Roll #2",
        planned: 100,
        actual: 87,
      },
      {
        sku: "175/70R13 ULTIMA NEO 82T TL",
        machine: "4 Roll #1",
        planned: 120,
        actual: 106,
      },
      {
        sku: "185/65R15 ULTIMA SPORT 88H TL",
        machine: "4 Roll #2",
        planned: 140,
        actual: 126,
      },
      {
        sku: "195/55R16 ULTIMA SPORT 87V TL",
        machine: "4 Roll #1",
        planned: 160,
        actual: 148,
      },
    ],
  },
  "banmore/stk/extruder": {
    "sidewall-production": [
      {
        sku: "145/80R13 Ultima Neo 75S TL",
        machine: "Duplex",
        planned: 90,
        actual: 78,
      },
      {
        sku: "155R13 ULTIMAX PC1 90/89S TL",
        machine: "Triplex",
        planned: 110,
        actual: 98,
      },
      {
        sku: "175/70R13 ULTIMA NEO 82T TL",
        machine: "Quadraplex",
        planned: 130,
        actual: 117,
      },
      {
        sku: "185/65R15 ULTIMA SPORT 88H TL",
        machine: "Duplex",
        planned: 150,
        actual: 138,
      },
    ],
    "tread-production": [
      {
        sku: "145/80R13 Ultima Neo 75S TL",
        machine: "Duplex",
        planned: 70,
        actual: 61,
      },
      {
        sku: "155R13 ULTIMAX PC1 90/89S TL",
        machine: "Triplex",
        planned: 85,
        actual: 76,
      },
      {
        sku: "175/70R13 ULTIMA NEO 82T TL",
        machine: "Quadraplex",
        planned: 100,
        actual: 91,
      },
      {
        sku: "185/65R15 ULTIMA SPORT 88H TL",
        machine: "Triplex",
        planned: 115,
        actual: 108,
      },
    ],
  },
  "banmore/stk/3roll": {
    "inner-liner-production": [
      {
        sku: "145/80R13 Ultima Neo 75S TL",
        machine: "3 Roll #1",
        planned: 60,
        actual: 51,
      },
      {
        sku: "155R13 ULTIMAX PC1 90/89S TL",
        machine: "3 Roll #2",
        planned: 75,
        actual: 66,
      },
      {
        sku: "175/70R13 ULTIMA NEO 82T TL",
        machine: "3 Roll #1",
        planned: 90,
        actual: 82,
      },
      {
        sku: "185/65R15 ULTIMA SPORT 88H TL",
        machine: "3 Roll #2",
        planned: 105,
        actual: 98,
      },
    ],
  },
  "banmore/stk/cutter": {
    "ply-production": [
      {
        sku: "145/80R13 Ultima Neo 75S TL",
        machine: "LTBC",
        planned: 50,
        actual: 43,
      },
      {
        sku: "155R13 ULTIMAX PC1 90/89S TL",
        machine: "HTBC",
        planned: 65,
        actual: 58,
      },
      {
        sku: "175/70R13 ULTIMA NEO 82T TL",
        machine: "LTBC",
        planned: 80,
        actual: 72,
      },
    ],
    "belt-production": [
      {
        sku: "145/80R13 Ultima Neo 75S TL",
        machine: "LTBC",
        planned: 55,
        actual: 48,
      },
      {
        sku: "155R13 ULTIMAX PC1 90/89S TL",
        machine: "HTBC",
        planned: 70,
        actual: 63,
      },
      {
        sku: "175/70R13 ULTIMA NEO 82T TL",
        machine: "HTBC",
        planned: 85,
        actual: 78,
      },
    ],
  },
  "banmore/stk/slitter": {
    "cap-strip-production": [
      {
        sku: "145/80R13 Ultima Neo 75S TL",
        machine: "Slitter-1",
        planned: 40,
        actual: 35,
      },
      {
        sku: "155R13 ULTIMAX PC1 90/89S TL",
        machine: "Slitter-2",
        planned: 55,
        actual: 49,
      },
      {
        sku: "175/70R13 ULTIMA NEO 82T TL",
        machine: "Slitter-1",
        planned: 70,
        actual: 64,
      },
    ],
    "chaffer-production": [
      {
        sku: "145/80R13 Ultima Neo 75S TL",
        machine: "Slitter-1",
        planned: 45,
        actual: 39,
      },
      {
        sku: "155R13 ULTIMAX PC1 90/89S TL",
        machine: "Slitter-2",
        planned: 60,
        actual: 54,
      },
      {
        sku: "175/70R13 ULTIMA NEO 82T TL",
        machine: "Slitter-2",
        planned: 75,
        actual: 69,
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
    drillable: true,
  },
  {
    id: "downtime",
    name: "Total Downtime",
    value: 228,
    unit: "min",
    trend: -5.0,
    trendFavourable: true,
    spark: [300, 282, 270, 258, 246, 240, 234, 228],
    target: 180,
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
    drillable: true,
  },
  {
    id: "downtime",
    name: "Total Downtime",
    value: 276,
    unit: "min",
    trend: -2.3,
    trendFavourable: true,
    spark: [312, 300, 294, 288, 282, 282, 276, 276],
    target: 240,
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
    drillable: true,
  },
  {
    id: "downtime",
    name: "Total Downtime",
    value: 246,
    unit: "min",
    trend: -1.4,
    trendFavourable: true,
    spark: [276, 270, 264, 258, 252, 252, 246, 246],
    target: 210,
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
    extruder: STK_4ROLL_PRODUCTIVITY,
    "3roll": STK_4ROLL_PRODUCTIVITY,
    cutter: STK_4ROLL_PRODUCTIVITY,
    slitter: STK_4ROLL_PRODUCTIVITY,
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

/**
 * @deprecated retained only to keep prior imports compiling — the live
 * data now comes from the section-aware builder below. Not exported.
 */
const _LEGACY_OTHER_TAB_TEMPLATES = {
  q: [
    {
      id: "ftq",
      name: "First Time Quality",
      value: 98.4,
      unit: "%",
      trend: 0.3,
      trendFavourable: true,
      spark: [97.9, 98.0, 98.1, 98.2, 98.3, 98.3, 98.4, 98.4],
      target: 99,
      drillable: false,
    },
    {
      id: "defect-rate",
      name: "Defect Rate",
      value: 1.6,
      unit: "%",
      trend: -0.2,
      trendFavourable: true,
      spark: [2.1, 2.0, 1.9, 1.8, 1.7, 1.7, 1.6, 1.6],
      target: 1.0,
      drillable: false,
    },
    {
      id: "ncm-hold",
      name: "NCM Hold",
      value: 142,
      unit: "kg",
      trend: -8.4,
      trendFavourable: true,
      spark: [180, 168, 162, 158, 152, 148, 145, 142],
      target: 100,
      drillable: false,
    },
    {
      id: "customer-complaints",
      name: "Customer Complaints",
      value: 3,
      unit: "count",
      trend: -25.0,
      trendFavourable: true,
      spark: [5, 5, 4, 4, 4, 3, 3, 3],
      target: 0,
      drillable: false,
    },
  ],
  c: [
    {
      id: "cost-per-unit",
      name: "Cost per Unit",
      value: 248,
      unit: "₹",
      trend: -1.2,
      trendFavourable: true,
      spark: [256, 254, 252, 251, 250, 249, 248, 248],
      target: 240,
      drillable: false,
    },
    {
      id: "energy-cost",
      name: "Energy Cost",
      value: 36.5,
      unit: "₹/unit",
      trend: 1.8,
      trendFavourable: false,
      spark: [34.6, 35.0, 35.4, 35.7, 36.0, 36.2, 36.4, 36.5],
      target: 34,
      drillable: false,
    },
    {
      id: "conversion-cost",
      name: "Conversion Cost",
      value: 92,
      unit: "₹/unit",
      trend: -0.6,
      trendFavourable: true,
      spark: [95, 94, 93, 93, 92, 92, 92, 92],
      target: 88,
      drillable: false,
    },
    {
      id: "material-cost",
      name: "Material Cost",
      value: 156,
      unit: "₹/unit",
      trend: 0.4,
      trendFavourable: false,
      spark: [154, 154, 155, 155, 155, 156, 156, 156],
      target: 150,
      drillable: false,
    },
  ],
  d: [
    {
      id: "otif",
      name: "OTIF",
      value: 94.3,
      unit: "%",
      trend: 0.4,
      trendFavourable: true,
      spark: [93.4, 93.6, 93.8, 93.9, 94.0, 94.1, 94.2, 94.3],
      target: 95,
      drillable: false,
    },
    {
      id: "schedule-adherence",
      name: "Schedule Adherence",
      value: 92.7,
      unit: "%",
      trend: -0.3,
      trendFavourable: false,
      spark: [93.4, 93.2, 93.0, 92.9, 92.8, 92.7, 92.7, 92.7],
      target: 95,
      drillable: false,
    },
    {
      id: "plan-vs-actual",
      name: "Plan vs Actual",
      value: 96.8,
      unit: "%",
      trend: 0.5,
      trendFavourable: true,
      spark: [95.6, 95.9, 96.2, 96.4, 96.5, 96.6, 96.7, 96.8],
      target: 100,
      drillable: false,
    },
    {
      id: "order-lead-time",
      name: "Order Lead Time",
      value: 4.6,
      unit: "days",
      trend: -3.8,
      trendFavourable: true,
      spark: [5.6, 5.4, 5.2, 5.0, 4.9, 4.7, 4.6, 4.6],
      target: 4,
      drillable: false,
    },
  ],
  m: [
    {
      id: "attendance",
      name: "Attendance",
      value: 96.2,
      unit: "%",
      trend: 0.3,
      trendFavourable: true,
      spark: [95.3, 95.5, 95.7, 95.8, 95.9, 96.0, 96.1, 96.2],
      target: 97,
      drillable: false,
    },
    {
      id: "manpower-vs-plan",
      name: "Manpower vs Plan",
      value: 98.1,
      unit: "%",
      trend: 0.1,
      trendFavourable: true,
      spark: [97.6, 97.7, 97.8, 97.9, 97.9, 98.0, 98.0, 98.1],
      target: 100,
      drillable: false,
    },
    {
      id: "training-hours",
      name: "Training Hours",
      value: 184,
      unit: "hrs",
      trend: 6.4,
      trendFavourable: true,
      spark: [156, 160, 165, 170, 173, 177, 181, 184],
      target: 200,
      drillable: false,
    },
    {
      id: "engagement-score",
      name: "Engagement Score",
      value: 82.5,
      unit: "%",
      trend: 1.6,
      trendFavourable: true,
      spark: [79.8, 80.3, 80.8, 81.2, 81.6, 82.0, 82.3, 82.5],
      target: 85,
      drillable: false,
    },
  ],
  s: [
    {
      id: "days-without-incident",
      name: "Days Without Incident",
      value: 142,
      unit: "days",
      trend: null,
      trendFavourable: true,
      spark: [136, 137, 138, 139, 140, 141, 142, 142],
      target: 180,
      drillable: false,
    },
    {
      id: "near-misses",
      name: "Near Misses",
      value: 4,
      unit: "count",
      trend: -33.3,
      trendFavourable: true,
      spark: [7, 6, 6, 5, 5, 4, 4, 4],
      target: 0,
      drillable: false,
    },
    {
      id: "safety-observations",
      name: "Safety Observations",
      value: 38,
      unit: "count",
      trend: 8.6,
      trendFavourable: true,
      spark: [32, 33, 34, 35, 36, 37, 38, 38],
      target: 40,
      drillable: false,
    },
    {
      id: "audit-score",
      name: "Audit Score",
      value: 88.5,
      unit: "%",
      trend: 1.2,
      trendFavourable: true,
      spark: [85.6, 86.2, 86.8, 87.2, 87.6, 88.0, 88.3, 88.5],
      target: 95,
      drillable: false,
    },
  ],
};

/**
 * Per-section deltas. Multiply numeric KPI values by these per
 * section so each section's view shows distinct but plausible
 * numbers. Spark + target also adjust.
 */
const SECTION_VARIANT_FACTORS = {
  mix: 1.0,
  tbm: 1.06,
  cur: 0.97,
  stk: 1.02,
};

function applyFactor(kpi, factor) {
  if (factor === 1.0) return kpi;
  // Trend % and string fields are not scaled. Targets stay as
  // documented targets (independent of current scale).
  const scale = (n) => (typeof n === "number" ? +(n * factor).toFixed(2) : n);
  return {
    ...kpi,
    value:
      typeof kpi.value === "number"
        ? +(kpi.value * factor).toFixed(2)
        : kpi.value,
    spark: kpi.spark?.map(scale) ?? kpi.spark,
  };
}

void _LEGACY_OTHER_TAB_TEMPLATES;
void SECTION_VARIANT_FACTORS;
void applyFactor;

/**
 * Per-section card sets for the Quality, Cost, Morale and Safety
 * tabs. Cards within a tab are identical across all four sections —
 * only the drill data (machines, SKUs, defect reasons, areas) varies
 * per section, matching docs/artifact.jsx#buildKpis (lines 930–962).
 *
 * Drill metadata is embedded on each KPI under `drill`:
 *   { type: "table", title, cols, rows }   — generic table drill
 *   { type: "budget", allocated, spent, consumedPct }  — Cost > Budget Util.
 *   null                                   — non-drillable card
 */

const SECTION_MACHINES = {
  mix: ["Banbury 1", "Banbury 2", "Banbury 3", "Banbury 4", "Banbury 5"],
  tbm: ["VMI Max", "VMI Exium", "BJ Modules", "Stage 1", "Stage 2"],
  cur: ["Tredge 1", "Tredge 2", "Tredge 3", "Tredge 4", "Tredge 5", "Tredge 6"],
  stk: ["4 Roll #1", "Duplex", "3 Roll #1", "LTBC", "Slitter-1"],
};

const SECTION_DEFECT_REASONS = {
  mix: ["Viscosity NC", "Off-Spec", "Cure Rate NC", "Contaminated"],
  tbm: ["Splice Open", "Ply Wrinkle", "Belt Edge", "Bead Fault"],
  cur: ["Bladder Mark", "Flash", "Porosity", "Under-cure"],
  stk: ["Width OOS", "Gauge OOS", "Surface", "Bias Angle"],
};

const SECTION_AREAS = {
  mix: ["Banbury Hall", "Mill Area", "Batch-off", "Staff"],
  tbm: ["VMI Section", "Stage 1/2", "BJ Area", "Staff"],
  cur: ["Tredge 1-2", "Tredge 3-4", "Tredge 5-6", "Staff"],
  stk: ["Calender", "Extruder", "Cutter", "Staff"],
};

const SECTION_TRAIN_AREAS = {
  mix: ["Banbury Operators", "Mill Operators", "Batch-off", "Supervisors"],
  tbm: ["VMI Operators", "Stage Operators", "BJ Operators", "Supervisors"],
  cur: ["Press Operators", "Mould Team", "Loader Operators", "Supervisors"],
  stk: ["Calender Ops", "Extruder Ops", "Cutter Ops", "Supervisors"],
};

const SECTION_SAFETY_AREAS = {
  mix: ["Banbury Hall", "Mill Area", "Batch-off", "Chemical Store"],
  tbm: ["VMI Bay", "Stage 1/2 Bay", "BJ Bay", "Store Area"],
  cur: ["Tredge 1-2", "Tredge 3-4", "Tredge 5-6", "Mould Shop"],
  stk: ["Calender Bay", "Extruder Bay", "Cutter Area", "Store"],
};

const SECTION_INCIDENT_AREA = {
  mix: "Banbury",
  tbm: "VMI Bay",
  cur: "Tredge",
  stk: "Calender",
};

// Representative SKU + compound lists per section (artifact constants).
const TYRE_PCR = [
  "145/80R13 Ultima Neo 75S TL",
  "155R13 ULTIMAX PC1 90/89S TL",
  "175/70R13 ULTIMA NEO 82T TL",
  "175/70R13 ULTIMA NEO 82T EUEX TL",
  "185/65R15 ULTIMA SPORT 88H TL",
  "195/55R16 ULTIMA SPORT 87V TL",
];
const TYRE_LTR = [
  "7.00R15 STEEL KING 10PR L TT",
  "215/75R15 115/113S 10PR SK TL",
];
const MIX_FINAL_COMPOUNDS = ["MS66", "MT3708", "MT273", "ML405", "MT3704"];

const SECTION_SKUS = {
  mix: MIX_FINAL_COMPOUNDS,
  tbm: [...TYRE_PCR, ...TYRE_LTR],
  cur: [...TYRE_PCR, ...TYRE_LTR],
  stk: TYRE_PCR,
};

// Per-section base scrap %, used to vary Quality KPI values per artifact.
const SECTION_SCRAP_PCT = { mix: 0.5, tbm: 1.8, cur: 0.9, stk: 1.1 };
// Per-section Specific Power baseline (kWh/MT) per artifact.
const SECTION_SPEC_POWER = { mix: 312, tbm: 345, cur: 380, stk: 285 };

const TQM_PILLARS = [
  ["5S / Housekeeping", 4.2, 5],
  ["Kaizen / CI", 3.5, 5],
  ["QC Circle", 3.8, 5],
  ["Suggestion Scheme", 3.6, 5],
  ["PM Pillar", 4.0, 5],
];

const SUGGESTION_ROWS = [
  ["Quality", 18, 12, 6, 85],
  ["Safety", 12, 10, 2, 42],
  ["Productivity", 15, 8, 7, 120],
  ["Cost Reduction", 8, 5, 3, 95],
];

const NEAR_MISS_ROWS = [
  ["Unsafe Act", 5, "38%", "4 Closed, 1 Open"],
  ["Unsafe Condition", 4, "31%", "3 Closed, 1 Open"],
  ["Housekeeping", 2, "15%", "Closed"],
  ["Electrical", 1, "8%", "Open"],
];

function buildQualityKpis(section) {
  const skus = SECTION_SKUS[section];
  const machines = SECTION_MACHINES[section];
  const reasons = SECTION_DEFECT_REASONS[section];
  const sc = SECTION_SCRAP_PCT[section];

  const ftqValue = +(100 - sc - 0.5).toFixed(1);
  const defectScrap = Math.round(sc * 50);

  return [
    {
      id: "ftq",
      name: "FTQ",
      value: ftqValue,
      unit: "%",
      trend: 0.3,
      trendFavourable: true,
      spark: [95, 95.5, 95.8, 96, 96.2, 96.4, 96.6, ftqValue],
      target: 99,
      drillable: true,
      drill: {
        type: "table",
        title: "Machine-wise FTQ",
        cols: ["Machine", "FTQ %", "Defects", "Top Defect"],
        rows: machines
          .slice(0, 6)
          .map((m, i) => [
            m,
            (98 - i * 1.5).toFixed(1) + "%",
            3 + i * 3,
            reasons[i % reasons.length],
          ]),
      },
    },
    {
      id: "ds",
      name: "Defect + Scrap",
      value: defectScrap,
      unit: "nos",
      trend: -5,
      trendFavourable: true,
      spark: [40, 38, 35, 32, 30, 28, 26, defectScrap],
      target: 0,
      drillable: true,
      drill: {
        type: "table",
        title: "Defect + Scrap Detail",
        cols: ["SKU", "Machine", "Issue Type", "Reason"],
        rows: skus
          .slice(0, 8)
          .map((sk, i) => [
            sk,
            machines[i % machines.length],
            i % 2 === 0 ? "Defect" : "Scrap",
            reasons[i % reasons.length],
          ]),
      },
    },
    {
      id: "sr",
      name: "Scrap Rate",
      value: sc,
      unit: "%",
      trend: -0.5,
      trendFavourable: true,
      spark: [sc + 0.4, sc + 0.3, sc + 0.2, sc + 0.1, sc, sc, sc, sc],
      target: 0.5,
      drillable: true,
      drill: {
        type: "table",
        title: "Scrap Detail",
        cols: ["SKU", "Machine", "Reason", "Qty"],
        rows: skus
          .slice(0, 5)
          .map((sk, i) => [
            sk,
            machines[i % machines.length],
            reasons[i % reasons.length],
            2 + i * 2,
          ]),
      },
    },
    {
      id: "ncm",
      name: "NCM Hold",
      value: 5,
      unit: "batches",
      trend: -20,
      trendFavourable: true,
      spark: [10, 9, 8, 7, 7, 6, 6, 5],
      target: 0,
      drillable: true,
      drill: {
        type: "table",
        title: "NCM Hold Details",
        cols: ["SKU", "Batch", "# Batches", "Kgs", "Hold Reason"],
        rows: skus
          .slice(0, 5)
          .map((sk, i) => [
            sk,
            "B-" + (2840 + i * 3),
            1 + Math.floor(i / 2),
            250 + i * 80,
            reasons[i % reasons.length],
          ]),
      },
    },
  ];
}

function buildCostKpis(section) {
  const machines = SECTION_MACHINES[section];
  const sc = SECTION_SCRAP_PCT[section];
  const spc = SECTION_SPEC_POWER[section];

  return [
    {
      id: "spc",
      name: "Specific Power",
      value: spc,
      unit: "kWh/MT",
      trend: -1.5,
      trendFavourable: true,
      spark: [spc + 18, spc + 13, spc + 8, spc + 4, spc + 2, spc, spc, spc],
      target: spc - 12,
      drillable: true,
      drill: {
        type: "table",
        title: "Machine-wise Specific Power",
        cols: ["Machine", "kWh", "Output", "Sp. Power", "Target", "Variance"],
        rows: machines.map((m, i) => {
          const kwh = 280 + i * 25;
          const outMt = 40 + i * 8;
          const sp = +(kwh / outMt).toFixed(1);
          return [m, kwh, outMt + " MT", sp, 6.5, +(sp - 6.5).toFixed(1)];
        }),
      },
    },
    {
      id: "scrc",
      name: "Scrap Cost",
      value: +(sc * 8).toFixed(1),
      unit: "₹L",
      trend: -3,
      trendFavourable: true,
      spark: [10, 9.5, 9, 8.5, 8, 8, 8, +(sc * 8).toFixed(1)],
      target: 5,
      drillable: false,
    },
    {
      id: "bud",
      name: "Budget Util.",
      value: 85,
      unit: "%",
      trend: 0,
      trendFavourable: true,
      spark: [80, 81, 82, 83, 84, 84, 85, 85],
      target: 90,
      drillable: true,
      drill: {
        type: "budget",
        allocated: 28.0,
        spent: 23.8,
        consumedPct: 85,
        unit: "₹ L",
      },
    },
  ];
}

function buildMoraleKpis(section) {
  const areas = SECTION_AREAS[section];
  const trainAreas = SECTION_TRAIN_AREAS[section];

  return [
    {
      id: "ab",
      name: "Absenteeism",
      value: 3.2,
      unit: "%",
      trend: -0.3,
      trendFavourable: true,
      spark: [4.2, 4.0, 3.8, 3.6, 3.5, 3.4, 3.3, 3.2],
      target: 2,
      drillable: true,
      drill: {
        type: "table",
        title: "Area-wise Absenteeism",
        cols: ["Area", "Total", "Present", "Absent", "Rate"],
        rows: areas.map((a, i) => {
          const total = 40 + i * 10;
          return [
            a,
            total,
            38 + i * 10,
            2,
            ((2 / total) * 100).toFixed(1) + "%",
          ];
        }),
      },
    },
    {
      id: "tq",
      name: "TQM Score",
      value: 3.8,
      unit: "/5",
      trend: 0.3,
      trendFavourable: true,
      spark: [3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.8],
      target: 4.5,
      drillable: true,
      drill: {
        type: "table",
        title: "TQM by Pillar",
        cols: ["Pillar", "Score", "Target", "Gap"],
        rows: TQM_PILLARS.map(([p, s, t]) => [p, s, t, +(s - t).toFixed(1)]),
      },
    },
    {
      id: "sg",
      name: "Suggestions",
      value: 1.2,
      unit: "/person",
      trend: 0.2,
      trendFavourable: true,
      spark: [0.7, 0.8, 0.9, 1.0, 1.0, 1.1, 1.1, 1.2],
      target: 2,
      drillable: true,
      drill: {
        type: "table",
        title: "Suggestion Status",
        cols: ["Category", "Submitted", "Implemented", "Pending", "Savings ₹K"],
        rows: SUGGESTION_ROWS,
      },
    },
    {
      id: "tr",
      name: "Training",
      value: 4.5,
      unit: "hrs/m",
      trend: 0.5,
      trendFavourable: true,
      spark: [3.2, 3.5, 3.8, 4.0, 4.2, 4.3, 4.4, 4.5],
      target: 6,
      drillable: true,
      drill: {
        type: "table",
        title: "Training by Area",
        cols: ["Area", "Plan Hrs", "Actual Hrs", "Compliance %"],
        rows: trainAreas.map((a, i) => {
          const plan = 5 + i;
          const act = +(4 + i * 0.5).toFixed(1);
          return [a, plan, act, ((act / plan) * 100).toFixed(0) + "%"];
        }),
      },
    },
  ];
}

function buildSafetyKpis(section) {
  const sArea = SECTION_INCIDENT_AREA[section];
  const auditAreas = SECTION_SAFETY_AREAS[section];

  return [
    {
      id: "ri",
      name: "Reportable",
      value: 0,
      unit: "nos",
      trend: 0,
      trendFavourable: true,
      spark: [0, 0, 0, 0, 0, 0, 0, 0],
      target: 0,
      drillable: true,
      drill: {
        type: "table",
        title: "Incident Log (90 Days)",
        cols: ["Date", "Type", "Area", "Description", "Status"],
        rows: [
          [
            "05-Apr",
            "First Aid",
            sArea,
            "Minor burn from hot surface",
            "Closed",
          ],
          [
            "18-Mar",
            "Near Miss",
            sArea,
            "Material splash near operator",
            "Closed",
          ],
          [
            "02-Mar",
            "Near Miss",
            sArea,
            "Guard found missing on conveyor",
            "Fixed",
          ],
        ],
      },
    },
    {
      id: "fa",
      name: "First Aid",
      value: 3,
      unit: "nos",
      trend: -25,
      trendFavourable: true,
      spark: [6, 5, 5, 4, 4, 4, 3, 3],
      target: 0,
      drillable: true,
      drill: {
        type: "table",
        title: "First Aid Details",
        cols: ["Date", "Area", "Injury", "Root Cause"],
        rows: [
          ["05-Apr", sArea, "Minor burn", "Hot surface contact"],
          ["18-Mar", sArea, "Cut finger", "Sharp edge on tool"],
          ["02-Mar", sArea, "Eye irritation", "Chemical splash"],
        ],
      },
    },
    {
      id: "nm",
      name: "Near Miss",
      value: 12,
      unit: "nos",
      trend: 25,
      trendFavourable: true,
      spark: [5, 6, 7, 8, 9, 10, 11, 12],
      target: null,
      drillable: true,
      drill: {
        type: "table",
        title: "Near Miss Categories",
        cols: ["Category", "Count", "Share", "Status"],
        rows: NEAR_MISS_ROWS,
      },
    },
    {
      id: "sa",
      name: "Safety Audit",
      value: 94.2,
      unit: "%",
      trend: 1.2,
      trendFavourable: true,
      spark: [90, 91, 92, 92.5, 93, 93.5, 94, 94.2],
      target: 100,
      drillable: true,
      drill: {
        type: "table",
        title: "Audit by Area",
        cols: ["Area", "Score", "NC Major", "NC Minor", "Observations"],
        rows: auditAreas.map((a, i) => [
          a,
          (96 - i * 1.5).toFixed(1) + "%",
          0,
          1 + i,
          3 + i * 2,
        ]),
      },
    },
  ];
}

const OTHER_TAB_KPIS_BY_SECTION = {};
for (const section of ["mix", "tbm", "cur", "stk"]) {
  OTHER_TAB_KPIS_BY_SECTION[section] = {
    q: buildQualityKpis(section),
    c: buildCostKpis(section),
    m: buildMoraleKpis(section),
    s: buildSafetyKpis(section),
  };
}

export { OTHER_TAB_KPIS_BY_SECTION };

/**
 * Mock signed-in user for Phase 1 (spec 14). Single role per
 * Q-USR-01; no auth per Q-AUTH-01. Replaces any real session
 * lookup. When the backend lands, swap this for a fetched user.
 */
export const MOCK_USER = {
  name: "Rakesh Patel",
  role: "Plant Head",
  plant: "Banmore Tyre Plant",
  email: "rakesh.patel@jktyre.example",
  phone: "+91 98765 43210",
  employeeId: "JK-PH-00142",
  joinedDate: "2018-04-12",
  avatarInitials: "PH",
};

/**
 * Inventory data per plant (spec 15) per BRD §6.13. Three chart
 * groups (Production / Stock / Compound) totalling 12 bars across
 * the categories listed in FR-P62. Each bar has a small item list
 * (FR-P65) and history rolls up all 12 categories over the last
 * 7 days (FR-P68).
 */
export const INVENTORY_BY_PLANT = {
  banmore: {
    groups: {
      production: {
        title: "Production",
        bars: [
          {
            id: "fg",
            label: "FG",
            today: 1240,
            yesterday: 1180,
            unit: "tyres",
            items: [
              {
                itemCode: "FG-PCR-A1",
                description: "PCR 195/65R15",
                liveStock: 420,
                unit: "tyres",
              },
              {
                itemCode: "FG-PCR-A2",
                description: "PCR 205/65R16",
                liveStock: 380,
                unit: "tyres",
              },
              {
                itemCode: "FG-PCR-B1",
                description: "PCR 175/65R14",
                liveStock: 285,
                unit: "tyres",
              },
              {
                itemCode: "FG-PCR-B3",
                description: "PCR 215/55R17",
                liveStock: 155,
                unit: "tyres",
              },
            ],
          },
          {
            id: "cured",
            label: "Cured",
            today: 980,
            yesterday: 945,
            unit: "tyres",
            items: [
              {
                itemCode: "CUR-PCR-A1",
                description: "Cured PCR 195/65R15",
                liveStock: 320,
                unit: "tyres",
              },
              {
                itemCode: "CUR-PCR-A2",
                description: "Cured PCR 205/65R16",
                liveStock: 290,
                unit: "tyres",
              },
              {
                itemCode: "CUR-PCR-B1",
                description: "Cured PCR 175/65R14",
                liveStock: 240,
                unit: "tyres",
              },
              {
                itemCode: "CUR-PCR-B3",
                description: "Cured PCR 215/55R17",
                liveStock: 130,
                unit: "tyres",
              },
            ],
          },
          {
            id: "green",
            label: "Green",
            today: 620,
            yesterday: 670,
            unit: "tyres",
            items: [
              {
                itemCode: "GRN-PCR-A1",
                description: "Green PCR 195/65R15",
                liveStock: 210,
                unit: "tyres",
              },
              {
                itemCode: "GRN-PCR-A2",
                description: "Green PCR 205/65R16",
                liveStock: 180,
                unit: "tyres",
              },
              {
                itemCode: "GRN-PCR-B1",
                description: "Green PCR 175/65R14",
                liveStock: 145,
                unit: "tyres",
              },
              {
                itemCode: "GRN-PCR-B3",
                description: "Green PCR 215/55R17",
                liveStock: 85,
                unit: "tyres",
              },
            ],
          },
        ],
      },
      stock: {
        title: "Stock Inventory",
        bars: [
          {
            id: "tread",
            label: "Tread",
            today: 1820,
            yesterday: 1880,
            unit: "kg",
            items: [
              {
                itemCode: "STK-TRD-001",
                description: "Tread compound 8mm",
                liveStock: 620,
                unit: "kg",
              },
              {
                itemCode: "STK-TRD-002",
                description: "Tread compound 10mm",
                liveStock: 540,
                unit: "kg",
              },
              {
                itemCode: "STK-TRD-003",
                description: "Tread compound 12mm",
                liveStock: 660,
                unit: "kg",
              },
            ],
          },
          {
            id: "belt",
            label: "Belt",
            today: 940,
            yesterday: 920,
            unit: "kg",
            items: [
              {
                itemCode: "STK-BLT-001",
                description: "Steel belt 0/0",
                liveStock: 480,
                unit: "kg",
              },
              {
                itemCode: "STK-BLT-002",
                description: "Steel belt 22°/22°",
                liveStock: 460,
                unit: "kg",
              },
            ],
          },
          {
            id: "ply",
            label: "Ply",
            today: 760,
            yesterday: 780,
            unit: "kg",
            items: [
              {
                itemCode: "STK-PLY-001",
                description: "Body ply 1",
                liveStock: 420,
                unit: "kg",
              },
              {
                itemCode: "STK-PLY-002",
                description: "Body ply 2",
                liveStock: 340,
                unit: "kg",
              },
            ],
          },
          {
            id: "capstrip",
            label: "Capstrip",
            today: 460,
            yesterday: 440,
            unit: "kg",
            items: [
              {
                itemCode: "STK-CAP-001",
                description: "Capstrip nylon",
                liveStock: 280,
                unit: "kg",
              },
              {
                itemCode: "STK-CAP-002",
                description: "Capstrip aramid",
                liveStock: 180,
                unit: "kg",
              },
            ],
          },
          {
            id: "sidewall",
            label: "Sidewall",
            today: 880,
            yesterday: 900,
            unit: "kg",
            items: [
              {
                itemCode: "STK-SDW-001",
                description: "Sidewall A1",
                liveStock: 480,
                unit: "kg",
              },
              {
                itemCode: "STK-SDW-002",
                description: "Sidewall A2",
                liveStock: 400,
                unit: "kg",
              },
            ],
          },
          {
            id: "iliner",
            label: "I.Liner",
            today: 520,
            yesterday: 540,
            unit: "kg",
            items: [
              {
                itemCode: "STK-ILR-001",
                description: "Inner liner butyl",
                liveStock: 320,
                unit: "kg",
              },
              {
                itemCode: "STK-ILR-002",
                description: "Inner liner halo",
                liveStock: 200,
                unit: "kg",
              },
            ],
          },
          {
            id: "bead",
            label: "Bead",
            today: 380,
            yesterday: 360,
            unit: "kg",
            items: [
              {
                itemCode: "STK-BED-001",
                description: "Bead wire 1mm",
                liveStock: 220,
                unit: "kg",
              },
              {
                itemCode: "STK-BED-002",
                description: "Bead wire 1.3mm",
                liveStock: 160,
                unit: "kg",
              },
            ],
          },
        ],
      },
      compound: {
        title: "Compound Inventory",
        bars: [
          {
            id: "final",
            label: "Final",
            today: 2860,
            yesterday: 2950,
            unit: "kg",
            items: [
              {
                itemCode: "COMP-FIN-001",
                description: "Final compound A1",
                liveStock: 720,
                unit: "kg",
              },
              {
                itemCode: "COMP-FIN-002",
                description: "Final compound A2",
                liveStock: 680,
                unit: "kg",
              },
              {
                itemCode: "COMP-FIN-003",
                description: "Final compound B1",
                liveStock: 560,
                unit: "kg",
              },
              {
                itemCode: "COMP-FIN-005",
                description: "Final compound B3",
                liveStock: 480,
                unit: "kg",
              },
              {
                itemCode: "COMP-FIN-006",
                description: "Final compound C1",
                liveStock: 420,
                unit: "kg",
              },
            ],
          },
          {
            id: "master",
            label: "Master",
            today: 4120,
            yesterday: 4080,
            unit: "kg",
            items: [
              {
                itemCode: "COMP-MST-001",
                description: "Master batch A",
                liveStock: 1080,
                unit: "kg",
              },
              {
                itemCode: "COMP-MST-002",
                description: "Master batch B",
                liveStock: 920,
                unit: "kg",
              },
              {
                itemCode: "COMP-MST-003",
                description: "Master batch C",
                liveStock: 880,
                unit: "kg",
              },
              {
                itemCode: "COMP-MST-005",
                description: "Master batch D",
                liveStock: 720,
                unit: "kg",
              },
              {
                itemCode: "COMP-MST-007",
                description: "Master batch E",
                liveStock: 520,
                unit: "kg",
              },
            ],
          },
        ],
      },
    },
    history: [
      // Last 7 days, oldest first. All 12 categories per FR-P68.
      {
        date: "2026-05-14",
        fg: 1170,
        cured: 920,
        green: 660,
        tread: 1900,
        belt: 905,
        ply: 770,
        capstrip: 430,
        sidewall: 920,
        iLiner: 555,
        bead: 350,
        final: 3010,
        master: 4040,
      },
      {
        date: "2026-05-15",
        fg: 1190,
        cured: 935,
        green: 645,
        tread: 1880,
        belt: 910,
        ply: 765,
        capstrip: 435,
        sidewall: 910,
        iLiner: 545,
        bead: 355,
        final: 2980,
        master: 4055,
      },
      {
        date: "2026-05-16",
        fg: 1200,
        cured: 950,
        green: 640,
        tread: 1870,
        belt: 915,
        ply: 770,
        capstrip: 440,
        sidewall: 905,
        iLiner: 545,
        bead: 358,
        final: 2965,
        master: 4065,
      },
      {
        date: "2026-05-17",
        fg: 1210,
        cured: 955,
        green: 650,
        tread: 1860,
        belt: 918,
        ply: 775,
        capstrip: 442,
        sidewall: 905,
        iLiner: 540,
        bead: 360,
        final: 2950,
        master: 4072,
      },
      {
        date: "2026-05-18",
        fg: 1220,
        cured: 960,
        green: 660,
        tread: 1850,
        belt: 920,
        ply: 775,
        capstrip: 445,
        sidewall: 902,
        iLiner: 538,
        bead: 362,
        final: 2940,
        master: 4078,
      },
      {
        date: "2026-05-19",
        fg: 1230,
        cured: 970,
        green: 668,
        tread: 1835,
        belt: 922,
        ply: 775,
        capstrip: 450,
        sidewall: 901,
        iLiner: 530,
        bead: 368,
        final: 2900,
        master: 4090,
      },
      {
        date: "2026-05-20",
        fg: 1240,
        cured: 980,
        green: 620,
        tread: 1820,
        belt: 940,
        ply: 760,
        capstrip: 460,
        sidewall: 880,
        iLiner: 520,
        bead: 380,
        final: 2860,
        master: 4120,
      },
    ],
  },
};
