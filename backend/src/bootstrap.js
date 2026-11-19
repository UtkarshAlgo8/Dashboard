// Load env and telemetry before importing any application/database modules.
import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import { register } from "node:module";

dotenv.config({
  path: fileURLToPath(new URL("../.env.local", import.meta.url)),
});
dotenv.config({ path: fileURLToPath(new URL("../.env", import.meta.url)) });

if (process.env.OTEL_ENABLED === "true") {
  // Required for instrumentation of this project's ES module imports.
  register("@opentelemetry/instrumentation/hook.mjs", import.meta.url);
  try {
    const { startTelemetry } = await import("./telemetry.js");
    await startTelemetry();
  } catch {
    console.warn(
      "[telemetry] Initialization failed; continuing without telemetry.",
    );
  }
}
const { server } = await import("./index.js");
if (process.env.OTEL_ENABLED === "true") {
  let closing = false;
  const close = () => {
    if (closing) return;
    closing = true;
    const deadline = setTimeout(() => process.exit(1), 10000);
    deadline.unref();
    server.close(async () => {
      try {
        const { shutdownTelemetry } = await import("./telemetry.js");
        await shutdownTelemetry();
        process.exit(0);
      } catch {
        process.exit(1);
      }
    });
  };
  process.once("SIGTERM", close);
  process.once("SIGINT", close);
}
