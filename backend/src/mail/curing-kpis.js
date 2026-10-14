/**
 * The 9 Curing numbers the Daily Infiniti Scheduler mail needs, for one report
 * day ("Daily Infiniti Scheduler Mail — Curing KPI Automation" doc).
 *
 * Every KPI is read at granularity DAY for the report day. MTD KPIs use the
 * DAY row too (month-to-date at the end of that day) — never the MONTH row,
 * which always holds the latest value and would mix days.
 *
 * Source (config.mail.kpiSource):
 *   "snapshot" — TEMPORARY default: only the static extract the Curing SKU
 *                Fulfillment card also reads, until gold carries these KPIs.
 *                Skips the gold query, which returns nothing for them today.
 *   "gold"     — gold first (base / rolling daily table via goldSource), the
 *                extract for any value gold is missing.
 * A value missing everywhere stays null and fails the data check. Results are
 * cached per report day for config.mail.valuesTtlMs.
 */
import fs from "node:fs/promises";
import { config } from "../config.js";
import { runQuery } from "../utils/upstream.js";
import { DATE_YYYYMMDD, isoToYyyymmdd } from "../queries/sql-date.js";
import { goldSource } from "../queries/gold-source.js";
import { plantPredicate } from "../utils/normalize.js";

const PLANT_ID = "banmore";

/** Mail value → the total KPI it reads, and the _sku KPI it counts SKUs from. */
export const MAIL_FIELDS = [
  { key: "mtd_under_pct", kpi: "Curing_MTD_Underproduction_Pct" },
  { key: "mtd_under_skus", skuKpi: "Curing_MTD_Underproduction_Qty_sku" },
  { key: "mtd_over_pct", kpi: "Curing_MTD_Overproduction_Pct" },
  { key: "mtd_over_skus", skuKpi: "Curing_MTD_Overproduction_Qty_sku" },
  { key: "daily_fulfilment_pct", kpi: "Curing_Daily_SKU_Fulfilment_Pct" },
  { key: "daily_over_qty", kpi: "Curing_Daily_Overproduction_Qty" },
  { key: "daily_over_skus", skuKpi: "Curing_Daily_Overproduction_Qty_sku" },
  { key: "daily_under_qty", kpi: "Curing_Daily_Underproduction_Qty" },
  { key: "daily_under_skus", skuKpi: "Curing_Daily_Underproduction_Qty_sku" },
];

const ALL_KPIS = MAIL_FIELDS.map((f) => f.kpi ?? f.skuKpi);

function toNumber(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * The doc's one-row query. Totals are the itemcode-NULL rows; SKU counts are
 * distinct itemcodes with a value above 0. Each count is NULL (not 0) when its
 * _sku KPI has no rows at all, so "not loaded" is not mistaken for "no SKUs".
 */
function buildGoldSql(reportDay) {
  const key = isoToYyyymmdd(reportDay);
  const from = goldSource({ plantId: PLANT_ID, fromKey: key, toKey: key });
  const cols = MAIL_FIELDS.map((f) =>
    f.kpi
      ? `MAX(CASE WHEN kpi_name = '${f.kpi}' AND itemcode IS NULL THEN actual_value END) AS ${f.key}`
      : `CASE WHEN COUNT(CASE WHEN kpi_name = '${f.skuKpi}' THEN 1 END) = 0 THEN NULL ` +
        `ELSE COUNT(DISTINCT CASE WHEN kpi_name = '${f.skuKpi}' AND actual_value > 0 THEN itemcode END) END AS ${f.key}`,
  );
  return (
    `SELECT ${cols.join(", ")} FROM ${from} ` +
    `WHERE ${plantPredicate("plant", PLANT_ID)} ` +
    `AND granularity = 'DAY' AND ${DATE_YYYYMMDD} = '${key}' ` +
    `AND kpi_name IN (${ALL_KPIS.map((k) => `'${k}'`).join(", ")})`
  );
}

async function readGold(reportDay) {
  const rows = await runQuery(buildGoldSql(reportDay));
  const row = rows[0] ?? {};
  return Object.fromEntries(MAIL_FIELDS.map((f) => [f.key, toNumber(row[f.key])]));
}

/* ----------------------------------------------------------------- *
 * TEMPORARY snapshot fallback                                       *
 * ----------------------------------------------------------------- */

let snapshotPromise = null;

async function loadSnapshotOnce() {
  const { snapshotPath } = config.mail;
  if (!snapshotPath) return null;
  return JSON.parse(await fs.readFile(snapshotPath, "utf8"));
}

function loadSnapshot() {
  if (!snapshotPromise) {
    snapshotPromise = loadSnapshotOnce().catch((err) => {
      snapshotPromise = null;
      throw err;
    });
  }
  return snapshotPromise;
}

/** Same shape as readGold(), from the snapshot's DAY entry for the report day. */
async function readSnapshot(reportDay) {
  const snap = await loadSnapshot();
  const day = snap?.data?.[reportDay]?.DAY;
  if (!day) return null;
  return Object.fromEntries(
    MAIL_FIELDS.map((f) => {
      if (f.kpi) return [f.key, toNumber(day[f.kpi])];
      const perSku = day[f.skuKpi];
      if (!perSku || typeof perSku !== "object") return [f.key, null];
      return [f.key, Object.values(perSku).filter((v) => toNumber(v) > 0).length];
    }),
  );
}

/**
 * @param {string} reportDay ISO yyyy-mm-dd plant day
 * @returns {Promise<{ values: Record<string, number|null>, sources: Record<string, "gold"|"snapshot"|null>, errors: string[] }>}
 */
async function readValues(reportDay) {
  const errors = [];
  let gold = {};
  if (config.mail.kpiSource === "gold") {
    try {
      gold = await readGold(reportDay);
    } catch (err) {
      errors.push(`Gold query failed: ${err.message}`);
    }
  }

  const values = {};
  const sources = {};
  const missing = MAIL_FIELDS.filter((f) => gold[f.key] == null);
  let snap = null;
  if (missing.length) {
    try {
      snap = await readSnapshot(reportDay);
    } catch (err) {
      errors.push(`KPI snapshot unavailable: ${err.message}`);
    }
  }
  for (const f of MAIL_FIELDS) {
    if (gold[f.key] != null) {
      values[f.key] = gold[f.key];
      sources[f.key] = "gold";
    } else if (snap?.[f.key] != null) {
      values[f.key] = snap[f.key];
      sources[f.key] = "snapshot";
    } else {
      values[f.key] = null;
      sources[f.key] = null;
    }
  }
  return { values, sources, errors };
}

/** reportDay → { at, promise }. A result with errors is not kept. */
const valuesCache = new Map();

export function getCuringMailValues(reportDay) {
  const hit = valuesCache.get(reportDay);
  if (hit && Date.now() - hit.at < config.mail.valuesTtlMs) return hit.promise;
  const promise = readValues(reportDay).then(
    (result) => {
      if (result.errors.length) valuesCache.delete(reportDay);
      return result;
    },
    (err) => {
      valuesCache.delete(reportDay);
      throw err;
    },
  );
  valuesCache.set(reportDay, { at: Date.now(), promise });
  return promise;
}

export const _test = { buildGoldSql };
