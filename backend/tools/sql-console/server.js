/**
 * Local SQL console for the gold layer.
 *
 * A dev-only scratchpad: type SQL, see rows. Reuses the ONE upstream
 * client (src/utils/upstream.js) so it inherits the API key from
 * backend/.env, the engine/table config, and the read-only SELECT|WITH
 * guard. It adds no new way to reach the data.
 *
 *   node tools/sql-console/server.js        # http://localhost:3099
 *   PORT=4000 node tools/sql-console/server.js
 *
 * Not mounted on the API app on purpose — arbitrary SQL must never be
 * reachable from the deployed backend.
 */
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runQuery, UpstreamError } from "../../src/utils/upstream.js";
import { config } from "../../src/config.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number.parseInt(process.env.PORT ?? "3099", 10);

/** Read the whole request body as UTF-8, capped so a stray POST can't OOM us. */
async function readBody(req, maxBytes = 1_000_000) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) throw new Error("Request body too large");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
  });
  res.end(body);
}

/**
 * Column order for the results grid. Upstream rows are objects keyed by
 * column name; JS preserves string-key insertion order, so the first
 * row's keys are the SELECT order. Later rows may carry extra keys when
 * the result is ragged, so union them in on the end.
 */
function columnsOf(rows) {
  const seen = new Set();
  for (const row of rows) {
    if (row && typeof row === "object") {
      for (const key of Object.keys(row)) seen.add(key);
    }
  }
  return [...seen];
}

async function handleQuery(req, res) {
  let sql;
  try {
    ({ sql } = JSON.parse(await readBody(req)));
  } catch (err) {
    return sendJson(res, 400, { error: `Bad request: ${err.message}` });
  }
  if (typeof sql !== "string" || sql.trim() === "") {
    return sendJson(res, 400, { error: "`sql` is required." });
  }

  const startedAt = Date.now();
  try {
    const rows = await runQuery(sql);
    return sendJson(res, 200, {
      rows,
      columns: columnsOf(rows),
      rowCount: rows.length,
      elapsedMs: Date.now() - startedAt,
    });
  } catch (err) {
    const status = err instanceof UpstreamError ? err.status : 500;
    return sendJson(res, status, {
      error: err.message,
      type: err.type ?? "ERROR",
      elapsedMs: Date.now() - startedAt,
    });
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === "POST" && url.pathname === "/query") {
    return handleQuery(req, res);
  }

  if (req.method === "GET" && url.pathname === "/meta") {
    return sendJson(res, 200, {
      engine: config.upstream.engine,
      table: config.upstream.sqlTable,
    });
  }

  if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) {
    const html = await fs.readFile(path.join(here, "index.html"), "utf8");
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    return res.end(html);
  }

  return sendJson(res, 404, { error: `No route for ${req.method} ${url.pathname}` });
});

server.listen(PORT, () => {
  console.log(`SQL console  →  http://localhost:${PORT}`);
  console.log(`engine=${config.upstream.engine}  table=${config.upstream.sqlTable}`);
});
