import {
  trace,
  context,
  propagation,
  SpanStatusCode,
} from "@opentelemetry/api";
import { WebTracerProvider } from "@opentelemetry/sdk-trace-web";
import {
  BatchSpanProcessor,
  ParentBasedSampler,
  TraceIdRatioBasedSampler,
} from "@opentelemetry/sdk-trace-base";
import { W3CTraceContextPropagator } from "@opentelemetry/core";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { registerInstrumentations } from "@opentelemetry/instrumentation";
import { FetchInstrumentation } from "@opentelemetry/instrumentation-fetch";
import { XMLHttpRequestInstrumentation } from "@opentelemetry/instrumentation-xml-http-request";
import { ZoneContextManager } from "@opentelemetry/context-zone";

const cleanUrl = (value) =>
  String(value)
    .split(/[?#]/, 1)[0]
    .replace(/(\/reset-password\/)[^/\s]+/gi, "$1[redacted]");
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
let dispose;

export function startBrowserTelemetry() {
  if (dispose) return;
  const endpoint = new URL(
    import.meta.env.VITE_OTEL_EXPORTER_OTLP_TRACES_ENDPOINT ||
      "http://localhost:4318/v1/traces",
    window.location.href,
  );
  if (!["http:", "https:"].includes(endpoint.protocol))
    throw new Error("OTLP requires HTTP(S)");
  const api = new URL(
    import.meta.env.VITE_API_BASE_URL || "/api/v1",
    window.location.href,
  );
  const apiPrefix = escapeRegex(api.origin + api.pathname.replace(/\/$/, ""));
  // XHR checks ignoreUrls before resolving relative URLs; fetch resolves first.
  const allowedPrefixes = [apiPrefix];
  if (api.origin === window.location.origin) {
    allowedPrefixes.push(escapeRegex(api.pathname.replace(/\/$/, "")));
  }
  const allowedRequests = allowedPrefixes.join("|");
  const apiUrls = new RegExp(`^${apiPrefix}(?:/|\\?|$)`);
  const ratio = Number(import.meta.env.VITE_OTEL_TRACES_SAMPLER_ARG || "1");
  if (!Number.isFinite(ratio) || ratio < 0 || ratio > 1)
    throw new Error("Invalid trace sample ratio");
  const exporter = new OTLPTraceExporter({
    url: endpoint.href,
    timeoutMillis: 5000,
    // Select fetch/keepalive rather than sendBeacon (which includes credentials
    // and only confirms queuing). Cross-origin exports need no cookies.
    headers: {},
  });
  const safeExporter = {
    export(spans, callback) {
      const safe = spans.map((span) => {
        const attributes = Object.fromEntries(
          Object.entries(span.attributes).flatMap(([key, value]) => {
            if (
              /header|body|token|password|cookie|exception\.(message|stacktrace)|url\.(query|fragment)/i.test(
                key,
              )
            )
              return [];
            return [
              [
                key,
                /url|target/i.test(key) && typeof value === "string"
                  ? cleanUrl(value)
                  : value,
              ],
            ];
          }),
        );
        const clean = Object.create(span);
        Object.defineProperties(clean, {
          name: { value: cleanUrl(span.name) },
          attributes: { value: attributes },
          events: {
            value: span.events.map((event) => ({
              ...event,
              attributes:
                event.name === "exception"
                  ? {
                      "exception.type":
                        event.attributes?.["exception.type"] || "Error",
                    }
                  : {},
            })),
          },
          status: { value: { code: span.status.code } },
        });
        return clean;
      });
      exporter.export(safe, callback);
    },
    shutdown: () => exporter.shutdown(),
  };
  const provider = new WebTracerProvider({
    resource: resourceFromAttributes({
      "service.name":
        import.meta.env.VITE_OTEL_SERVICE_NAME || "jk-dashboard-frontend",
      "service.version": import.meta.env.VITE_APP_VERSION || "0.0.0",
      "deployment.environment.name": import.meta.env.MODE,
    }),
    sampler: new ParentBasedSampler({
      root: new TraceIdRatioBasedSampler(ratio),
    }),
    spanProcessors: [new BatchSpanProcessor(safeExporter)],
  });
  const contextManager = new ZoneContextManager();
  provider.register({
    contextManager,
    propagator: new W3CTraceContextPropagator(),
  });
  const instrumentationConfig = {
    propagateTraceHeaderCorsUrls: [apiUrls],
    ignoreUrls: [
      new RegExp(`^(?!(?:${allowedRequests})(?:/|\\?|$))`),
      new RegExp(`^${escapeRegex(endpoint.href)}`),
    ],
    clearTimingResources: true,
    ignoreNetworkEvents: true,
  };
  const unregister = registerInstrumentations({
    instrumentations: [
      new FetchInstrumentation(instrumentationConfig),
      new XMLHttpRequestInstrumentation(instrumentationConfig),
    ],
  });
  const reportError = (event) => {
    const error = event.error || event.reason;
    const span = trace
      .getTracer("jk-dashboard-browser")
      .startSpan("browser.error");
    span.recordException({
      name: error instanceof Error ? error.name : "UnhandledError",
    });
    span.setStatus({ code: SpanStatusCode.ERROR });
    span.end();
  };
  const flush = () => {
    provider.forceFlush().catch(() => {});
  };
  window.addEventListener("error", reportError);
  window.addEventListener("unhandledrejection", reportError);
  window.addEventListener("pagehide", flush);
  dispose = () => {
    unregister();
    window.removeEventListener("error", reportError);
    window.removeEventListener("unhandledrejection", reportError);
    window.removeEventListener("pagehide", flush);
    contextManager.disable();
    trace.disable();
    context.disable();
    propagation.disable();
    provider.shutdown().catch(() => {});
    dispose = undefined;
  };
}

if (import.meta.hot) import.meta.hot.dispose(() => dispose?.());
