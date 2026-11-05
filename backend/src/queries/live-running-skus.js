/** Required Athena/Glue tables; never substitute incomplete Bronze sources. */
export const LIVE_RUNNING_SKU_TABLES = Object.freeze([
  'silver.fct_o_production',
  'silver.fct_tbmpcr',
  'silver.fct_curingpcr',
  'silver.dim_wcmaster',
  'silver.dim_recipemaster',
  'silver.dim_tblitemmaster',
  'silver.dim_bom',
]);

/**
 * The Word specification's seven-day machine roster and freshness inference.
 * The specification treats Silver event_time as IST wall-clock time. Athena
 * exposes these values as timestamp with time zone, so strip the source zone
 * without shifting the recorded clock. Build the IST clock through a formatted
 * string: Athena's direct zoned-to-timestamp cast can normalize back to UTC.
 * Dashboard date and shift filters play no part in this live snapshot.
 *
 * Feed heads include every non-future source row, including excluded machines.
 * Running windows are source-specific; unknown/idle machines retain audit SKU
 * fields while live SKU fields remain null. This infers production freshness,
 * not a PLC run/stop state.
 */
export function liveRunningSkusQuery() {
  // The upstream service permits SELECT statements, including CTE subqueries.
  return String.raw`SELECT * FROM (
WITH
  clock AS (
    SELECT CAST(format_datetime(current_timestamp AT TIME ZONE 'Asia/Kolkata', 'yyyy-MM-dd HH:mm:ss.SSS') AS timestamp) AS as_of
  ),
  cfg AS (
    SELECT * FROM (VALUES
      ('mm', 'Mixing', CAST(NULL AS VARCHAR), 20),
      ('frc', 'Stock', '4 Roll', 45),
      ('trc', 'Stock', '3 Roll', 45),
      ('trcnew', 'Stock', '3 Roll', 45),
      ('duplex', 'Stock', 'Extruder', 45),
      ('dualex', 'Stock', 'Extruder', 90),
      ('triplex', 'Stock', 'Extruder', 45),
      ('quadraplex', 'Stock', 'Extruder', 60),
      ('quintuplex', 'Stock', 'Extruder', 45),
      ('coldfeed', 'Stock', 'Extruder', 180),
      ('wbc', 'Stock', 'Cutter', 60),
      ('wbcnew', 'Stock', 'Cutter', 60),
      ('htbc', 'Stock', 'Cutter', 120),
      ('ltbc', 'Stock', 'Cutter', 90),
      ('ltbcnew', 'Stock', 'Cutter', 60),
      ('mbc', 'Stock', 'Cutter', 90),
      ('chaffer', 'Stock', 'Slitter', 120),
      ('chafferslitter', 'Stock', 'Slitter', 120),
      ('capstrip', 'Stock', 'Slitter', 120),
      ('capstripnew', 'Stock', 'Slitter', 120),
      ('fws', 'Stock', 'Slitter', 240),
      ('fwsnew', 'Stock', 'Slitter', 240),
      ('camroon', 'Stock', 'Slitter', 240),
      ('camroonnew', 'Stock', 'Slitter', 240),
      ('vipobeadwinding', 'Stock', 'Bead', 120),
      ('oldwell', 'Stock', 'Bead', 120),
      ('allwell', 'Stock', 'Bead', 120),
      ('beadapexnew', 'Stock', 'Bead', 120),
      ('vmibeadapex', 'Stock', 'Bead', 120),
      ('tbmstage1', 'TBM', 'Carcass', 15),
      ('tbmpcr', 'TBM', 'Green Tyre', 15),
      ('curingpcr', 'Curing', CAST(NULL AS VARCHAR), 35)
    ) AS cfg(source_machine, section, sub_section, run_window_min)
  ),
  params AS (
    SELECT
      90 AS feed_stale_min
  ),
  op AS (
    SELECT
      LOWER(TRIM(p.source_machine)) AS source_machine,
      CASE
        WHEN LOWER(TRIM(p.source_machine)) IN ('trc', 'trcnew')
          THEN REGEXP_REPLACE(TRIM(p.machine_no), '(?i)_winder\s*[0-9]+$', '')
        ELSE TRIM(p.machine_no)
      END AS machine_id,
      TRIM(TRANSLATE(p.item_code, CHR(13) || CHR(10) || CHR(9), '')) AS sku,
      TRIM(TRANSLATE(p.item_name, CHR(13) || CHR(10) || CHR(9), '')) AS sku_name,
      CAST(p.event_time AS timestamp) AS event_time,
      try_cast(p.record_id AS BIGINT) AS rid
    FROM silver.fct_o_production AS p
    CROSS JOIN clock AS k
    INNER JOIN cfg AS c
      ON c.source_machine = LOWER(TRIM(p.source_machine))
    WHERE
      CAST(p.event_time AS timestamp) > k.as_of - INTERVAL '168' HOUR
      AND CAST(p.event_time AS timestamp) <= k.as_of
      AND p.machine_no IS NOT NULL
      AND LOWER(TRIM(p.machine_no)) NOT LIKE 'ncm%'
      AND NULLIF(TRIM(p.item_code), '') IS NOT NULL
      AND LOWER(TRIM(p.item_code)) <> 'reset'
  ),
  op_feed AS (
    SELECT MAX(CAST(p.event_time AS timestamp)) AS feed_last
    FROM silver.fct_o_production AS p
    CROSS JOIN clock AS k
    WHERE CAST(p.event_time AS timestamp) > k.as_of - INTERVAL '168' HOUR
      AND CAST(p.event_time AS timestamp) <= k.as_of
  ),
  op_last AS (
    SELECT o.*
    FROM (
      SELECT op.*, ROW_NUMBER() OVER (PARTITION BY op.source_machine, op.machine_id ORDER BY op.event_time DESC, op.rid DESC NULLS LAST) AS rn
      FROM op
    ) AS o
    WHERE o.rn = 1
  ),
  im_desc AS (
    SELECT
      LOWER(REPLACE(TRANSLATE(im.item_code, CHR(13) || CHR(10) || CHR(9), ''), ' ', '')) AS mat_key,
      MIN(NULLIF(TRIM(im.description), '')) AS descr
    FROM silver.dim_tblitemmaster AS im
    WHERE LOWER(CAST(im.is_current AS VARCHAR)) IN ('true', '1')
    GROUP BY 1
  ),
  bom AS (
    SELECT item_key, mat_key
    FROM (
      SELECT
        LOWER(REPLACE(TRANSLATE(b.plcbomname, CHR(13) || CHR(10) || CHR(9), ''), ' ', '')) AS item_key,
        LOWER(REPLACE(TRANSLATE(b.materialcode_o, CHR(13) || CHR(10) || CHR(9), ''), ' ', '')) AS mat_key,
        DENSE_RANK() OVER (PARTITION BY LOWER(REPLACE(TRANSLATE(b.plcbomname, CHR(13) || CHR(10) || CHR(9), ''), ' ', '')) ORDER BY try_cast(b.revision AS DOUBLE) DESC) AS rk
      FROM silver.dim_bom AS b
      WHERE b.materialcode_o IS NOT NULL
    ) AS r
    WHERE r.rk = 1
  ),
  bom_desc AS (
    SELECT
      b.item_key,
      COALESCE(MIN(CASE WHEN b.mat_key = b.item_key THEN d.descr END), MIN(d.descr)) AS descr
    FROM bom AS b
    INNER JOIN im_desc AS d
      ON d.mat_key = b.mat_key
    GROUP BY b.item_key
  ),
  op_machines AS (
    SELECT
      c.section,
      c.sub_section,
      l.source_machine,
      l.machine_id,
      l.sku AS last_sku,
      COALESCE(dd.descr, bd.descr, l.sku_name, l.sku) AS last_sku_description,
      l.event_time AS last_event_time,
      f.feed_last,
      c.run_window_min
    FROM op_last AS l
    INNER JOIN cfg AS c
      ON c.source_machine = l.source_machine
    CROSS JOIN op_feed AS f
    LEFT JOIN im_desc AS dd
      ON dd.mat_key = LOWER(REPLACE(l.sku, ' ', ''))
    LEFT JOIN bom_desc AS bd
      ON bd.item_key = LOWER(REPLACE(l.sku, ' ', ''))
  ),
  tbm AS (
    SELECT
      TRIM(wc.name) AS machine_id,
      NULLIF(TRIM(rm.description), '') AS sku,
      NULLIF(TRIM(rm.name), '') AS sku_name,
      CAST(p.event_time AS timestamp) AS event_time,
      p.barcode AS barcode
    FROM silver.fct_tbmpcr AS p
    CROSS JOIN clock AS k
    INNER JOIN silver.dim_wcmaster AS wc
      ON wc.record_id = p.wc_id
    LEFT JOIN silver.dim_recipemaster AS rm
      ON rm.record_id = p.recipe_id
    WHERE
      CAST(p.event_time AS timestamp) > k.as_of - INTERVAL '168' HOUR
      AND CAST(p.event_time AS timestamp) <= k.as_of
      AND LOWER(TRIM(wc.name)) NOT LIKE '%stage1'
      AND LOWER(TRIM(wc.name)) NOT IN ('unknown', 'bjtest', 'classification')
  ),
  tbm_feed AS (
    SELECT MAX(CAST(p.event_time AS timestamp)) AS feed_last
    FROM silver.fct_tbmpcr AS p
    CROSS JOIN clock AS k
    WHERE CAST(p.event_time AS timestamp) > k.as_of - INTERVAL '168' HOUR
      AND CAST(p.event_time AS timestamp) <= k.as_of
  ),
  tbm_machines AS (
    SELECT
      c.section,
      c.sub_section,
      'tbmpcr' AS source_machine,
      t.machine_id,
      t.sku AS last_sku,
      COALESCE(t.sku_name, t.sku) AS last_sku_description,
      t.event_time AS last_event_time,
      f.feed_last,
      c.run_window_min
    FROM (
      SELECT tbm.*, ROW_NUMBER() OVER (PARTITION BY tbm.machine_id ORDER BY tbm.event_time DESC, tbm.barcode DESC) AS rn
      FROM tbm
    ) AS t
    INNER JOIN cfg AS c
      ON c.source_machine = 'tbmpcr'
    CROSS JOIN tbm_feed AS f
    WHERE t.rn = 1
  ),
  cur AS (
    SELECT
      REGEXP_REPLACE(TRIM(wc.name), '(LH|RH)$', '') AS machine_id,
      NULLIF(TRIM(rm.description), '') AS sku,
      NULLIF(TRIM(rm.name), '') AS sku_name,
      CAST(c.event_time AS timestamp) AS event_time,
      c.barcode AS barcode
    FROM silver.fct_curingpcr AS c
    CROSS JOIN clock AS k
    INNER JOIN silver.dim_wcmaster AS wc
      ON wc.record_id = c.wc_id
    LEFT JOIN silver.dim_recipemaster AS rm
      ON rm.record_id = c.recipe_id
    WHERE
      CAST(c.event_time AS timestamp) > k.as_of - INTERVAL '168' HOUR
      AND CAST(c.event_time AS timestamp) <= k.as_of
  ),
  cur_feed AS (
    SELECT MAX(CAST(c.event_time AS timestamp)) AS feed_last
    FROM silver.fct_curingpcr AS c
    CROSS JOIN clock AS k
    WHERE CAST(c.event_time AS timestamp) > k.as_of - INTERVAL '168' HOUR
      AND CAST(c.event_time AS timestamp) <= k.as_of
  ),
  cur_machines AS (
    SELECT
      cf.section,
      CASE WHEN regexp_like(t.machine_id, '^[0-9]{5}$') THEN concat('Trench ', substr(t.machine_id, 1, 1)) ELSE 'BOM Presses' END AS sub_section,
      'curingpcr' AS source_machine,
      t.machine_id,
      t.sku AS last_sku,
      COALESCE(t.sku_name, t.sku) AS last_sku_description,
      t.event_time AS last_event_time,
      f.feed_last,
      cf.run_window_min
    FROM (
      SELECT cur.*, ROW_NUMBER() OVER (PARTITION BY cur.machine_id ORDER BY cur.event_time DESC, cur.barcode DESC) AS rn
      FROM cur
    ) AS t
    INNER JOIN cfg AS cf
      ON cf.source_machine = 'curingpcr'
    CROSS JOIN cur_feed AS f
    WHERE t.rn = 1
  ),
  machines AS (
    SELECT * FROM op_machines
    UNION ALL
    SELECT * FROM tbm_machines
    UNION ALL
    SELECT * FROM cur_machines
  ),
  scored AS (
    SELECT
      m.*,
      k.as_of,
      ROUND((to_unixtime(k.as_of) - to_unixtime(m.last_event_time)) / 60.0, 1) AS minutes_since_update,
      ROUND((to_unixtime(m.feed_last) - to_unixtime(m.last_event_time)) / 60.0, 1) AS minutes_behind_feed,
      ROUND((to_unixtime(k.as_of) - to_unixtime(m.feed_last)) / 60.0, 1) AS feed_lag_min,
      pr.feed_stale_min
    FROM machines AS m
    CROSS JOIN clock AS k
    CROSS JOIN params AS pr
  ),
  classified AS (
    SELECT
      s.*,
      CAST(CASE
        WHEN s.feed_lag_min > s.feed_stale_min THEN 'Unknown'
        WHEN s.last_sku IS NULL THEN 'Unknown'
        WHEN s.minutes_behind_feed <= s.run_window_min THEN 'Running'
        ELSE 'Idle'
      END AS VARCHAR) AS machine_status
    FROM scored AS s
  )
SELECT
  c.section AS section,
  c.sub_section AS sub_section,
  c.source_machine AS source_machine,
  c.machine_id AS machine_id,
  CASE WHEN c.machine_status = 'Running' THEN c.last_sku END AS live_sku,
  CASE WHEN c.machine_status = 'Running' THEN c.last_sku_description END AS live_sku_description,
  c.machine_status AS machine_status,
  CAST(CASE
  WHEN c.feed_lag_min > c.feed_stale_min THEN concat('Feed stale: no new MES rows for ', CAST(c.feed_lag_min AS VARCHAR), ' min')
  WHEN c.last_sku IS NULL THEN 'Last record has no SKU / recipe not in recipe master'
  WHEN c.machine_status = 'Running' THEN concat('Producing: last record ', CAST(c.minutes_behind_feed AS VARCHAR), ' min before feed head (window ', CAST(c.run_window_min AS VARCHAR), ' min)')
  ELSE concat('No production for ', CAST(c.minutes_behind_feed AS VARCHAR), ' min (window ', CAST(c.run_window_min AS VARCHAR), ' min)')
  END AS VARCHAR) AS status_reason,
  c.last_sku AS last_sku,
  c.last_sku_description AS last_sku_description,
  c.last_event_time AS event_time,
  format_datetime(c.last_event_time, 'yyyy-MM-dd HH:mm:ss') AS last_updated,
  c.minutes_since_update AS minutes_since_update,
  c.minutes_behind_feed AS minutes_behind_feed,
  c.feed_last AS feed_last_event,
  c.run_window_min AS run_window_min,
  c.as_of AS as_of
FROM classified AS c
) AS live_running_sku_snapshot`;
}
