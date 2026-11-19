// Local-only integration check: no live SigNoz or database required.
import http from "node:http";
import { spawn } from "node:child_process";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
const payloads = [];
const collector = http.createServer((req, res) => {
  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", () => {
    payloads.push({ path: req.url, body: JSON.parse(body) });
    res.setHeader("Content-Type", "application/json");
    res.end("{}");
  });
});
await new Promise((resolve) => collector.listen(0, "127.0.0.1", resolve));
const code = `
import { register } from 'node:module';
register('@opentelemetry/instrumentation/hook.mjs', import.meta.url);
const { startTelemetry, shutdownTelemetry } = await import('./src/telemetry.js');
await startTelemetry();
const {default: express} = await import('express');
const {default: mysql} = await import('mysql2');
const {logger} = await import('./src/utils/logger.js');
const app=express();
app.get('/smoke',async(req,res)=>{
 logger.info('correlated smoke log');
 const db=mysql.createConnection({host:'127.0.0.1',port:1,user:'test',connectTimeout:500});
 db.on('error',()=>{});
 await new Promise(resolve=>db.query("SELECT * FROM users WHERE email='secret@example.com' AND id=123",()=>{db.destroy();resolve();}));
 res.json({ok:true});
});
const server=app.listen(0,'127.0.0.1');
await new Promise(resolve=>server.once('listening',resolve));
const {context,propagation,ROOT_CONTEXT}=await import('@opentelemetry/api');
await context.with(propagation.extract(ROOT_CONTEXT,{traceparent:'00-11111111111111111111111111111111-2222222222222222-01'}),()=>fetch('http://127.0.0.1:'+server.address().port+'/smoke?password=secret'));
await new Promise(resolve=>server.close(resolve));
await shutdownTelemetry();
`;
const child = spawn(process.execPath, ["--input-type=module", "-e", code], {
  cwd: fileURLToPath(new URL("../", import.meta.url)),
  env: {
    ...process.env,
    OTEL_ENABLED: "true",
    OTEL_EXPORTER_OTLP_ENDPOINT: `http://127.0.0.1:${collector.address().port}`,
    OTEL_TRACES_SAMPLER: "always_on",
    OTEL_LOGS_EXPORTER: "otlp",
    OTEL_METRICS_EXPORTER: "otlp",
    OTEL_SDK_DISABLED: "false",
    OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: `http://127.0.0.1:${collector.address().port}/v1/traces`,
    OTEL_EXPORTER_OTLP_METRICS_ENDPOINT: `http://127.0.0.1:${collector.address().port}/v1/metrics`,
    OTEL_EXPORTER_OTLP_LOGS_ENDPOINT: `http://127.0.0.1:${collector.address().port}/v1/logs`,
    OTEL_EXPORTER_OTLP_HEADERS: "",
    OTEL_RESOURCE_ATTRIBUTES: "deployment.environment.name=test",
    LOG_LEVEL: "info",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
let output = "";
child.stdout.on("data", (b) => (output += b));
child.stderr.on("data", (b) => (output += b));
const timeout = setTimeout(() => child.kill("SIGKILL"), 20000);
const exitCode = await new Promise((resolve) => child.once("exit", resolve));
clearTimeout(timeout);
collector.close();
if (exitCode !== 0) console.error(output);
assert.equal(exitCode, 0);
const traces = payloads
  .filter((p) => p.path === "/v1/traces")
  .flatMap((p) =>
    p.body.resourceSpans.flatMap((r) => r.scopeSpans.flatMap((s) => s.spans)),
  );
const logs = payloads
  .filter((p) => p.path === "/v1/logs")
  .flatMap((p) =>
    p.body.resourceLogs.flatMap((r) =>
      r.scopeLogs.flatMap((s) => s.logRecords),
    ),
  );

assert(
  traces.some(
    (s) =>
      s.name.includes("GET") &&
      s.traceId.toLowerCase() === "11111111111111111111111111111111",
  ),
);
assert(
  traces.some((s) =>
    s.attributes.some(
      (a) => a.key === "db.system" && a.value.stringValue === "mysql",
    ),
  ),
);
assert(
  logs.some(
    (l) =>
      l.body.stringValue === "correlated smoke log" &&
      l.traceId.toLowerCase() === "11111111111111111111111111111111",
  ),
);
assert(payloads.some((p) => p.path === "/v1/metrics"));
assert(!JSON.stringify(payloads).includes("secret@example.com"));
assert(!JSON.stringify(payloads).includes("password=secret"));
console.log(
  "PASS: correlated HTTP/Express/MySQL spans, masked SQL, OTLP logs and runtime metrics",
);
