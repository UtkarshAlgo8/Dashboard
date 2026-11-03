import assert from "node:assert/strict";
import test from "node:test";
import { readRcaPdfResponse } from "../src/controllers/rca.controller.js";

test("passes the PDF and its filename through", async () => {
  const upstream = new Response(new Uint8Array([37, 80, 68, 70]), {
    status: 200,
    headers: { "content-disposition": 'attachment; filename="RCA_Banbury_4.pdf"' },
  });
  const out = await readRcaPdfResponse(upstream);
  assert.equal(out.ok, true);
  assert.equal(out.pdf.toString(), "%PDF");
  assert.equal(out.disposition, 'attachment; filename="RCA_Banbury_4.pdf"');
});

test("falls back to RCA.pdf when the service sends no filename", async () => {
  const out = await readRcaPdfResponse(new Response("x", { status: 200 }));
  assert.equal(out.disposition, 'attachment; filename="RCA.pdf"');
});

test("a 4xx keeps its status and the service's detail text", async () => {
  const upstream = Response.json({ detail: "Photo larger than 15 MB" }, { status: 413 });
  assert.deepEqual(await readRcaPdfResponse(upstream), {
    ok: false,
    status: 413,
    message: "Photo larger than 15 MB",
  });
});

test("a 5xx without JSON becomes a 502 with the status in the message", async () => {
  const out = await readRcaPdfResponse(new Response("boom", { status: 500 }));
  assert.deepEqual(out, {
    ok: false,
    status: 502,
    message: "RCA export service answered 500",
  });
});
