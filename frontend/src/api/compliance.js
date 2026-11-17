import client from "./client.js";

/** Individual published compliance snapshots for a bounded trend window. */
export function getComplianceHistory({ id, from, to, granularity }) {
  const params = new URLSearchParams({
    plant: "BTP",
    id,
    from,
    to,
    granularity,
  });
  return client.get(`/compliance/history?${params}`);
}

/** Exact BTP Gold snapshot; no department/category or custom-range filters. */
export function getCompliance({
  ids,
  date,
  granularity,
  level = "overall",
  section,
}) {
  const params = new URLSearchParams({
    plant: "BTP",
    kpis: ids.join(","),
    date,
    granularity,
    level,
  });
  if (section != null) params.set("section", section);
  return client.get(`/compliance?${params}`);
}
