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
