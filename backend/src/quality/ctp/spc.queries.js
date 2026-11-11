/** CTP SPC is a separate contract: plant CTP, Day/SHIFT grains, PCR/TBR. */
import { escapeLiteral } from "../normalize.js";
import { isIsoDate } from "./periods.js";

export function todayInIst() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** Validate before building SQL; an omitted date explicitly means latest. */
export function resolveSpcRequest(query, today = todayInIst()) {
  const { tyre = "All", shift = "All", date, refresh = "0" } = query;
  if (!["All", "PCR", "TBR"].includes(tyre))
    return { error: "tyre must be All, PCR or TBR." };
  if (!["All", "A", "B", "C"].includes(shift))
    return { error: "shift must be All, A, B or C." };
  if (date !== undefined && !isIsoDate(date))
    return { error: "date must be a valid yyyy-mm-dd." };
  if (!["0", "1"].includes(refresh))
    return { error: "refresh must be 0 or 1." };
  if (
    query.granularity !== undefined ||
    query.from !== undefined ||
    query.to !== undefined
  )
    return { error: "SPC serves daily snapshots, not period aggregates." };
  return { tyre, shift, date: date ?? null, today, refresh: refresh === "1" };
}

function scope(tyre) {
  return (
    "plant = 'CTP' AND department = 'Quality' AND category = 'SPC' " +
    (tyre === "All"
      ? "AND tyre_type IN ('PCR', 'TBR')"
      : `AND tyre_type = ${escapeLiteral(tyre)}`)
  );
}

/** One round-trip: exact day or latest published day, plus selected shift stats.
 * All never sums capabilities: it returns separate tyre/machine/parameter rows.
 * No BTP tables, static supplements, raw Silver reads or older-day fallback.
 */
export function spcWorkspaceQuery({ tyre, shift, date, today }) {
  const atDate = date
    ? `DATE ${escapeLiteral(date)}`
    : `(SELECT MAX(date) FROM gold.ctp_gold WHERE ${scope(tyre)} ` +
      `AND granularity = 'Day' AND date <= DATE ${escapeLiteral(today)})`;
  const grains = ["Day", ...(shift === "All" ? [] : [`SHIFT ${shift}`])];
  return (
    "SELECT record_id, CAST(date AS VARCHAR) AS date, granularity, tyre_type, " +
    "machine, product_type, itemcode, section, sub_section, kpi_name, " +
    "unit_of_measurement, actual_value, status, plot_data " +
    `FROM gold.ctp_gold WHERE ${scope(tyre)} AND date = ${atDate} ` +
    `AND granularity IN (${grains.map(escapeLiteral).join(", ")}) ` +
    "AND regexp_like(kpi_name, ' (Cp|Cpk|Pp|Ppk|Mean|OOC Points|Shift Stats)$') " +
    "ORDER BY tyre_type, machine, itemcode, kpi_name, record_id"
  );
}
