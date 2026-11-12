/**
 * Live BTP overage, translated from Overage_KPI_Dashboard_Guide §9.1.
 * Athena does ALL classification, aging, stock and aggregation work. No raw
 * production/master datasets leave Athena. No view or Gold writes are needed.
 * Green Tyre is deliberately deferred: its curing-NCM Silver source is absent.
 */
export const OVERAGE_LOOKBACK_HOURS = 10 * 24;

export const OVERAGE_LAYOUT = Object.freeze([
  ["Mixing", 1, "Master Compound", 1],
  ["Mixing", 1, "Final Compound", 2],
  ["Four Roll", 2, "Belt Mother Roll", 1],
  ["Four Roll", 2, "Ply Mother Roll", 2],
  ["Three Roll", 3, "Inner Liner", 1],
  ["Extruder", 4, "Tread", 1],
  ["Extruder", 4, "Sidewall", 2],
  ["Cutter", 5, "Belt", 1],
  ["Cutter", 5, "Ply", 2],
  ["Cutter", 5, "Chaffer Mother Roll", 3],
  ["Slitter", 6, "Chaffer", 1],
  ["Slitter", 6, "Cap Strip", 2],
  ["Slitter", 6, "Precut Capstrip", 3],
]);
export const OVERAGE_SECTIONS = Object.freeze([
  ...new Set(OVERAGE_LAYOUT.map((r) => r[0])),
]);
export const OVERAGE_TABLES = Object.freeze([
  "silver.fct_o_production",
  "silver.dim_bom",
  "silver.dim_tblitemmaster",
  "silver.dim_tblunitmaster",
  "silver.dim_tblmaterialcategorymaster",
]);

// Athena string literals escape apostrophes by doubling them, not backslashes.
// The upstream transport does not expose parameter binding. Every request value
// enters SQL ONLY through this encoder (identifiers are all server constants).
export function athenaLiteral(value) {
  if (
    typeof value !== "string" ||
    value.length > 512 ||
    /[\u0000-\u001f\u007f]/u.test(value)
  ) {
    throw new TypeError("Invalid Athena string value");
  }
  return `'${value.replaceAll("'", "''")}'`;
}

const key = (col) =>
  `LOWER(REPLACE(TRANSLATE(${col}, CHR(13) || CHR(10) || CHR(9), ''), ' ', ''))`;
const clean = (col) =>
  `TRIM(TRANSLATE(${col}, CHR(13) || CHR(10) || CHR(9), ''))`;
const cats = (expr) => `COALESCE(${expr}, CAST(ARRAY[] AS ARRAY(VARCHAR)))`;

function validateScope({
  section,
  productType,
  itemCode,
  unit,
  allSections = false,
} = {}) {
  if (
    !(allSections && section === undefined) &&
    !OVERAGE_SECTIONS.includes(section)
  )
    throw new TypeError("Unsupported overage section");
  if (productType !== undefined) {
    const allowed = OVERAGE_LAYOUT.filter((r) => r[0] === section).map(
      (r) => r[2],
    );
    if (section === "Four Roll")
      allowed.push("Mother Roll from FRC - Unclassified");
    if (!allowed.includes(productType))
      throw new TypeError("Unsupported product type for this section");
  }
  if (itemCode !== undefined && (!itemCode.trim() || !productType))
    throw new TypeError("Item code requires a product type");
  for (const value of [itemCode, unit])
    if (value !== undefined) athenaLiteral(value);
}

/** Shared inline relation; deduplicate before section/item/status decisions. */
export function overageCtes(scope) {
  validateScope(scope);
  const { section, productType, itemCode, unit, allSections } = scope;
  const ownCats = cats(
    "CASE WHEN ek.item_key IS NOT NULL THEN ec.cats ELSE ii.cats END",
  );
  return String.raw`WITH
  clock AS (
    -- Silver event_time is IST wall-clock stored with a zone (same contract as
    -- live-running-skus). Strip the stored zone; do not shift it a second time.
    SELECT CAST(format_datetime(current_timestamp AT TIME ZONE 'Asia/Kolkata', 'yyyy-MM-dd HH:mm:ss.SSS') AS timestamp) AS as_of
  ),
  comp_all AS (
    SELECT * FROM (VALUES
      ('mm', 'Mixing', 'Master Compound', 'master compound'),
      ('mm', 'Mixing', 'Final Compound', 'final compound'),
      ('frc', 'Four Roll', 'Mother Roll', CAST(NULL AS VARCHAR)),
      ('trc', 'Three Roll', 'Inner Liner', 'inner liner'),
      ('trcnew', 'Three Roll', 'Inner Liner', 'inner liner'),
      ('dualex', 'Extruder', CAST(NULL AS VARCHAR), 'extruder'),
      ('duplex', 'Extruder', CAST(NULL AS VARCHAR), 'extruder'),
      ('triplex', 'Extruder', CAST(NULL AS VARCHAR), 'extruder'),
      ('quadraplex', 'Extruder', CAST(NULL AS VARCHAR), 'extruder'),
      ('quintuplex', 'Extruder', CAST(NULL AS VARCHAR), 'extruder'),
      ('wbc', 'Cutter', 'Belt', CAST(NULL AS VARCHAR)),
      ('wbcnew', 'Cutter', 'Belt', CAST(NULL AS VARCHAR)),
      ('htbc', 'Cutter', 'Ply', CAST(NULL AS VARCHAR)),
      ('ltbc', 'Cutter', 'Ply', CAST(NULL AS VARCHAR)),
      ('ltbcnew', 'Cutter', 'Ply', CAST(NULL AS VARCHAR)),
      ('mbc', 'Cutter', 'Chaffer Mother Roll', CAST(NULL AS VARCHAR)),
      ('chaffer', 'Slitter', 'Chaffer', CAST(NULL AS VARCHAR)),
      ('chafferslitter', 'Slitter', 'Chaffer', CAST(NULL AS VARCHAR)),
      ('capstrip', 'Slitter', 'Cap Strip', CAST(NULL AS VARCHAR)),
      ('capstripnew', 'Slitter', 'Cap Strip', CAST(NULL AS VARCHAR)),
      ('fws', 'Slitter', 'Precut Capstrip', CAST(NULL AS VARCHAR)),
      ('fwsnew', 'Slitter', 'Precut Capstrip', CAST(NULL AS VARCHAR))
    ) AS c(source_machine, dashboard_section, component, cat)
  ),
  comp AS (
    SELECT * FROM comp_all
    ${allSections ? "" : `WHERE dashboard_section = ${athenaLiteral(section)}`}
  ),
  bom_source AS (SELECT * FROM silver.dim_bom WHERE plant_code = 'BTP'),
  im_source AS (SELECT * FROM silver.dim_tblitemmaster WHERE plant_code = 'BTP'),
  um_source AS (SELECT * FROM silver.dim_tblunitmaster WHERE plant_code = 'BTP'),
  mc_source AS (SELECT * FROM silver.dim_tblmaterialcategorymaster WHERE plant_code = 'BTP'),
  bom AS (
    SELECT item_key, mat_key, ext_family FROM (
      SELECT ${key("b.plcbomname")} AS item_key,
        ${key("b.materialcode_o")} AS mat_key,
        CASE
          WHEN LOWER(TRIM(b.equipment)) = 'dual extruder' THEN 'dualex'
          WHEN LOWER(TRIM(b.equipment)) = 'duplex extruder' THEN 'duplex'
          WHEN LOWER(TRIM(b.equipment)) IN ('triplex extruder', 'triplex') THEN 'triplex'
          WHEN LOWER(TRIM(b.equipment)) IN ('quintuplex extruder', 'quintuplex', 'quintoplex') THEN 'quintuplex'
        END AS ext_family,
        DENSE_RANK() OVER (PARTITION BY ${key("b.plcbomname")}, LOWER(TRIM(b.equipment)) ORDER BY try_cast(b.revision AS DOUBLE) DESC) AS rk
      FROM bom_source b WHERE b.materialcode_o IS NOT NULL
    ) r WHERE rk = 1
  ),
  bom_keys AS (SELECT DISTINCT item_key FROM bom),
  aging AS (
    SELECT ${key("im.item_code")} AS mat_key,
      MIN(CASE
        WHEN LOWER(TRIM(au.name)) LIKE 'day%' THEN try_cast(im.max_aging AS DECIMAL(18,4)) * 24
        WHEN LOWER(TRIM(au.name)) LIKE 'hour%' THEN try_cast(im.max_aging AS DECIMAL(18,4))
        WHEN LOWER(TRIM(au.name)) LIKE 'min%' THEN try_cast(im.max_aging AS DECIMAL(18,4)) / 60
        WHEN LOWER(TRIM(au.name)) LIKE 'month%' THEN try_cast(im.max_aging AS DECIMAL(18,4)) * 720
      END) AS max_aging_hours
    FROM im_source im
    INNER JOIN um_source au ON try_cast(au.record_id AS INTEGER) = im.max_aging_unit_id
    WHERE LOWER(CAST(im.is_current AS VARCHAR)) IN ('true', '1')
      AND try_cast(im.max_aging AS DECIMAL(18,4)) > 0
    GROUP BY 1
  ),
  item_aging AS (
    SELECT b.item_key,
      COALESCE(MIN(CASE WHEN b.mat_key = b.item_key THEN g.max_aging_hours END), MIN(g.max_aging_hours)) AS max_aging_hours
    FROM bom b INNER JOIN aging g ON g.mat_key = b.mat_key GROUP BY b.item_key
  ),
  ext_keys AS (SELECT DISTINCT item_key, ext_family FROM bom WHERE ext_family IS NOT NULL),
  ext_aging AS (
    SELECT b.item_key, b.ext_family,
      COALESCE(MIN(CASE WHEN b.mat_key = b.item_key THEN g.max_aging_hours END), MIN(g.max_aging_hours)) AS max_aging_hours
    FROM bom b INNER JOIN aging g ON g.mat_key = b.mat_key
    WHERE b.ext_family IS NOT NULL GROUP BY b.item_key, b.ext_family
  ),
  ext_cats AS (
    SELECT b.item_key, b.ext_family, array_agg(DISTINCT LOWER(mc.mes_name)) FILTER (WHERE mc.mes_name IS NOT NULL) AS cats
    FROM bom b
    INNER JOIN im_source im ON ${key("im.item_code")} = b.mat_key
    INNER JOIN mc_source mc ON mc.record_id = im.m_category_id
    WHERE b.ext_family IS NOT NULL GROUP BY b.item_key, b.ext_family
  ),
  item_info AS (
    SELECT ${key("b.plcbomname")} AS item_key,
      array_agg(DISTINCT LOWER(mc.mes_name)) FILTER (WHERE mc.mes_name IS NOT NULL) AS cats,
      MAX(CASE WHEN LOWER(TRIM(b.equipment)) IN ('four roll calendar', '4rc') AND LOWER(TRIM(b.materialgroup_in)) = 'final compound' THEN 1 ELSE 0 END) AS frc_compound,
      MAX(CASE WHEN LOWER(TRIM(b.equipment)) IN ('four roll calendar', '4rc') AND LOWER(TRIM(b.materialgroup_in)) = 'steel tyre cord' THEN 1 ELSE 0 END) AS frc_steel,
      MAX(CASE WHEN LOWER(TRIM(b.equipment)) IN ('four roll calendar', '4rc') AND LOWER(TRIM(b.materialgroup_in)) IN ('nylon fabric', 'polyster') THEN 1 ELSE 0 END) AS frc_textile
    FROM bom_source b
    LEFT JOIN im_source im ON ${key("im.item_code")} = ${key("b.materialcode_o")}
    LEFT JOIN mc_source mc ON mc.record_id = im.m_category_id
    GROUP BY 1
  ),
  item_uom AS (
    SELECT item_key, name FROM (
      SELECT ${key("b.plcbomname")} AS item_key, um.name,
        ROW_NUMBER() OVER (PARTITION BY ${key("b.plcbomname")} ORDER BY b.revision DESC, um.name) AS rn
      FROM bom_source b
      INNER JOIN im_source im ON ${key("im.item_code")} = ${key("b.materialcode_o")}
      INNER JOIN um_source um ON try_cast(um.record_id AS INTEGER) = im.uom_id
      WHERE b.materialcode_o IS NOT NULL
    ) u WHERE rn = 1
  ),
  production_source AS (
    -- Silver can repeat a barcode. User-approved rule: latest ingested record,
    -- then event time and stable record ID, BEFORE section/item/quality decisions.
    -- Rank across all mapped families so summary and scoped drills agree even
    -- if a repeated barcode changes its machine or item.
    SELECT * FROM (
      SELECT p.production_id, p.item_code, p.machine_no, p.mhe_code, p.event_time,
        p.quality_status, p.live_quantity, p.weight, p.quantity, p.source_machine,
        ROW_NUMBER() OVER (
          PARTITION BY ${clean("p.production_id")}
          ORDER BY p._bronze_ingest_ts DESC NULLS LAST, p.event_time DESC,
            try_cast(p.record_id AS BIGINT) DESC NULLS LAST, p.record_id DESC
        ) AS barcode_rank
      FROM silver.fct_o_production p CROSS JOIN clock k
      WHERE p.plant_code = 'BTP'
        AND LOWER(p.source_machine) IN (SELECT source_machine FROM comp_all)
        AND CAST(p.event_time AS timestamp) > k.as_of - INTERVAL '${OVERAGE_LOOKBACK_HOURS}' HOUR
        AND CAST(p.event_time AS timestamp) <= k.as_of
        AND NULLIF(${clean("p.production_id")}, '') IS NOT NULL
    ) p WHERE barcode_rank = 1
  ),
  lots AS (
    SELECT c.source_machine, c.dashboard_section, c.component, c.cat,
      ${clean("p.production_id")} AS barcode,
      ${clean("p.item_code")} AS item_code,
      ${key("p.item_code")} AS item_key,
      TRIM(p.machine_no) AS machine,
      NULLIF(TRIM(p.mhe_code), '') AS mhe_code,
      CAST(p.event_time AS timestamp) AS produced_at,
      RTRIM(REGEXP_REPLACE(LOWER(TRIM(p.quality_status)), '[0-9]+$', '')) AS st,
      CASE WHEN try_cast(p.live_quantity AS DECIMAL(18,4)) >= 0 THEN try_cast(p.live_quantity AS DECIMAL(18,4)) END AS live_posted,
      try_cast(CASE WHEN c.source_machine = 'mm' THEN p.weight ELSE p.quantity END AS DECIMAL(18,4)) AS produced_qty,
      (to_unixtime(k.as_of) - to_unixtime(CAST(p.event_time AS timestamp))) / 3600.0 AS age_hours
    FROM production_source p
    CROSS JOIN clock k
    INNER JOIN comp c ON c.source_machine = LOWER(p.source_machine)
    WHERE p.item_code IS NOT NULL
      ${itemCode === undefined ? "" : `AND ${clean("p.item_code")} = ${athenaLiteral(itemCode)}`}
  ),
  stock AS (
    SELECT l.*,
      CASE
        WHEN ea.max_aging_hours IS NOT NULL THEN ea.max_aging_hours
        WHEN bk.item_key IS NULL THEN ad.max_aging_hours
        ELSE ia.max_aging_hours
      END AS max_aging_hours,
      CASE
        WHEN ea.max_aging_hours IS NOT NULL THEN 'BOM - own machine'
        WHEN bk.item_key IS NULL AND ad.max_aging_hours IS NOT NULL THEN 'Item master'
        WHEN ia.max_aging_hours IS NOT NULL AND l.cat = 'extruder' THEN 'BOM - other machine'
        WHEN ia.max_aging_hours IS NOT NULL THEN 'BOM'
      END AS aging_source,
      CASE WHEN l.live_posted IS NOT NULL THEN l.live_posted WHEN l.st = 'consumed' THEN 0 ELSE COALESCE(l.produced_qty, 0) END AS live_qty,
      CASE WHEN l.live_posted IS NOT NULL THEN 'Posted' ELSE 'Assumed (no live qty posted)' END AS qty_source,
      CASE
        WHEN l.cat = 'extruder' THEN CASE
          WHEN contains(${ownCats}, 'tread') AND NOT contains(${ownCats}, 'sidewall') THEN 'Tread'
          WHEN contains(${ownCats}, 'sidewall') AND NOT contains(${ownCats}, 'tread') THEN 'Sidewall'
          WHEN UPPER(l.item_code) LIKE 'SW%' THEN 'Sidewall' ELSE 'Tread' END
        WHEN l.component = 'Mother Roll' THEN CASE
          WHEN ii.frc_compound = 1 AND ii.frc_steel = 1 THEN 'Belt Mother Roll'
          WHEN ii.frc_compound = 1 AND ii.frc_textile = 1 THEN 'Ply Mother Roll'
          ELSE 'Mother Roll from FRC - Unclassified' END
        ELSE l.component
      END AS product_type,
      CASE WHEN l.st = 'ready to use' THEN 'Ready To Use' WHEN l.st = 'decision pending' THEN 'Decision Pending' ELSE 'Consumed' END AS quality_status,
      u.name AS item_unit
    FROM lots l
    LEFT JOIN bom_keys bk ON bk.item_key = l.item_key
    LEFT JOIN ext_keys ek ON ek.item_key = l.item_key AND ek.ext_family = l.source_machine
    LEFT JOIN ext_aging ea ON ea.item_key = l.item_key AND ea.ext_family = l.source_machine
    LEFT JOIN ext_cats ec ON ec.item_key = l.item_key AND ec.ext_family = l.source_machine
    LEFT JOIN item_aging ia ON ia.item_key = l.item_key
    LEFT JOIN aging ad ON ad.mat_key = l.item_key
    LEFT JOIN item_info ii ON ii.item_key = l.item_key
    LEFT JOIN item_uom u ON u.item_key = l.item_key
    WHERE l.st IN ('ready to use', 'decision pending', 'consumed')
      -- Temporary plant-confirmed override: JT444 is Final Compound. Its master
      -- currently carries both Master and Final categories (including current rows).
      AND CASE WHEN l.source_machine = 'mm' AND l.item_key = 'jt444'
        THEN l.component = 'Final Compound'
        ELSE (l.cat IS NULL OR l.cat = 'extruder' OR contains(${cats("ii.cats")}, l.cat)) END
  ),
  stock_final AS (
    SELECT s.*,
      CASE WHEN s.product_type = 'Tread' THEN CASE
        WHEN s.source_machine IN ('triplex', 'dualex') THEN 'NOS'
        WHEN s.source_machine IN ('quadraplex', 'duplex') THEN 'M'
        WHEN UPPER(s.mhe_code) LIKE 'CST%' THEN 'M' ELSE 'NOS' END
      ELSE COALESCE(NULLIF(TRIM(s.item_unit), ''), 'Not set') END AS unit
    FROM stock s
    WHERE (s.product_type = 'Tread' AND s.source_machine IN ('dualex', 'triplex', 'quadraplex', 'quintuplex'))
       OR (s.product_type = 'Sidewall' AND s.source_machine IN ('duplex', 'triplex', 'quadraplex', 'quintuplex'))
       OR s.product_type NOT IN ('Tread', 'Sidewall')
  ),
  overage_candidates AS (
    SELECT dashboard_section, product_type, item_code, barcode, mhe_code, machine,
      produced_at,
      CASE WHEN hour(produced_at) < 7 THEN date_add('day', -1, date(produced_at)) ELSE date(produced_at) END AS production_date,
      CASE WHEN hour(produced_at) BETWEEN 7 AND 14 THEN 'A' WHEN hour(produced_at) BETWEEN 15 AND 22 THEN 'B' ELSE 'C' END AS shift,
      CAST(max_aging_hours AS DECIMAL(10,1)) AS max_aging_hours, aging_source,
      date_add('minute', CAST(ROUND(max_aging_hours * 60) AS BIGINT), produced_at) AS expired_at,
      CAST(age_hours AS DECIMAL(10,1)) AS age_hours,
      CAST(age_hours - max_aging_hours AS DECIMAL(10,1)) AS hours_over_limit,
      CAST(live_qty AS DECIMAL(18,2)) AS overage_qty, unit, qty_source, quality_status,
      COUNT(*) OVER (PARTITION BY barcode) > 1 AS classification_conflict
    FROM stock_final
    WHERE live_qty > 0 AND age_hours > max_aging_hours
  ),
  overage_barcode AS (
    SELECT * FROM overage_candidates WHERE 1 = 1
      ${productType === undefined ? "" : `AND product_type = ${athenaLiteral(productType)}`}
      ${unit === undefined ? "" : `AND unit = ${athenaLiteral(unit)}`}
  )`;
}

/** One grouped read for both card totals and product lines, including zeros. */
export function overageSummaryQuery(scope = {}) {
  if (scope.section !== undefined) validateScope(scope);
  const ctes = overageCtes(
    scope.section === undefined ? { allSections: true } : scope,
  );
  const layout =
    scope.section === undefined
      ? OVERAGE_LAYOUT
      : OVERAGE_LAYOUT.filter((r) => r[0] === scope.section);
  const sections = [...new Map(layout.map(([s, order]) => [s, order]))];
  const rows = [
    ...sections.map(
      ([s, order]) =>
        `('total', ${athenaLiteral(s)}, ${order}, CAST(NULL AS VARCHAR), 0)`,
    ),
    ...layout.map(
      ([s, so, p, po]) =>
        `('product', ${athenaLiteral(s)}, ${so}, ${athenaLiteral(p)}, ${po})`,
    ),
  ];
  return `SELECT * FROM (
${ctes},
  layout AS (SELECT * FROM (VALUES ${rows.join(",\n    ")}) AS l(kind, dashboard_section, section_order, product_type, product_order)),
  agg AS (
    SELECT CASE WHEN GROUPING(product_type) = 1 THEN 'total' ELSE 'product' END AS kind,
      dashboard_section, product_type, unit, SUM(overage_qty) AS overage_qty,
      MAX(CASE WHEN classification_conflict THEN 1 ELSE 0 END) AS classification_conflict
    FROM overage_barcode
    GROUP BY GROUPING SETS ((dashboard_section, unit), (dashboard_section, product_type, unit))
  )
SELECT COALESCE(l.kind, a.kind) AS kind,
  COALESCE(l.dashboard_section, a.dashboard_section) AS dashboard_section,
  COALESCE(l.section_order, section_layout.section_order, 99) AS section_order,
  COALESCE(l.product_type, a.product_type) AS product_type,
  COALESCE(l.product_order, 99) AS product_order,
  a.unit, COALESCE(a.overage_qty, 0) AS overage_qty,
  COALESCE(a.classification_conflict, 0) AS classification_conflict,
  CAST(k.as_of AS VARCHAR) AS as_of
FROM layout l FULL OUTER JOIN agg a
  ON a.kind = l.kind AND a.dashboard_section = l.dashboard_section
  AND (a.product_type = l.product_type OR (a.kind = 'total' AND l.kind = 'total'))
LEFT JOIN (SELECT DISTINCT dashboard_section, section_order FROM layout) section_layout
  ON section_layout.dashboard_section = a.dashboard_section
CROSS JOIN clock k
ORDER BY section_order, kind, product_order, product_type, unit
) AS overage_summary`;
}

function pageClause({ limit = 100, offset = 0 }) {
  if (
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > 200 ||
    !Number.isSafeInteger(offset) ||
    offset < 0 ||
    offset > 100000
  ) {
    throw new TypeError("Invalid overage page");
  }
  // One extra row determines hasMore without a second COUNT or raw-data read.
  return `OFFSET ${offset} ROWS LIMIT ${limit + 1}`;
}

export function overageItemsQuery(scope) {
  return `SELECT * FROM (
${overageCtes(scope)}
SELECT dashboard_section, product_type, item_code, unit,
  SUM(overage_qty) AS overage_qty,
  SUM(CASE WHEN qty_source <> 'Posted' THEN overage_qty ELSE 0 END) AS assumed_qty,
  COUNT(*) AS barcodes,
  array_join(array_sort(array_agg(DISTINCT machine)), ', ') AS machines,
  MAX(max_aging_hours) AS max_aging_hours,
  MIN(produced_at) AS oldest_produced_at,
  MAX(hours_over_limit) AS max_hours_over_limit,
  MAX(MAX(CASE WHEN classification_conflict THEN 1 ELSE 0 END)) OVER () AS classification_conflict,
  CAST((SELECT as_of FROM clock) AS VARCHAR) AS as_of
FROM overage_barcode
GROUP BY dashboard_section, product_type, item_code, unit
ORDER BY product_type, overage_qty DESC, item_code, unit
${pageClause(scope)}
) AS overage_items`;
}

export function overageBarcodesQuery(scope) {
  if (!scope.itemCode || !scope.productType)
    throw new TypeError("Item code and product type are required");
  return `SELECT * FROM (
${overageCtes(scope)}
SELECT barcode, mhe_code, machine, product_type, item_code, produced_at,
  production_date, shift, max_aging_hours, aging_source, expired_at, age_hours,
  hours_over_limit, overage_qty, unit, qty_source, quality_status,
  MAX(CASE WHEN classification_conflict THEN 1 ELSE 0 END) OVER () AS classification_conflict,
  CAST((SELECT as_of FROM clock) AS VARCHAR) AS as_of
FROM overage_barcode
ORDER BY hours_over_limit DESC, barcode, machine, unit
${pageClause(scope)}
) AS overage_barcodes`;
}
