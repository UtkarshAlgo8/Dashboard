/** Cell formatters for the CTP Quality drill tables. */
export const pct = (v) => (v == null ? "—" : `${Number(v).toFixed(2)}%`);
export const count = (v) =>
  v == null ? "—" : Number(v).toLocaleString("en-IN");
export const text = (v) => v ?? "—";
