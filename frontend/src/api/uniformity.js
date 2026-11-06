import client from "./client.js";

const entries = new Map();
const pending = new Map();
const TTL = 60000;
const MAX_ENTRIES = 64;
let active = 0;
const queue = [];

async function boundedGet(url) {
  if (active >= 2) {
    if (queue.length >= 16)
      throw new Error("Uniformity is busy. Please retry shortly.");
    await new Promise((resolve) => queue.push(resolve));
  } else active++;
  try {
    return await client.get(url);
  } finally {
    if (queue.length) queue.shift()();
    else active--;
  }
}

/** Exact-context, page-sized cache and in-flight deduplication. Never prefetch. */
export function getUniformityPage(kind, scope) {
  if (!["gold", "barcodes", "points"].includes(kind))
    return Promise.reject(new Error("Unsupported Uniformity action."));
  const params = new URLSearchParams(
    Object.entries({ plant: "BANMORE", ...scope })
      .filter(([, value]) => value != null)
      .sort(([a], [b]) => a.localeCompare(b)),
  );
  const url = `/quality/product/uniformity/${kind}?${params}`;
  const hit = entries.get(url);
  if (hit && hit.expires > Date.now()) return Promise.resolve(hit.data);
  if (pending.has(url)) return pending.get(url);
  const request = boundedGet(url)
    .then((data) => {
      if (!Array.isArray(data?.rows) || data.truncated)
        throw new Error(
          "Uniformity returned an incomplete page. Narrow the date range and retry.",
        );
      if (entries.size >= MAX_ENTRIES)
        entries.delete(entries.keys().next().value);
      entries.set(url, { data, expires: Date.now() + TTL });
      return data;
    })
    .finally(() => pending.delete(url));
  pending.set(url, request);
  return request;
}
