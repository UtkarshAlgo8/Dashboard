export async function initializeTelemetry() {
  if (import.meta.env.VITE_OTEL_ENABLED !== "true") return;
  try {
    const { startBrowserTelemetry } = await import("./browser.js");
    startBrowserTelemetry();
  } catch {
    // Observability must not prevent the dashboard from rendering.
    console.warn(
      "[telemetry] Initialization failed; continuing without telemetry.",
    );
  }
}
