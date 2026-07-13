/**
 * Static lookup data + handlers — small lists the frontend renders for
 * its chrome. Same shape regardless of plant; no upstream calls.
 */

// sx / sy are SVG coordinates for the India map markers (viewBox
// 0..MAP_W × 0..MAP_H, see frontend/src/lib/indiaMap.js). `sub` is the
// subtitle shown on the plant card and the map hover popover. oe/otif/
// yield are the headline KPI values surfaced on the card.
export const PLANTS = [
  {
    id: "banmore",
    name: "Banmore Plant",
    sub: "Gwalior, Madhya Pradesh",
    location: "Banmore",
    state: "Madhya Pradesh",
    tyreType: "PCR",
    sx: 169.7,
    sy: 228.6,
    oe: 91.5,
    otif: 94.3,
    yield: 97.8,
    enabled: true,
  },
  {
    id: "chennai",
    name: "Chennai Plant",
    sub: "Tamil Nadu",
    location: "Chennai",
    state: "Tamil Nadu",
    tyreType: "PCR/TBR",
    sx: 202.0,
    sy: 446.6,
    oe: 94.2,
    otif: 96.8,
    yield: 98.5,
    enabled: false,
  },
  {
    id: "laksar",
    name: "Laksar Plant",
    sub: "Haridwar, Uttarakhand",
    location: "Laksar",
    state: "Uttarakhand",
    tyreType: "PCR/TBR",
    sx: 167.6,
    sy: 170.2,
    oe: 93.1,
    otif: 95.6,
    yield: 98.1,
    enabled: false,
  },
  {
    id: "mysore",
    name: "Mysore Plant",
    sub: "Karnataka",
    location: "Mysore",
    state: "Karnataka",
    tyreType: "PCR/TBR",
    sx: 163.0,
    sy: 441.0,
    oe: 92.6,
    otif: 95.1,
    yield: 98.0,
    enabled: false,
  },
];

export const FUNCTIONS = [
  { id: "ph", name: "Plant Head", enabled: false },
  { id: "prod", name: "Production", enabled: true },
  { id: "qual", name: "Quality", enabled: false },
  { id: "tech", name: "Technical", enabled: false },
  { id: "eng", name: "Engineering", enabled: false },
];

export const SECTIONS = [
  { id: "mix", name: "Mixing" },
  { id: "stk", name: "Stock" },
  { id: "tbm", name: "TBM" },
  { id: "cur", name: "Curing" },
];

// realdata.md §5: only Productivity / Quality / Inventory exist in the real
// data. Cost / Morale / Safety are shown as tabs but NOT clickable
// (enabled:false → the frontend renders them disabled with a tooltip) until
// that data arrives. Inventory is enabled (category = 'Inventory').
export const CATEGORY_TABS = [
  { id: "p", code: "P", name: "Productivity", enabled: true },
  { id: "q", code: "Q", name: "Quality", enabled: true },
  { id: "c", code: "C", name: "Cost", enabled: false },
  { id: "m", code: "M", name: "Morale", enabled: false },
  { id: "s", code: "S", name: "Safety", enabled: false },
  { id: "i", code: "I", name: "Inventory", enabled: true },
];

export function getPlants(_req, res) {
  // Only Banmore has real data (Phase 1). The oe/otif/yield numbers on the
  // other plants were placeholder constants — do NOT surface fabricated KPI
  // values for a plant we have no data for. Null them out for disabled
  // plants so the card/map render a blank ("—") instead of a fake number.
  const data = PLANTS.map((p) =>
    p.enabled ? p : { ...p, oe: null, otif: null, yield: null },
  );
  res.json({ data });
}

export function getFunctions(_req, res) {
  res.json({ data: FUNCTIONS });
}

export function getSections(_req, res) {
  res.json({ data: SECTIONS });
}

export function getCategoryTabs(_req, res) {
  res.json({ data: CATEGORY_TABS });
}
