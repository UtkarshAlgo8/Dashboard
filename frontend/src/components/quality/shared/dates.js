/** Date helpers shared by the Quality pages. */

// Fallback anchor for the trend panel when its caller pins no date.
export const QUALITY_DATA_DATE = "2026-06-10";

const pad2 = (n) => String(n).padStart(2, "0");

export function monthRangeFromKey(monthKey) {
  const [yStr, mStr] = String(monthKey).split("-");
  const y = Number(yStr);
  const m = Number(mStr);
  const lastDay = new Date(y, m, 0).getDate();
  return {
    from: `${y}-${pad2(m)}-01`,
    to: `${y}-${pad2(m)}-${pad2(lastDay)}`,
  };
}
