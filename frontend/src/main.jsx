import { initializeTelemetry } from "@/telemetry";

// StrictMode intentionally double-invokes effects/renders in DEVELOPMENT to
// surface unsafe effects. It's a no-op in production. We removed it because it
// made every data hook fire twice in dev — doubling the network calls in the
// dev tab (and re-mounting drill panels, which read as an open/close flicker),
// which was consistently mistaken for a real bug. Prod behaviour is unchanged.
// After a deploy, a tab that loaded the previous index.html still asks for the
// old hashed chunks, which the new build no longer has ("Failed to fetch
// dynamically imported module"). Reload once to pick up the new build. The
// timestamp stops a reload loop if a chunk is really missing.
const CHUNK_RELOAD_KEY = "jkdash.chunkReloadAt";
window.addEventListener("vite:preloadError", (event) => {
  let last = 0;
  try {
    last = Number(sessionStorage.getItem(CHUNK_RELOAD_KEY)) || 0;
  } catch {
    // Storage blocked: still reload once, the guard just can't persist.
  }
  if (Date.now() - last < 10_000) return;
  try {
    sessionStorage.setItem(CHUNK_RELOAD_KEY, String(Date.now()));
  } catch {
    // See above.
  }
  event.preventDefault();
  window.location.reload();
});

// Instrument XHR/fetch before importing App and its API clients.
initializeTelemetry().finally(() => import("./renderApp.jsx"));
