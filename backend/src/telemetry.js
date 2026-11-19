import { envDetector } from "@opentelemetry/resources";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { HttpInstrumentation } from "@opentelemetry/instrumentation-http";
import { ExpressInstrumentation } from "@opentelemetry/instrumentation-express";
import { MySQL2Instrumentation } from "@opentelemetry/instrumentation-mysql2";
import { IORedisInstrumentation } from "@opentelemetry/instrumentation-ioredis";
import { UndiciInstrumentation } from "@opentelemetry/instrumentation-undici";
import { WinstonInstrumentation } from "@opentelemetry/instrumentation-winston";
import { RuntimeNodeInstrumentation } from "@opentelemetry/instrumentation-runtime-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import { BatchSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { BatchLogRecordProcessor } from "@opentelemetry/sdk-logs";
import { sanitizingExporter } from "./utils/telemetry-sanitize.js";

let sdk;
export async function startTelemetry() {
  if (sdk) return;
  const endpoint = new URL(
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT || "http://localhost:4318",
  );
  if (!["http:", "https:"].includes(endpoint.protocol))
    throw new Error("OTLP requires HTTP(S)");
  const base = endpoint.href.replace(/\/$/, "");
  const signalUrl = (signal) =>
    process.env[`OTEL_EXPORTER_OTLP_${signal.toUpperCase()}_ENDPOINT`] ||
    `${base}/v1/${signal}`;
  // Instrument only libraries used here; do not duplicate MySQL spans through Sequelize.
  const instrumentations = [
    new HttpInstrumentation({
      ignoreIncomingRequestHook: (req) =>
        req.url?.split("?")[0] === "/api/v1/health",
      ignoreOutgoingRequestHook: (req) =>
        String(req.hostname || req.host) === endpoint.hostname &&
        /\/v1\/(traces|metrics|logs)/.test(req.path || ""),
    }),
    new ExpressInstrumentation(),
    new MySQL2Instrumentation({ maskStatement: true }),
    new IORedisInstrumentation({ dbStatementSerializer: () => "[redacted]" }),
    new UndiciInstrumentation(),
    new WinstonInstrumentation(),
    new RuntimeNodeInstrumentation(),
  ];

  const candidate = new NodeSDK({
    resourceDetectors: [envDetector],
    serviceName: process.env.OTEL_SERVICE_NAME || "jk-dashboard-backend",
    spanProcessors: [
      new BatchSpanProcessor(
        sanitizingExporter(
          new OTLPTraceExporter({
            url: signalUrl("traces"),
            timeoutMillis: 5000,
          }),
        ),
      ),
    ],
    metricReaders: [
      new PeriodicExportingMetricReader({
        exporter: new OTLPMetricExporter({
          url: signalUrl("metrics"),
          timeoutMillis: 5000,
        }),
        exportIntervalMillis: 30000,
      }),
    ],
    logRecordProcessors: [
      new BatchLogRecordProcessor(
        new OTLPLogExporter({ url: signalUrl("logs"), timeoutMillis: 5000 }),
      ),
    ],
    instrumentations,
  });
  candidate.start();
  sdk = candidate;
}

export async function shutdownTelemetry() {
  const current = sdk;
  sdk = undefined;
  if (current) await current.shutdown();
}
