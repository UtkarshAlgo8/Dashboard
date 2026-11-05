import client from "./client.js";

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
