/** BTP-only Uniformity contract; KPI names come from the preserved v1.2 guide. */
export const UNIFORMITY_VERSION = "btp-uniformity-v1";
export const UNIFORMITY_PARAMETERS = Object.freeze([
  "RFV CW",
  "H1 RFV CW",
  "LFV CW",
  "RFV CCW",
  "H1 RFV CCW",
  "LFV CCW",
  "Conicity",
]);
export const BALANCING_PARAMETERS = Object.freeze([
  "Upper Unbalance",
  "Lower Unbalance",
  "Static Unbalance",
  "Couple Unbalance",
]);
const ZF_PARAMETERS = [
  ...UNIFORMITY_PARAMETERS,
  "RRO",
  "Upper LRO",
  "Lower LRO",
  "Upper Bulge",
  "Lower Bulge",
  "Upper Depression",
  "Lower Depression",
];
function uniformity(prefix) {
  return {
    machineYield: `${prefix}_Uniformity_Yield_m`,
    machineTested: `${prefix}_Uniformity_Production`,
    skuYield: `${prefix}_Uniformity_Yield_m_sku`,
    skuTested: `${prefix}_Uniformity_Production_m_sku`,
    qty: `${prefix}_Uniformity_Param_OffSpec_Qty_m_sku`,
    pct: `${prefix}_Uniformity_Param_OffSpec_Pct_m_sku`,
  };
}
export const UNIFORMITY_CARDS = Object.freeze({
  mtms: {
    ...uniformity("Mtms"),
    parameters: UNIFORMITY_PARAMETERS,
    plot: true,
    table: "silver.fct_productiondatatuo",
  },
  tuo: { ...uniformity("Tuo"), parameters: [], plot: false, table: null },
  "zf-uniformity": {
    ...uniformity("Zf"),
    parameters: ZF_PARAMETERS,
    plot: false,
    table: "silver.fct_productiondatatuonew",
  },
  "zf-balancing": {
    ...uniformity("Zf"),
    machineYield: "Zf_Balancing_Yield_m",
    skuYield: "Zf_Balancing_Yield_m_sku",
    qty: "Zf_Balancing_Param_OffSpec_Qty_m_sku",
    pct: "Zf_Balancing_Param_OffSpec_Pct_m_sku",
    parameters: BALANCING_PARAMETERS,
    plot: false,
    table: "silver.fct_productiondatatuonew",
  },
  dbm: {
    machineYield: "Dbm_Balancing_Yield_m",
    machineTested: "Dbm_Balancing_Production_m",
    skuYield: "Dbm_Balancing_Yield_m_sku",
    skuTested: "Dbm_Balancing_Production_m_sku",
    qty: "Dbm_Balancing_Param_OffSpec_Qty_m_sku",
    pct: "Dbm_Balancing_Param_OffSpec_Pct_m_sku",
    parameters: BALANCING_PARAMETERS,
    plot: true,
    table: "silver.fct_productiondatapcrdbnew",
  },
});
export function invalid(message) {
  return Object.assign(new Error(message), {
    status: 400,
    code: "VALIDATION_ERROR",
  });
}
function scalar(value, name, max = 160) {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.length > max ||
    /[\u0000-\u001f\u007f]/.test(value)
  )
    throw invalid(`Invalid ${name}.`);
  return value;
}
export function validDate(value) {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number(value.slice(0, 4)) >= 2000 &&
    Number(value.slice(0, 4)) <= 2100 &&
    !Number.isNaN(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value
  );
}
function integer(raw, fallback, max, name) {
  if (raw == null) return fallback;
  if (
    typeof raw !== "string" ||
    !/^\d+$/.test(raw) ||
    !Number.isSafeInteger(Number(raw)) ||
    Number(raw) > max
  )
    throw invalid(`Invalid ${name}.`);
  return Number(raw);
}
/** Validate the complete selected scope before constructing any SQL/cache key. */
export function uniformityScope(query, kind) {
  if (!["gold", "barcodes", "points"].includes(kind))
    throw invalid("Unsupported action.");
  if (query.plant !== "BANMORE")
    throw invalid("Only plant BANMORE is supported.");
  const card = scalar(query.card, "card");
  if (!Object.hasOwn(UNIFORMITY_CARDS, card))
    throw invalid("Unsupported Uniformity card.");
  const cfg = UNIFORMITY_CARDS[card];
  const { from, to, period } = query;
  if (
    !validDate(from) ||
    !validDate(to) ||
    from > to ||
    (Date.parse(to) - Date.parse(from)) / 86400000 > 365
  )
    throw invalid("Dates must be real, ordered ISO dates within 366 days.");
  if (!["day", "month", "year", "range"].includes(period))
    throw invalid("Unsupported period.");
  const shift = query.shift ?? "ALL";
  if (!["ALL", "A", "B", "C"].includes(shift))
    throw invalid("Unsupported shift.");
  if (period !== "day" && shift !== "ALL")
    throw invalid("Shifts apply only to a single day.");
  if (period === "day" && from !== to)
    throw invalid("Day selection must have one date.");
  if (
    period === "month" &&
    (from.slice(8) !== "01" || from.slice(0, 7) !== to.slice(0, 7))
  )
    throw invalid(
      "Month selection must start on its first day and end in that month.",
    );
  if (
    period === "year" &&
    (from.slice(5) !== "01-01" || from.slice(0, 4) !== to.slice(0, 4))
  )
    throw invalid("Year selection must start January 1 and end in that year.");
  const level = kind === "gold" ? query.level : "parameter";
  if (!["machine", "sku", "parameter"].includes(level))
    throw invalid("Unsupported drill level.");
  const machine = level !== "machine" ? scalar(query.machine, "machine") : null;
  const sku = level === "parameter" ? scalar(query.sku, "sku") : null;
  if (
    level === "machine" &&
    (query.machine != null || query.sku != null || query.parameter != null)
  )
    throw invalid("Machine level cannot include child filters.");
  if (level === "sku" && (query.sku != null || query.parameter != null))
    throw invalid("SKU level cannot include child filters.");
  if (kind === "gold" && query.parameter != null)
    throw invalid(
      "Gold parameter level does not accept an individual parameter filter.",
    );
  let parameter = null;
  if (kind !== "gold" && card !== "tuo") {
    parameter = scalar(query.parameter, "parameter");
    if (!cfg.parameters.includes(parameter))
      throw invalid("Unsupported parameter for this card.");
  }
  if (card === "tuo" && (level === "parameter" || kind !== "gold")) {
    throw Object.assign(
      new Error(
        "TUO status/barcodes are unavailable pending the Athena source and BTP scope contract.",
      ),
      { status: 503, code: "TUO_SOURCE_UNAVAILABLE" },
    );
  }
  if (kind === "points" && !cfg.plot)
    throw invalid(
      "Raw plots are unavailable for this card; ZF stores grades only.",
    );
  const limit = integer(
    query.limit,
    kind === "points" ? 1000 : 100,
    kind === "points" ? 2000 : 200,
    "limit",
  );
  if (limit < 1) throw invalid("Limit must be positive.");
  const offset = integer(query.offset, 0, 1000000, "offset");
  const granularity =
    period === "range"
      ? "DAY"
      : period === "month"
        ? "MONTH"
        : period === "year"
          ? "YEAR"
          : shift === "ALL"
            ? "DAY"
            : `SHIFT ${shift}`;
  return {
    plant: "BANMORE",
    card,
    kind,
    level,
    machine,
    sku,
    parameter,
    period,
    from,
    to,
    shift,
    granularity,
    limit,
    offset,
  };
}
