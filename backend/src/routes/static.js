import { Router } from "express";

/**
 * Static lookup endpoints — small lists the frontend renders for its
 * chrome. Same shape regardless of plant. No upstream calls; safe
 * to hit even before any data is loaded.
 *
 * Mount at /api/v1 (unscoped).
 */

export const router = Router();

const PLANTS = [
  {
    id: "banmore",
    name: "Banmore Plant",
    location: "Banmore",
    state: "Madhya Pradesh",
    tyreType: "PCR",
    enabled: true,
  },
  {
    id: "chennai",
    name: "Chennai Plant",
    location: "Chennai",
    state: "Tamil Nadu",
    tyreType: "PCR/TBR",
    enabled: false,
  },
  {
    id: "laksar",
    name: "Laksar Plant",
    location: "Laksar",
    state: "Uttarakhand",
    tyreType: "PCR/TBR",
    enabled: false,
  },
  {
    id: "mysore",
    name: "Mysore Plant",
    location: "Mysore",
    state: "Karnataka",
    tyreType: "PCR/TBR",
    enabled: false,
  },
];

const FUNCTIONS = [
  { id: "ph", name: "Plant Head", enabled: false },
  { id: "prod", name: "Production", enabled: true },
  { id: "qual", name: "Quality", enabled: false },
  { id: "tech", name: "Technical", enabled: false },
  { id: "eng", name: "Engineering", enabled: false },
];

const SECTIONS = [
  { id: "mix", name: "Mixing" },
  { id: "stk", name: "Stock" },
  { id: "tbm", name: "TBM" },
  { id: "cur", name: "Curing" },
];

// Inventory category is NOT present in gold_dummy (PM, 2026-05-27 —
// "Inventory data I will tell later, not added yet"). The tab is
// marked disabled so the frontend can show a "Phase 2" tooltip.
// When the data lands, flip `enabled: true` and add { id: "i" } to
// CATEGORY_LABEL in queries.js.
const CATEGORY_TABS = [
  { id: "p", code: "P", name: "Productivity", enabled: true },
  { id: "q", code: "Q", name: "Quality", enabled: true },
  { id: "c", code: "C", name: "Cost", enabled: true },
  { id: "m", code: "M", name: "Morale", enabled: true },
  { id: "s", code: "S", name: "Safety", enabled: true },
  { id: "i", code: "I", name: "Inventory", enabled: false },
];

router.get("/plants", (_req, res) => {
  res.json({ data: PLANTS });
});

router.get("/functions", (_req, res) => {
  res.json({ data: FUNCTIONS });
});

router.get("/sections", (_req, res) => {
  res.json({ data: SECTIONS });
});

router.get("/category-tabs", (_req, res) => {
  res.json({ data: CATEGORY_TABS });
});

export { PLANTS, FUNCTIONS, SECTIONS, CATEGORY_TABS };
