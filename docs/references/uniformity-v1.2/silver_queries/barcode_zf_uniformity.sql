-- ZF uniformity - barcode detail
-- Click on an off-spec count (machine x SKU x parameter) -> one row per off-spec tyre.
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
    FROM `jk-infiniti-datalake`.silver.fct_productiondatatuonew
    WHERE event_time >= to_timestamp(:from_date) + INTERVAL 7 HOURS
),
d AS (
    SELECT
        b.barcode,
        b.event_time AS test_time,
        CASE WHEN hour(b.event_time) < 7 THEN date_sub(date(b.event_time), 1) ELSE date(b.event_time) END AS production_date,
        CASE WHEN hour(b.event_time) BETWEEN 7 AND 14 THEN 'A' WHEN hour(b.event_time) BETWEEN 15 AND 22 THEN 'B' ELSE 'C' END AS shift,
        b.machine_name AS machine,
        COALESCE(rm.sku, b.tire_type) AS sku,
        p.parameter,
        CAST(NULL AS DOUBLE) AS actual_value,   -- this Silver table holds grades only, no measured values
        CASE p.parameter
            WHEN 'RFV CW' THEN CAST(b.grade_rfv_cw AS STRING)
            WHEN 'H1 RFV CW' THEN CAST(b.grade_h1_rfv_cw AS STRING)
            WHEN 'LFV CW' THEN CAST(b.grade_lfv_cw AS STRING)
            WHEN 'RFV CCW' THEN CAST(b.grade_rfv_ccw AS STRING)
            WHEN 'H1 RFV CCW' THEN CAST(b.grade_h1_rfv_ccw AS STRING)
            WHEN 'LFV CCW' THEN CAST(b.grade_lfv_ccw AS STRING)
            WHEN 'Conicity' THEN CAST(b.grade_conicity AS STRING)
            WHEN 'RRO' THEN CAST(b.grade_rro AS STRING)
            WHEN 'Upper LRO' THEN CAST(b.grade_upper_lro AS STRING)
            WHEN 'Lower LRO' THEN CAST(b.grade_lower_lro AS STRING)
            WHEN 'Upper Bulge' THEN CAST(b.grade_upper_bulge AS STRING)
            WHEN 'Lower Bulge' THEN CAST(b.grade_lower_bulge AS STRING)
            WHEN 'Upper Depression' THEN CAST(b.grade_upper_depression AS STRING)
            WHEN 'Lower Depression' THEN CAST(b.grade_lower_depression AS STRING)
        END AS grade,
        CASE p.parameter
            WHEN 'RFV CW' THEN CASE WHEN b.grade_rfv_cw IN ('A', 'B') THEN 0 ELSE 1 END
            WHEN 'H1 RFV CW' THEN CASE WHEN b.grade_h1_rfv_cw IN ('A', 'B') THEN 0 ELSE 1 END
            WHEN 'LFV CW' THEN CASE WHEN b.grade_lfv_cw IN ('A', 'B') THEN 0 ELSE 1 END
            WHEN 'RFV CCW' THEN CASE WHEN b.grade_rfv_ccw IN ('A', 'B') THEN 0 ELSE 1 END
            WHEN 'H1 RFV CCW' THEN CASE WHEN b.grade_h1_rfv_ccw IN ('A', 'B') THEN 0 ELSE 1 END
            WHEN 'LFV CCW' THEN CASE WHEN b.grade_lfv_ccw IN ('A', 'B') THEN 0 ELSE 1 END
            WHEN 'Conicity' THEN CASE WHEN b.grade_conicity IN ('A', 'B') THEN 0 ELSE 1 END
            WHEN 'RRO' THEN CASE WHEN b.grade_rro IN ('A', 'B') THEN 0 ELSE 1 END
            WHEN 'Upper LRO' THEN CASE WHEN b.grade_upper_lro IN ('A', 'B') THEN 0 ELSE 1 END
            WHEN 'Lower LRO' THEN CASE WHEN b.grade_lower_lro IN ('A', 'B') THEN 0 ELSE 1 END
            WHEN 'Upper Bulge' THEN CASE WHEN b.grade_upper_bulge IN ('A', 'B') THEN 0 ELSE 1 END
            WHEN 'Lower Bulge' THEN CASE WHEN b.grade_lower_bulge IN ('A', 'B') THEN 0 ELSE 1 END
            WHEN 'Upper Depression' THEN CASE WHEN b.grade_upper_depression IN ('A', 'B') THEN 0 ELSE 1 END
            WHEN 'Lower Depression' THEN CASE WHEN b.grade_lower_depression IN ('A', 'B') THEN 0 ELSE 1 END
        END AS is_off_spec
    FROM t AS b
    LEFT JOIN rm ON rm.tyre_size = b.tire_type
    CROSS JOIN (VALUES
        ('RFV CW'),
        ('H1 RFV CW'),
        ('LFV CW'),
        ('RFV CCW'),
        ('H1 RFV CCW'),
        ('LFV CCW'),
        ('Conicity'),
        ('RRO'),
        ('Upper LRO'),
        ('Lower LRO'),
        ('Upper Bulge'),
        ('Lower Bulge'),
        ('Upper Depression'),
        ('Lower Depression')
    ) AS p(parameter)
    WHERE b.rn = 1
      AND b.event_time < to_timestamp(date_add(:to_date, 1)) + INTERVAL 7 HOURS
)
SELECT barcode, test_time, production_date, shift, machine, sku, parameter, actual_value, grade
FROM d
WHERE is_off_spec = 1
  AND upper(machine) = upper(:machine)
  AND upper(sku) = upper(:sku)
  AND upper(parameter) = upper(:parameter)
  AND (:shift = 'ALL' OR shift = :shift)
ORDER BY test_time DESC
