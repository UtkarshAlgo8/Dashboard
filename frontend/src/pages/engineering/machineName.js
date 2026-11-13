import { denanDimension } from "@/lib/dashboardRowScopes.js";

/** The machine's name from gold's eqname; null when gold has none. */
export function machineName(row) {
  return denanDimension(row?.eqname);
}

/** "Machine name" table column, shown next to the machine code. */
export const MACHINE_NAME_COLUMN = {
  key: "eqname",
  label: "Machine name",
  align: "left",
  render: (r) => machineName(r) ?? "—",
  sortValue: (r) => machineName(r),
};

/** "0201 · Bead Apex" — the code alone when gold has no name. */
export function machineLabel(row) {
  const name = machineName(row);
  return name ? `${row.machine} · ${name}` : row?.machine;
}
