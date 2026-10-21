export const LIVE_SKU_NOTE =
  "Live snapshot · last 7 days · independent of dashboard date/shift";

// Gold and Silver use different separators and VMI Maxx number positions.
export function liveMachineKey(value) {
  const key = String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  const maxx = key.match(/^vmi(?:maxx0*(\d+)|0*(\d+)maxx)$/);
  return maxx ? `vmimaxx${Number(maxx[1] ?? maxx[2])}` : key;
}
