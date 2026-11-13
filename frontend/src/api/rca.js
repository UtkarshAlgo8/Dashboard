import client from "./client.js";
import { toPdfFormData } from "@/pages/engineering/rca/rcaPdfForm.js";

/** Post a PDF form to the dialog's configurable export endpoint. */
export async function postRcaPdfForm(endpoint, formData) {
  const res = await fetch(endpoint, { method: "POST", body: formData });
  if (!res.ok) {
    let message = `${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      if (body && body.detail) message = body.detail;
    } catch {
      /* not JSON */
    }
    throw new Error(message);
  }
  const disposition = res.headers.get("Content-Disposition") || "";
  const match = disposition.match(/filename="?([^";]+)"?/i);
  return { blob: await res.blob(), filename: match?.[1] };
}

/**
 * The RCA Why-Why record as a PDF of the official UTQM.00.SQ-156 sheet.
 *
 * Goes through the backend (POST /rca/pdf), which forwards to the RCA export
 * service, so the request carries the Bearer header like every other call.
 * A blob response skips the client's `{ data }` unwrapping; an error body
 * also arrives as a Blob, so its message is read out here.
 *
 * @param {object} record the dialog's output record
 * @returns {Promise<Blob>}
 */
export async function downloadRcaPdf(record) {
  try {
    return await client.post("/rca/pdf", toPdfFormData(record), {
      responseType: "blob",
      rawEnvelope: true,
      // Let the browser set multipart/form-data with its boundary.
      headers: { "Content-Type": undefined },
    });
  } catch (err) {
    const body = err?.response?.data;
    if (body instanceof Blob) {
      let message = err.message;
      try {
        message = JSON.parse(await body.text())?.error?.message ?? message;
      } catch {
        /* not JSON — keep axios's message */
      }
      throw new Error(message, { cause: err });
    }
    throw err;
  }
}
