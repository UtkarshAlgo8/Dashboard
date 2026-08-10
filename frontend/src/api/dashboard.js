import client from "./client.js";

/**
 * new_change.md C6/C14 — GET /dashboard/anchors.
 *
 * Returns:
 *   anchors     { "<section>|<kpi_name>": "yyyy-mm-dd" }
 *               that KPI's OWN newest DAY date, within its section. Cards must
 *               anchor to this instead of one global latest date: the global
 *               date comes from Production (2026-07-20) while OEE ends 16–17
 *               July, so every OEE card would query a day with zero rows and
 *               render blank with a dead drill.
 *   partialDays { "<section>|<yyyy-mm-dd>": <shiftCount 1|2> }
 *               the section's LATEST day when its shifts are incomplete — the
 *               day is still in progress, so a spike against the previous full
 *               day is a pure artefact and must be suppressed (C14 / S-3).
 *
 * The payload is small and effectively static for a session, so it is fetched
 * ONCE and the promise memoized. A failed fetch clears the cache so a later
 * render can retry.
 */
const anchorsPromises = new Map();

export function getAnchors(plantId = "banmore") {
  if (!anchorsPromises.has(plantId)) {
    const query = new URLSearchParams({ plantId });
    const promise = client.get(`/dashboard/anchors?${query.toString()}`).catch((err) => {
      anchorsPromises.delete(plantId);
      throw err;
    });
    anchorsPromises.set(plantId, promise);
  }
  return anchorsPromises.get(plantId);
}

/**
 * GET /dashboard/vocab?plantId= — the vocabulary THIS plant actually
 * records (sections, categories, granularities, tyre types, and the
 * sub-sections of each section).
 *
 * Pickers must be built from this, not from a frozen list: CTP's Stock has
 * EBR / TDA / Super Assembly and no 4 Roll or Slitter, so Banmore's list
 * selects a sub-section that matches no CTP row and the section renders
 * empty. Static per session, so the promise is memoized per plant.
 */
const vocabPromises = new Map();

export function getVocab(plantId = "banmore") {
  if (!vocabPromises.has(plantId)) {
    const query = new URLSearchParams({ plantId });
    const promise = client
      .get(`/dashboard/vocab?${query.toString()}`)
      .catch((err) => {
        vocabPromises.delete(plantId);
        throw err;
      });
    vocabPromises.set(plantId, promise);
  }
  return vocabPromises.get(plantId);
}
