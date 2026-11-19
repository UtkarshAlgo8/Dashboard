# Self-hosted SigNoz integration

This branch prepares the frontend and backend to send OpenTelemetry data to an
existing self-hosted SigNoz collector. It does not install or deploy SigNoz,
ClickHouse, the query/UI services, or email alert infrastructure.

## What is captured

| Service | Telemetry |
| --- | --- |
| `jk-dashboard-frontend` | API XHR (including Axios) and fetch spans; W3C context propagated to the configured backend; uncaught error/rejection types |
| `jk-dashboard-backend` | HTTP server/client, Express routes, MySQL2 queries, Redis and fetch spans; Node runtime metrics; Winston application logs correlated with trace/span IDs |

Backend logs use JSON on stdout, even with telemetry disabled. Winston forwards
logs to the OpenTelemetry Logs SDK only when instrumentation is enabled. Existing
application log calls use the shared logger; arbitrary `console` calls added in
future code will not be exported automatically.

Both services default to telemetry **disabled**. No user credentials, auth headers,
request/response bodies, DOM inputs, or exception messages/stacks are explicitly
captured. Export filtering strips query strings, fragments and password-reset
path tokens from URLs; MySQL literals are replaced with `?`. Database identifiers,
URL paths, error types and infrastructure addresses remain visible. Do not put
secrets in resource attributes or custom log messages.

## Backend configuration

Add to `backend/.env.local` (or `.env` on the server). Existing application variables
are still required. Environment variables supplied by Docker take precedence.

```dotenv
OTEL_ENABLED=true
OTEL_SERVICE_NAME=jk-dashboard-backend
OTEL_EXPORTER_OTLP_ENDPOINT=http://signoz-otel-collector:4318
OTEL_EXPORTER_OTLP_PROTOCOL=http/json
OTEL_TRACES_SAMPLER=parentbased_traceidratio
OTEL_TRACES_SAMPLER_ARG=1
OTEL_RESOURCE_ATTRIBUTES=deployment.environment.name=production,service.version=YOUR_RELEASE
LOG_LEVEL=info
```

`OTEL_EXPORTER_OTLP_ENDPOINT` is a **base URL**, without `/v1/traces`. Optional
`OTEL_EXPORTER_OTLP_TRACES_ENDPOINT`, `OTEL_EXPORTER_OTLP_METRICS_ENDPOINT`, and
`OTEL_EXPORTER_OTLP_LOGS_ENDPOINT` take full signal URLs. Export uses OTLP/HTTP JSON;
port `4317` is gRPC and does not work with these exporters.

Run normally:

```sh
cd backend
npm ci
npm start
# or: npm run dev
```

These commands use `src/bootstrap.js`, which loads env, registers the ESM
instrumentation hook and initializes the SDK **before** importing application
modules. Running `node src/index.js` directly bypasses telemetry. SIGTERM/SIGINT
stop accepting requests and flush the SDK, with a 10-second shutdown deadline.
Collector outages use bounded batches/timeouts and do not fail application requests.

For Docker, ensure the backend and collector can reach one another (usually a
shared Docker network). `localhost` inside a container refers to that container,
not the host or another service. The existing backend Docker CMD already uses
`npm start`. You can pass the OTel settings with `docker run --env-file ...` or
individual `-e` arguments. No deployment has been performed.

## Frontend configuration

Add to `frontend/.env.local`, then rebuild/restart Vite:

```dotenv
VITE_OTEL_ENABLED=true
VITE_OTEL_SERVICE_NAME=jk-dashboard-frontend
VITE_OTEL_EXPORTER_OTLP_TRACES_ENDPOINT=https://telemetry.example.com/v1/traces
VITE_OTEL_TRACES_SAMPLER_ARG=1
VITE_APP_VERSION=YOUR_RELEASE
VITE_API_BASE_URL=https://dashboard-api.example.com/api/v1
```

The endpoint must be reachable **from the user's browser**. A Docker-only hostname
such as `signoz-otel-collector` will not work in a public browser. HTTPS dashboards
need an HTTPS telemetry endpoint to avoid mixed-content blocking. All `VITE_*`
values are public; do not put a collector ingestion secret in the bundle.

The browser SDK loads before App/API modules. It instruments only the configured
API prefix, skips collector/third-party requests, and propagates `traceparent` only
to that API. Existing backend CORS reflects requested headers, so `traceparent`
preflights are accepted for allowed frontend origins. If another proxy handles API
CORS, it must also allow `traceparent` and `tracestate` and forward those headers.

Docker variables are **build arguments**, not runtime Nginx environment settings:

```sh
docker build -t jk-dashboard-frontend \
  --build-arg VITE_API_BASE_URL=https://dashboard-api.example.com/api/v1 \
  --build-arg VITE_OTEL_ENABLED=true \
  --build-arg VITE_OTEL_SERVICE_NAME=jk-dashboard-frontend \
  --build-arg VITE_OTEL_EXPORTER_OTLP_TRACES_ENDPOINT=https://telemetry.example.com/v1/traces \
  --build-arg VITE_OTEL_TRACES_SAMPLER_ARG=1 \
  --build-arg VITE_APP_VERSION=YOUR_RELEASE \
  frontend
```

The existing `npm run deploy` frontend command uses the default Docker build
arguments, so it keeps telemetry disabled. Use the build command above or extend
your deployment job to pass these arguments when ready to enable it.

## Collector and reverse proxy

Merge [collector-cors.yaml](./collector-cors.yaml) into the **existing SigNoz
collector** config and add the exact deployed frontend origin. Keep the existing
SigNoz trace, metric and log exporters and pipelines. This file is a fragment,
not a standalone collector deployment. Restart the collector after changing it.

Expose OTLP HTTP through your TLS reverse proxy, preserving `/v1/traces`. It must
allow browser POST/OPTIONS requests and `Content-Type: application/json`. Browser
exports use no cookies or credentials. Allowlist the deployed origin rather than
using `*`. Add the telemetry origin to `connect-src` if you enforce a Content
Security Policy. Apply request limits/rate limiting at your ingress as appropriate.
The backend's internal collector URL can differ from this public URL.

## Verify

A local backend integration check starts a temporary OTLP receiver, sends a
synthetic request through Express/MySQL instrumentation and checks correlated
traces, logs and metrics. It uses an intentionally closed local MySQL port and
requires no database or SigNoz server:

```sh
cd backend
npm run check:telemetry
```

The backend requires Node 20.6+ for ESM instrumentation hooks.


1. Enable both services and configure the collector. Open the dashboard and make
   an API request. In browser Network tools, confirm the API request has a
   `traceparent` header, and the collector receives POST `/v1/traces` with a 200
   response. Export batches normally appear within several seconds.
2. In SigNoz Services/Traces, find `jk-dashboard-frontend` and
   `jk-dashboard-backend`. A frontend API span and backend HTTP/Express/DB spans
   should share a trace ID. MySQL statements should show placeholders.
3. In Logs Explorer, filter `service.name = jk-dashboard-backend`. A request log
   should contain `trace_id`/`span_id` and link to its trace. Logs outside requests
   (for example startup/background jobs) may have no active trace.
4. Wait at least 30 seconds and inspect backend runtime metrics in Metrics
   Explorer. Health probes at `/api/v1/health` intentionally do not create server
   spans. A failed API request should have an error status; uncaught browser
   errors appear as `browser.error` spans without message/stack text.
5. Temporarily stop the collector and confirm dashboard requests still work.

Sampling defaults to 100% when enabled. Reduce the browser ratio and backend root
ratio together, e.g. `0.1`, before production rollout. Parent-based backend sampling
honors the browser's sampled flag, so changing only the backend root ratio does
not reduce sampled incoming browser traces. Logs and metrics are not trace-sampled.

## Email alerts and rollback

Configure alert rules and an email notification channel in the self-hosted SigNoz
UI, with the SMTP settings required by your installed SigNoz version. Alert on
service error rate, latency or missing data as needed. The application's existing
scheduler-mail SMTP settings are separate and do not configure SigNoz alerts.

To disable backend export, set `OTEL_ENABLED=false` and restart. Set
`VITE_OTEL_ENABLED=false` and rebuild/redeploy the frontend to disable browser
instrumentation. No database migrations or credentials changes are involved.

## References

- [SigNoz Node.js tracing](https://signoz.io/docs/instrumentation/javascript/opentelemetry-nodejs/)
- [SigNoz browser tracing and self-hosted collector CORS](https://signoz.io/docs/frontend-monitoring/sending-traces-with-opentelemetry/)
- [OpenTelemetry JavaScript instrumentation](https://opentelemetry.io/docs/languages/js/instrumentation/)

Implementation check results and existing suite failures: [verification notes](./verification.md).
