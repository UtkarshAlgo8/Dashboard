/**
 * SKU Fulfillment page model (SKU Fulfillment Page — Dev Spec, 14-Oct-2026).
 *
 * Pure functions over gold-shaped rows — the data source (temporary JSON or
 * live gold) is chosen in api/skuFulfilment.js, never here.
 *
 * Views, resolved from the dashboard's own filters:
 *   day   — Today or a single custom date. Granularity DAY, or SHIFT A-C when
 *           a shift is picked (the shift's own rows, read verbatim).
 *           Main = Daily %, 4 cards, daily SKU table.
 *   month — MONTH row dated the 1st. Main = MTD %, 2 MTD cards, MTD SKU table.
 *   range — a multi-day custom range (not in the spec). Daily KPIs over the
 *           days that carry a schedule: quantities summed, percentages
 *           averaged. MTD running totals cannot be summed, so no MTD cards.
 *
 * KPI names are `${prefix}_${base}` + "" (all product types) |
 * "_producttype" | "_sku"; prefix is "Curing" or "Building".
 */

import { canonicalizeProductType } from "@/lib/dashboardRowScopes.js";

const SHIFT_ORDER = ["SHIFT A", "SHIFT B", "SHIFT C"];

const FAMILY = ["Schedule_Qty", "Actual_Qty", "SKU_Fulfilment_Pct"];
const OVER_UNDER = [
  "Overproduction_Qty",
  "Overproduction_Pct",
  "Underproduction_Qty",
  "Underproduction_Pct",
];
const SKU_TABLE = [
  "Schedule_Qty",
  "Actual_Qty",
  "Overproduction_Qty",
  "Underproduction_Qty",
];

const kpiName = (prefix, period, base, level = "") =>
  `${prefix}_${period}_${base}${level}`;

function shiftIsoDate(iso, days) {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function monthEnd(firstOfMonth) {
  const d = new Date(`${firstOfMonth}T12:00:00`);
  d.setMonth(d.getMonth() + 1, 0);
  return d.toISOString().slice(0, 10);
}

/**
 * Which view the dashboard filters select, or null when none applies
 * (e.g. Year, which has no granularity).
 *
 * @param {object} f
 * @param {string|null} f.granularity  dashboard granularity
 * @param {string|null} f.singleDay    the selected single day, if any
 * @param {string|null} f.from         window start (1st of month for Month)
 * @param {string|null} f.to           window end
 */
export function resolveSkuFulfilmentView({ granularity, singleDay, from, to }) {
  if (granularity === "MONTH" && from) {
    const first = `${from.slice(0, 7)}-01`;
    return { kind: "month", granularity: "MONTH", from: first, to: first };
  }
  if (singleDay) {
    const gran = SHIFT_ORDER.includes(granularity) ? granularity : "DAY";
    return { kind: "day", granularity: gran, from: singleDay, to: singleDay };
  }
  if (granularity === "DAY" && from && to) {
    return { kind: "range", granularity: "DAY", from, to };
  }
  return null;
}

/** True when the product-type pill means "all product types". */
export function isAllProductTypes(productType, totalProductType) {
  return (
    !productType ||
    canonicalizeProductType(productType) ===
      canonicalizeProductType(totalProductType)
  );
}

/**
 * The row fetches a view needs: [{ granularity, from, to, kpiNames }].
 * Only the KPI level the product filter uses is requested (totals for All,
 * _producttype otherwise); the SKU level always comes along for the table
 * and the card SKU counts.
 */
export function skuFulfilmentRequests(view, { prefix, allProducts }) {
  if (!view) return [];
  const level = allProducts ? "" : "_producttype";
  const headline = (period) =>
    [...FAMILY, ...OVER_UNDER].map((b) => kpiName(prefix, period, b, level));
  const skus = (period, bases) =>
    bases.map((b) => kpiName(prefix, period, b, "_sku"));
  const window = {
    granularity: view.granularity,
    from: view.from,
    to: view.to,
  };

  if (view.kind === "day") {
    return [
      {
        ...window,
        kpiNames: [
          ...headline("Daily"),
          ...headline("MTD"),
          ...skus("Daily", SKU_TABLE),
          ...skus("MTD", ["Overproduction_Qty", "Underproduction_Qty"]),
        ],
      },
    ];
  }
  if (view.kind === "month") {
    // The "as of <date> shift <X>" label: newest SHIFT row in the month.
    const asOfName = kpiName(prefix, "MTD", "Schedule_Qty");
    return [
      { ...window, kpiNames: [...headline("MTD"), ...skus("MTD", SKU_TABLE)] },
      ...SHIFT_ORDER.map((granularity) => ({
        granularity,
        from: view.from,
        to: monthEnd(view.from),
        kpiNames: [asOfName],
      })),
    ];
  }
  return [
    {
      ...window,
      kpiNames: [...headline("Daily"), ...skus("Daily", SKU_TABLE)],
    },
  ];
}

const num = (v) => {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number.parseFloat(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * Index rows by kpi_name → granularity → date → [rows], keeping only the
 * selected product type (total rows are kept as-is: they are only requested
 * for "All").
 */
function indexRows(rows, { allProducts, productType }) {
  const want = allProducts ? null : canonicalizeProductType(productType);
  const idx = new Map();
  for (const r of rows ?? []) {
    const name = r.kpi_name ?? r.kpiName;
    const isTotal = !name.endsWith("_producttype") && !name.endsWith("_sku");
    if (
      want &&
      !isTotal &&
      canonicalizeProductType(r.product_type ?? r.productType) !== want
    ) {
      continue;
    }
    const date = String(r.date ?? "").slice(0, 10);
    const key = `${name}|${r.granularity}|${date}`;
    if (!idx.has(key)) idx.set(key, []);
    idx.get(key).push(r);
  }
  return idx;
}

function makeReader(idx, { prefix, allProducts }) {
  const level = allProducts ? "" : "_producttype";
  const rowsOf = (name, gran, date) => idx.get(`${name}|${gran}|${date}`) ?? [];
  return {
    /** Headline value (total or _producttype level); undefined = no row. */
    value(period, base, gran, date) {
      const rows = rowsOf(kpiName(prefix, period, base, level), gran, date);
      if (rows.length === 0) return undefined;
      return num(rows[0].actual_value ?? rows[0].actualValue);
    },
    /** _sku rows as Map itemcode → value. */
    skus(period, base, gran, date) {
      const out = new Map();
      for (const r of rowsOf(
        kpiName(prefix, period, base, "_sku"),
        gran,
        date,
      )) {
        const code = r.itemcode ?? r.itemCode;
        if (!code) continue;
        out.set(code, num(r.actual_value ?? r.actualValue) ?? 0);
      }
      return out;
    },
  };
}

const countPositive = (map) => [...map.values()].filter((v) => v > 0).length;

const mean = (xs) =>
  xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;

/** Table rows: SKU, scheduled, actual, deviation; 0/0 rows dropped. */
function tableRows(schedule, actual) {
  const codes = new Set([...schedule.keys(), ...actual.keys()]);
  return [...codes]
    .map((sku) => {
      const scheduled = schedule.get(sku) ?? 0;
      const act = actual.get(sku) ?? 0;
      return { sku, scheduled, actual: act, deviation: act - scheduled };
    })
    .filter((r) => r.scheduled !== 0 || r.actual !== 0)
    .sort(
      (a, b) =>
        Math.abs(b.deviation) - Math.abs(a.deviation) ||
        a.sku.localeCompare(b.sku),
    );
}

function card(id, label, qty, pct, skuCount, noSchedule) {
  return { id, label, qty, pct, skuCount, noSchedule };
}

const shiftLetter = (gran) => gran.replace("SHIFT ", "");

/**
 * Build the page model from fetched rows.
 *
 * @returns {{
 *   main: { label, value, schedule, actual, note },
 *   cards: { id, label, qty, pct, skuCount, noSchedule }[],
 *   table: { sku, scheduled, actual, deviation }[],
 *   tableLabel: string,
 *   empty: boolean,
 * }}
 */
export function buildSkuFulfilment(rows, view, opts) {
  const { prefix, productType } = opts;
  const allProducts = opts.allProducts;
  const idx = indexRows(rows, { allProducts, productType });
  const read = makeReader(idx, { prefix, allProducts });
  const hasRows = idx.size > 0;

  if (view.kind === "day") {
    const { granularity: g, from: d } = view;
    const sched = read.value("Daily", "Schedule_Qty", g, d);
    const mtdSched = read.value("MTD", "Schedule_Qty", g, d);
    const hasSchedule = sched > 0;
    const hasMtdSchedule = mtdSched > 0;
    const shiftNote = g === "DAY" ? null : `Shift ${shiftLetter(g)}`;
    const dailySkus = (base) =>
      hasSchedule ? read.skus("Daily", base, g, d) : new Map();
    return {
      main: {
        label: "Daily SKU Fulfillment %",
        value: hasSchedule
          ? read.value("Daily", "SKU_Fulfilment_Pct", g, d)
          : null,
        schedule: sched ?? null,
        actual: read.value("Daily", "Actual_Qty", g, d) ?? null,
        note: !hasRows
          ? "No data for this day"
          : !hasSchedule
            ? "No schedule for this day"
            : shiftNote,
      },
      cards: [
        card(
          "dailyOver",
          "Daily Overproduction",
          hasSchedule ? read.value("Daily", "Overproduction_Qty", g, d) : null,
          hasSchedule ? read.value("Daily", "Overproduction_Pct", g, d) : null,
          countPositive(dailySkus("Overproduction_Qty")),
          !hasSchedule,
        ),
        card(
          "dailyUnder",
          "Daily Underproduction",
          hasSchedule ? read.value("Daily", "Underproduction_Qty", g, d) : null,
          hasSchedule ? read.value("Daily", "Underproduction_Pct", g, d) : null,
          countPositive(dailySkus("Underproduction_Qty")),
          !hasSchedule,
        ),
        card(
          "mtdOver",
          "MTD Overproduction",
          read.value("MTD", "Overproduction_Qty", g, d) ?? null,
          read.value("MTD", "Overproduction_Pct", g, d) ?? null,
          countPositive(read.skus("MTD", "Overproduction_Qty", g, d)),
          !hasMtdSchedule,
        ),
        card(
          "mtdUnder",
          "MTD Underproduction",
          read.value("MTD", "Underproduction_Qty", g, d) ?? null,
          read.value("MTD", "Underproduction_Pct", g, d) ?? null,
          countPositive(read.skus("MTD", "Underproduction_Qty", g, d)),
          !hasMtdSchedule,
        ),
      ],
      table: tableRows(dailySkus("Schedule_Qty"), dailySkus("Actual_Qty")),
      tableLabel: "Values of the selected day",
      empty: !hasRows,
    };
  }

  if (view.kind === "month") {
    const { granularity: g, from: d } = view;
    const sched = read.value("MTD", "Schedule_Qty", g, d);
    const hasSchedule = sched > 0;

    // Newest SHIFT row in the month (all product types; the as-of rows are
    // requested at the total level only).
    let asOf = null;
    const asOfName = kpiName(prefix, "MTD", "Schedule_Qty");
    for (const r of rows ?? []) {
      if ((r.kpi_name ?? r.kpiName) !== asOfName) continue;
      if (!SHIFT_ORDER.includes(r.granularity)) continue;
      const date = String(r.date).slice(0, 10);
      const rank = `${date}|${SHIFT_ORDER.indexOf(r.granularity)}`;
      if (!asOf || rank > asOf.rank) {
        asOf = { rank, date, shift: shiftLetter(r.granularity) };
      }
    }

    return {
      main: {
        label: "MTD SKU Fulfillment %",
        value: hasSchedule
          ? read.value("MTD", "SKU_Fulfilment_Pct", g, d)
          : null,
        schedule: sched ?? null,
        actual: read.value("MTD", "Actual_Qty", g, d) ?? null,
        note: !hasRows
          ? "No data for this month"
          : !hasSchedule
            ? "No schedule for this month"
            : null,
        asOf: asOf ? { date: asOf.date, shift: asOf.shift } : null,
      },
      cards: [
        card(
          "mtdOver",
          "MTD Overproduction",
          read.value("MTD", "Overproduction_Qty", g, d) ?? null,
          read.value("MTD", "Overproduction_Pct", g, d) ?? null,
          countPositive(read.skus("MTD", "Overproduction_Qty", g, d)),
          !hasSchedule,
        ),
        card(
          "mtdUnder",
          "MTD Underproduction",
          read.value("MTD", "Underproduction_Qty", g, d) ?? null,
          read.value("MTD", "Underproduction_Pct", g, d) ?? null,
          countPositive(read.skus("MTD", "Underproduction_Qty", g, d)),
          !hasSchedule,
        ),
      ],
      table: hasSchedule
        ? tableRows(
            read.skus("MTD", "Schedule_Qty", g, d),
            read.skus("MTD", "Actual_Qty", g, d),
          )
        : [],
      tableLabel: "Cumulative MTD values",
      empty: !hasRows,
    };
  }

  // range: Daily KPIs over the days that carry a schedule.
  const g = view.granularity;
  const days = [];
  for (let d = view.from; d <= view.to; d = shiftIsoDate(d, 1)) {
    if (read.value("Daily", "Schedule_Qty", g, d) > 0) days.push(d);
  }
  const sum = (base) =>
    days.reduce((acc, d) => acc + (read.value("Daily", base, g, d) ?? 0), 0);
  const avg = (base) =>
    mean(
      days.map((d) => read.value("Daily", base, g, d)).filter((v) => v != null),
    );
  const sumSkus = (base) => {
    const out = new Map();
    for (const d of days) {
      for (const [code, v] of read.skus("Daily", base, g, d)) {
        out.set(code, (out.get(code) ?? 0) + v);
      }
    }
    return out;
  };
  const hasSchedule = days.length > 0;
  return {
    main: {
      label: "Avg Daily SKU Fulfillment %",
      value: hasSchedule ? avg("SKU_Fulfilment_Pct") : null,
      schedule: hasSchedule ? sum("Schedule_Qty") : null,
      actual: hasSchedule ? sum("Actual_Qty") : null,
      note: !hasRows
        ? "No data for this range"
        : !hasSchedule
          ? "No schedule in this range"
          : `avg of ${days.length} scheduled day${days.length === 1 ? "" : "s"}`,
    },
    cards: [
      card(
        "dailyOver",
        "Overproduction",
        hasSchedule ? sum("Overproduction_Qty") : null,
        hasSchedule ? avg("Overproduction_Pct") : null,
        countPositive(sumSkus("Overproduction_Qty")),
        !hasSchedule,
      ),
      card(
        "dailyUnder",
        "Underproduction",
        hasSchedule ? sum("Underproduction_Qty") : null,
        hasSchedule ? avg("Underproduction_Pct") : null,
        countPositive(sumSkus("Underproduction_Qty")),
        !hasSchedule,
      ),
    ],
    table: tableRows(sumSkus("Schedule_Qty"), sumSkus("Actual_Qty")),
    tableLabel: `Daily values summed over ${days.length} scheduled day${days.length === 1 ? "" : "s"}`,
    empty: !hasRows,
  };
}
