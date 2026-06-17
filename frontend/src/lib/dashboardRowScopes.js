const NAN = "nan";

const PRODUCT_AGNOSTIC_KPIS = new Set([
  "OEE_o",
  "Availability_o",
  "Performance_o",
  "Quality_o",
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
  return value == null || value === "" || value === NAN ? null : value;
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
