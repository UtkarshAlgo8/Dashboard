import client from "./client.js";
import { matchesSafetyContext } from "@/lib/safety.js";

/** Authenticated, read-only Safety requests; text type names are encoded, never parsed. */
export async function getSafety(input, { signal } = {}) {
  const params = new URLSearchParams({ plant: "Banmore", ...input });
  const data = await client.get(`/engineering/safety?${params}`, { signal });
  if (
    !matchesSafetyContext(input, data?.context) ||
    !Array.isArray(data?.rows) ||
    !data?.page ||
    !Object.hasOwn(data, "value")
  ) {
    throw new Error(
      "Safety returned missing data or a different selected scope.",
    );
  }
  return data;
}
