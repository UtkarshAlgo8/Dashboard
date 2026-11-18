import { normalizeDemo } from "@/lib/anomaly/model.js";

let cachedWorkspace;

/**
 * Data-source boundary for CTP PdM. No speculative live endpoint is called.
 * Replace this provider once a backend contract is agreed; retain the normalized
 * workspace interface described in docs/anomaly-api-handoff.md.
 */
export async function getAnomalyWorkspace({ signal } = {}) {
  if (cachedWorkspace) return cachedWorkspace;
  const response = await fetch(
    `${import.meta.env.BASE_URL}anomaly/quintoplex-demo.json`,
    { signal },
  );
  if (!response.ok)
    throw new Error(`Could not load the demo export (${response.status}).`);
  const raw = await response.json();
  signal?.throwIfAborted();
  const model = normalizeDemo(raw);
  cachedWorkspace = model;
  return model;
}
