/**
 * RCA Why-Why PDF export.
 *
 *   POST /rca/pdf   multipart: record (JSON string), before?, after? (images)
 *
 * The body is streamed unchanged to the RCA export service
 * (RCA_SERVICE_URL/api/rca/pdf), which fills the official UTQM.00.SQ-156
 * sheet and returns it as a PDF. The service's own error text (`detail`) is
 * passed back in the standard error envelope so the dialog can show it.
 */
import { Readable } from "node:stream";
import { config } from "../config.js";

function fail(res, status, code, message) {
  return res.status(status).json({ error: { code, message } });
}

/**
 * Turn the export service's reply into what the browser gets: the PDF and
 * its filename, or an error with the service's `detail` text.
 * @param {Response} upstream
 * @returns {Promise<{ ok: true, pdf: Buffer, disposition: string } |
 *   { ok: false, status: number, message: string }>}
 */
export async function readRcaPdfResponse(upstream) {
  if (upstream.ok) {
    return {
      ok: true,
      pdf: Buffer.from(await upstream.arrayBuffer()),
      disposition:
        upstream.headers.get("content-disposition") ??
        'attachment; filename="RCA.pdf"',
    };
  }
  let message = `RCA export service answered ${upstream.status}`;
  try {
    const body = await upstream.json();
    if (body?.detail) message = String(body.detail);
  } catch {
    /* not JSON — keep the status text */
  }
  // 4xx is the form's fault and passes through; anything else is a bad gateway.
  const status = upstream.status >= 400 && upstream.status < 500 ? upstream.status : 502;
  return { ok: false, status, message };
}

export async function postPdf(req, res) {
  const contentType = req.headers["content-type"] ?? "";
  if (!contentType.startsWith("multipart/form-data")) {
    return fail(res, 400, "BAD_REQUEST", "Expected multipart/form-data with a `record` field");
  }

  let upstream;
  try {
    upstream = await fetch(`${config.rca.serviceUrl}/api/rca/pdf`, {
      method: "POST",
      headers: { "content-type": contentType },
      body: Readable.toWeb(req),
      duplex: "half",
      signal: AbortSignal.timeout(config.rca.timeoutMs),
    });
  } catch (err) {
    const timedOut = err?.name === "TimeoutError";
    return fail(
      res,
      timedOut ? 504 : 502,
      "RCA_SERVICE_UNAVAILABLE",
      timedOut
        ? "RCA export service timed out"
        : "RCA export service is not reachable",
    );
  }

  const out = await readRcaPdfResponse(upstream);
  if (!out.ok) return fail(res, out.status, "RCA_EXPORT_FAILED", out.message);
  res.set("Content-Type", "application/pdf");
  res.set("Content-Disposition", out.disposition);
  // Lets the browser read the filename cross-origin.
  res.set("Access-Control-Expose-Headers", "Content-Disposition");
  return res.send(out.pdf);
}
