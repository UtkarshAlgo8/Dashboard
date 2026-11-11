import client from "./client.js";

/** CTP-only daily SPC. Refresh bypasses the backend's one-minute cache. */
export function getCtpSpcWorkspace({
  tyre,
  date,
  shift,
  refresh = false,
  signal,
}) {
  return client.get("/quality/ctp/spc/workspace", {
    params: {
      tyre,
      date: date || undefined,
      shift,
      refresh: refresh ? "1" : undefined,
    },
    signal,
  });
}
