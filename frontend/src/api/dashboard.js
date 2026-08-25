import client from "./client.js";

const USE_MOCK = import.meta.env.VITE_USE_MOCK_DATA === "true";

/**
 * new_change.md C6/C14 — GET /dashboard/anchors.
 */
const anchorsPromises = new Map();

export function getAnchors(plantId = "banmore") {
  if (USE_MOCK) {
    return Promise.resolve({
      anchors: {
        "Curing|Production": "2026-07-20",
        "Curing|OEE": "2026-07-16",
        "Curing|Plan Compliance": "2026-07-20",
      },
      partialDays: {},
    });
  }
  if (!anchorsPromises.has(plantId)) {
    const query = new URLSearchParams({ plantId });
    const promise = client
      .get(`/dashboard/anchors?${query.toString()}`)
      .catch((err) => {
        anchorsPromises.delete(plantId);
        throw err;
      });
    anchorsPromises.set(plantId, promise);
  }
  return anchorsPromises.get(plantId);
}

/**
 * GET /dashboard/vocab?plantId=
 */
const vocabPromises = new Map();

export function getVocab(plantId = "banmore") {
  if (USE_MOCK) {
    return Promise.resolve({
      sections: ["Mixing", "Stock", "TBM", "Curing"],
      subSections: {
        Stock: ["4 Roll", "Extruder", "3 Roll", "Cutter", "Slitter", "Bead"],
      },
    });
  }
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
