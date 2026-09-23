// changes.md §0: the real data's missing-value sentinels are the literal
// strings "nan" AND "null" (not JS null). Treat both (case-insensitively)
// plus "" as empty so overall rows (product_type = "null") are recognised.
const EMPTY_TOKENS = new Set(["", "nan", "null"]);

function isEmptyToken(value) {
  return value == null || EMPTY_TOKENS.has(String(value).trim().toLowerCase());
}

// changes.md §6: canonical spellings for the folded filter dimensions.
const PRODUCT_TYPE_CANONICAL = new Map([["sidewall", "SideWall"]]);
const SUB_SECTION_CANONICAL = new Map([
  ["3 roll", "3 Roll"],
  ["three roll", "3 Roll"],
]);

export function canonicalizeProductType(value) {
  const d = denanDimension(value);
  if (d == null) return null;
  const t = String(d).trim();
  return PRODUCT_TYPE_CANONICAL.get(t.toLowerCase()) ?? t;
}

export function canonicalizeSubSection(value) {
  const d = denanDimension(value);
  if (d == null) return null;
  const t = String(d).trim();
  return SUB_SECTION_CANONICAL.get(t.toLowerCase()) ?? t;
}

const PRODUCT_AGNOSTIC_KPIS = new Set([
  "OEE_o",
  "Availability_o",
  "Performance_o",
  "Quality_o",
  // Sub-section OEE family (Stock records OEE per sub_section as *_s, not
  // overall *_o). These are equipment-level and carry product_type NULL, so
  // they must be product-agnostic — the backend PRODUCT_AGNOSTIC_KPIS already
  // lists them. Their absence here blanked the Stock OEE trend whenever a
  // product pill (Belt/Ply Mother Roll) was selected (found 2026-07-23).
  "OEE_s",
  "Availability_s",
  "Performance_s",
  "Quality_s",
  "OEE_m",
  "Availability_m",
  "Performance_m",
  "Quality_m",
  "Plan_Compliance",
  "Downtime",
  "Downtime_category",
  "Breakdown",
  "Setup",
  "Startup",
  "ToolChange",
  "MinorStoppage",
  "ReducedSpeed",
  "Defect",
  "Scrap",
]);

export function denanDimension(value) {
  return isEmptyToken(value) ? null : value;
}

/**
 * True when a row carries a real machine. CTP's gold table emits rows with
 * no machine (SQL NULL or the "nan"/"null"/"" sentinels) alongside the
 * machine-level ones; anything that PRESENTS machine data — a machine-wise
 * table, a per-machine series, a machine count or dropdown — must skip them
 * rather than render an anonymous "—" row.
 */
export function hasMachine(row) {
  return denanDimension(row?.machine) != null;
}

export function isProductAgnosticKpi(kpiName) {
  return PRODUCT_AGNOSTIC_KPIS.has(kpiName);
}

function rowScopeRank(row, productType) {
  const rowProductType = denanDimension(row?.product_type);
  if (productType && rowProductType === productType) return 3;
  if (rowProductType == null) return 2;
  return 1;
}

function defaultScopeKey(row) {
  return [
    row?.kpi_name ?? "",
    row?.date ?? "",
    row?.granularity ?? "",
    row?.section ?? "",
    row?.sub_section ?? "",
    row?.machine ?? "",
    row?.itemcode ?? "",
    row?.remarks ?? "",
    row?.drill_down_attribute ?? "",
  ].join("||");
}

export function preferScopedRows(rows, productType, keyFn = defaultScopeKey) {
  if (!Array.isArray(rows) || rows.length === 0 || !productType) {
    return Array.isArray(rows) ? rows : [];
  }

  const scoped = new Map();
  for (const row of rows) {
    const key = keyFn(row);
    const current = scoped.get(key);
    if (!current) {
      scoped.set(key, row);
      continue;
    }

    const nextRank = rowScopeRank(row, productType);
    const currentRank = rowScopeRank(current, productType);
    if (nextRank > currentRank) {
      scoped.set(key, row);
      continue;
    }

    if (nextRank === currentRank) {
      const nextPt = denanDimension(row?.product_type) ?? "";
      const currentPt = denanDimension(current?.product_type) ?? "";
      if (nextPt.localeCompare(currentPt) < 0) {
        scoped.set(key, row);
      }
    }
  }

  return [...scoped.values()];
}
