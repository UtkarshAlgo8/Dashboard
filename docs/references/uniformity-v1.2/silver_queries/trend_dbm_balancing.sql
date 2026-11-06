-- DBM balancing - parameter raw-value trend
-- Click the plot icon on a parameter row (machine x SKU x parameter) -> one point per tested tyre: raw value over time.
-- Parameters: :from_date, :to_date (production dates, 07:00 rule), :machine, :sku, :parameter, :shift ('ALL' or 'A'/'B'/'C').
-- Same rules as the Gold KPIs: latest test per barcode, same OE grades, same SKU lookup.
-- Filters ignore case: Gold stores machine upper-cased (MICROPOISE), Silver does not (Micropoise).
-- Reading from the window start onwards is exact: a test before the window can never be a barcode's latest test
-- once the barcode was re-tested inside it, and a re-test after the window removes the tyre exactly as Gold does.
WITH rm AS (
    SELECT tyre_size, MIN(description) AS sku
    FROM `jk-infiniti-datalake`.silver.dim_recipemaster
    GROUP BY tyre_size
),
t AS (
    SELECT
        *,
        ROW_NUMBER() OVER (PARTITION BY barcode ORDER BY event_time DESC) AS rn
    FROM `jk-infiniti-datalake`.silver.fct_productiondatapcrdbnew
    WHERE event_time >= to_timestamp(:from_date) + INTERVAL 7 HOURS
),
d AS (
    SELECT
        b.barcode,
        b.event_time AS test_time,
        CASE WHEN hour(b.event_time) < 7 THEN date_sub(date(b.event_time), 1) ELSE date(b.event_time) END AS production_date,
        CASE WHEN hour(b.event_time) BETWEEN 7 AND 14 THEN 'A' WHEN hour(b.event_time) BETWEEN 15 AND 22 THEN 'B' ELSE 'C' END AS shift,
        CASE WHEN b.wc_id = 278 THEN 'Micropoise' WHEN b.wc_id = 279 THEN '30-0224' WHEN b.wc_id = 280 THEN '30-0297' ELSE CAST(b.wc_id AS STRING) END AS machine,
        COALESCE(rm.sku, b.item_code) AS sku,
        p.parameter,
        CASE p.parameter
            WHEN 'Upper Unbalance' THEN CAST(b.upper AS DOUBLE)
            WHEN 'Lower Unbalance' THEN CAST(b.lower AS DOUBLE)
            WHEN 'Static Unbalance' THEN CAST(b.static AS DOUBLE)
            WHEN 'Couple Unbalance' THEN CAST(b.couple AS DOUBLE)
        END AS actual_value,
        CASE p.parameter
            WHEN 'Upper Unbalance' THEN CAST(b.upper_grade AS STRING)
            WHEN 'Lower Unbalance' THEN CAST(b.lower_grade AS STRING)
            WHEN 'Static Unbalance' THEN CAST(b.static_grade AS STRING)
            WHEN 'Couple Unbalance' THEN CAST(b.couple_grade AS STRING)
        END AS grade,
        CASE p.parameter
            WHEN 'Upper Unbalance' THEN CASE WHEN b.upper_grade IN ('0', '1') THEN 0 ELSE 1 END
            WHEN 'Lower Unbalance' THEN CASE WHEN b.lower_grade IN ('0', '1') THEN 0 ELSE 1 END
            WHEN 'Static Unbalance' THEN CASE WHEN b.static_grade IN ('0', '1') THEN 0 ELSE 1 END
            WHEN 'Couple Unbalance' THEN CASE WHEN b.couple_grade IN ('0', '1') THEN 0 ELSE 1 END
        END AS is_off_spec
    FROM t AS b
    LEFT JOIN rm ON rm.tyre_size = b.item_code
    CROSS JOIN (VALUES
        ('Upper Unbalance'),
        ('Lower Unbalance'),
        ('Static Unbalance'),
        ('Couple Unbalance')
    ) AS p(parameter)
    WHERE b.rn = 1
      AND b.event_time < to_timestamp(date_add(:to_date, 1)) + INTERVAL 7 HOURS
)
SELECT test_time, barcode, production_date, shift, machine, sku, parameter, actual_value, grade, is_off_spec
FROM d
WHERE actual_value IS NOT NULL
  AND upper(machine) = upper(:machine)
  AND upper(sku) = upper(:sku)
  AND upper(parameter) = upper(:parameter)
  AND (:shift = 'ALL' OR shift = :shift)
ORDER BY test_time
