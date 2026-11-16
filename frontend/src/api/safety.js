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

/** Server-generated complete scoped workbook; never export only the currently displayed page. */
export async function getSafetyExport(input, { signal } = {}) {
  const params = new URLSearchParams({ plant: "Banmore", ...input });
  try {
    const blob = await client.get(`/engineering/safety/export?${params}`, {
      signal,
      responseType: "blob",
      rawEnvelope: true,
      timeout: 60000,
    });
    if (
      !(blob instanceof Blob) ||
      !blob.size ||
      blob.type !==
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )
      throw new Error("Safety export did not return an Excel workbook.");
    return blob;
  } catch (error) {
    const body = error?.response?.data;
    if (body instanceof Blob) {
      let message = error.message;
      try {
        message = JSON.parse(await body.text())?.error?.message ?? message;
      } catch {
        // Preserve the transport error when no JSON error envelope is available.
      }
      throw new Error(message, { cause: error });
    }
    throw error;
  }
}
