import client from "@/api/client.js";

// A live snapshot has no dashboard date, shift, or granularity inputs.
export async function getLiveRunningSkus() {
  const snapshot = await client.get("/dashboard/live-running-skus");
  if (!Array.isArray(snapshot?.machines)) {
    throw new Error("Live running SKU snapshot unavailable");
  }
  return snapshot;
}
