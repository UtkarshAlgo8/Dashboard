-- TUO - barcode detail (status only: this Silver table has no parameters)
-- Click on an off-spec count (machine x SKU x parameter) -> one row per off-spec tyre.
-- Parameters: :from_date, :to_date (production dates, 07:00 rule), :machine, :sku, :shift ('ALL' or 'A'/'B'/'C').
-- Same rules as the Gold KPIs: latest test per barcode, same OE grades, same SKU lookup.
-- Filters ignore case: Gold stores machine upper-cased (MICROPOISE), Silver does not (Micropoise).
-- Reading from the window start onwards is exact: a test before the window can never be a barcode's latest test
-- once the barcode was re-tested inside it, and a re-test after the window removes the tyre exactly as Gold does.
WITH t AS (
    SELECT
        *,
        ROW_NUMBER() OVER (PARTITION BY barcode ORDER BY event_time DESC) AS rn
    FROM `jk-infiniti-datalake`.silver.fct_vtuodata_view
    WHERE event_time >= to_timestamp(:from_date) + INTERVAL 7 HOURS
)
SELECT
    b.barcode,
    b.event_time AS test_time,
    CASE WHEN hour(b.event_time) < 7 THEN date_sub(date(b.event_time), 1) ELSE date(b.event_time) END AS production_date,
    CASE WHEN hour(b.event_time) BETWEEN 7 AND 14 THEN 'A' WHEN hour(b.event_time) BETWEEN 15 AND 22 THEN 'B' ELSE 'C' END AS shift,
    b.wc_name AS machine,
    b.recipe_description AS sku,
    b.status_name AS status,
    b.first_name AS operator
FROM t AS b
WHERE b.rn = 1
  AND b.event_time < to_timestamp(date_add(:to_date, 1)) + INTERVAL 7 HOURS
  AND b.status_name <> 'OE'
  AND upper(b.wc_name) = upper(:machine)
  AND upper(b.recipe_description) = upper(:sku)
  AND (:shift = 'ALL' OR CASE WHEN hour(b.event_time) BETWEEN 7 AND 14 THEN 'A' WHEN hour(b.event_time) BETWEEN 15 AND 22 THEN 'B' ELSE 'C' END = :shift)
ORDER BY b.event_time DESC
