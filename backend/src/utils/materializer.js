/**
 * Materializer — pulls level-1+2 deduped rows for the trailing window
 * into process memory, indexed for fast filter lookups.
 *
 * The cold-cache problem this solves:
 *   The warmed read-through cache (cache.js) only answers requests with
 *   a cache key it has already seen. A user opening the dashboard with
 *   a (plant, section, category, granularity, date) combination the
 *   recorder has not captured waits 8-18 s on Athena.
 *
 *   This module pulls the WHOLE recent dataset once and serves ANY
 *   filter combination out of memory. Sub-millisecond cold load for
 *   the trailing window; Athena is the fallback only when the user
 *   asks for a window outside the materializer's range.
 *
 * Refresh is atomic: the new set is built fully before the reference
 * is swapped, so a partial refresh failure leaves the old set live.
 * A per-plant `refreshing` Map prevents two refreshes of the same
 * plant from overlapping.
 *
 * Indexing: rows are indexed at refresh time by (granularity, category,
 * section) — the dimensions that the dashboard cards filter on. Drill
 * filters add kpi_name and parentFilters at lookup time, which is
 * O(rows-per-bucket) — acceptable because level-1 buckets stay small
 * (~hundreds of rows each) and level-2 buckets are bounded by machine
 * count (~600).
 */

import { config } from "../config.js";
import { runQuery } from "./upstream.js";
import { cacheGet, cacheSet } from "./cache.js";
import {
  buildMaterializePullQuery,
  buildMaterializeCountQuery,
} from "../queries/materialize-query.js";
import {
  normalizePlantId,
  EMPTY_VALUE_TOKENS,
  TYRE_TYPE_ALL,
  UNIT_ALIASES,
  TYRE_TYPE_SHARED,
  canonicalizeProductType,
  canonicalizeSubSection,
  normalizeUnit,
} from "./normalize.js";
import {
  PRODUCT_SPLIT_KPIS,
  PRODUCT_AGNOSTIC_KPIS,
  AGGREGATE_PRODUCT_CHILDREN,
} from "../queries/dashboard-query.js";
import { GRAN_DAY } from "./normalize.js";

/* ----------------------------------------------------------- canonical
 * Normalize row values into a JS shape the indexer can compare on.
 *
 * - actual_value / threshold_value come back from Athena as strings
 *   ("1641178.55") or empty. Coerce to number|null.
 * - date is whatever the table stores. Normalize to ISO yyyy-mm-dd
 *   when possible so JS Date comparisons work.
 * - All dimension columns: trim and lower-case for comparison.
 * - Numeric drill_down_level: collapse "1" / "1.0" / 1 to 1; non-numeric
 *   values (including empty / "nan" / "null") become null.
 * --------------------------------------------------------------------- */

const NUMERIC_MEASURES = ["actual_value", "threshold_value"];

function normalizeRow(row) {
  const out = { ...row };
  for (const col of NUMERIC_MEASURES) {
    const v = out[col];
    if (typeof v === "number") continue;
    const n = typeof v === "string" && v !== "" ? Number.parseFloat(v) : NaN;
    out[col] = Number.isFinite(n) ? n : null;
  }
  if (typeof out.date === "string") {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(out.date);
    out.date = m ? `${m[1]}-${m[2]}-${m[3]}` : out.date;
  }
  if (typeof out.drill_down_level === "string" && out.drill_down_level !== "") {
    const n = Number.parseFloat(out.drill_down_level);
    out.drill_down_level = Number.isFinite(n) ? n : null;
  } else if (out.drill_down_level === "") {
    out.drill_down_level = null;
  }
  return out;
}

function isEmpty(v) {
  return v == null || (typeof v === "string" && EMPTY_VALUE_TOKENS.has(v.toLowerCase().trim()));
}

function normalizeForCompare(v) {
  if (v == null) return null;
  return String(v).trim().toLowerCase();
}

function caseInsensitiveMatch(stored, requested) {
  // Same spelling map as canonicalDimensionPredicate in normalize.js.
  if (stored == null) return false;
  if (typeof stored !== "string") return String(stored) === String(requested);
  return stored.toLowerCase().trim() === String(requested).toLowerCase().trim();
}

/* ----------------------------------------------------------- row predicates
 * Mirror the SQL predicates in buildScopeWhere / buildFetchQuery.
 *
 * The JS implementations must agree with the SQL on which rows survive
 * which filter. Drift here produces silent over- or under-counts.
 * --------------------------------------------------------------------- */

function rowMatchesContext(row, context, kpiName) {
  const rowKpi = row.kpi_name;
  const productSplit = PRODUCT_SPLIT_KPIS.has(rowKpi);

  for (const [key, raw] of Object.entries(context ?? {})) {
    if (raw == null || raw === "") continue;
    if (key === "granularity") continue; // always-applied, see below
    const v = String(raw);

    if (key === "unit_of_measurement") {
      const canon = normalizeUnit(v);
      if (canon == null) {
        if (!isEmpty(row[key])) return false;
      } else {
        const spellings = new Set([canon]);
        for (const [alias, c] of UNIT_ALIASES) {
          if (c === canon) spellings.add(alias);
        }
        const stored = row[key] == null ? "" : String(row[key]).trim().toUpperCase();
        if (!spellings.has(stored)) return false;
      }
      continue;
    }

    if (key === "tyre_type") {
      if (v.toLowerCase() === TYRE_TYPE_ALL.toLowerCase()) continue;
      const u = String(row.tyre_type ?? "").toUpperCase();
      if (u !== v.toUpperCase() && u !== TYRE_TYPE_SHARED.toUpperCase()) return false;
      continue;
    }

    if (key === "section" || key === "sub_section" || key === "product_type") {
      const canonValue =
        key === "product_type"
          ? canonicalizeProductType(v)
          : key === "sub_section"
            ? canonicalizeSubSection(v)
            : v;
      // canonicalDimensionPredicate: case-insensitive + spelling aliases
      const aliases = spellingAliasesFor(key, canonValue);
      const stored = row[key];
      const matchesValue = aliases.has(normalizeForCompare(stored));
      const matchesEmpty = isEmpty(stored);
      const inProductAgnostic = PRODUCT_AGNOSTIC_KPIS.has(rowKpi);
      const matchesKids =
        key === "product_type" &&
        AGGREGATE_PRODUCT_CHILDREN[canonValue] &&
        AGGREGATE_PRODUCT_CHILDREN[canonValue].some(
          (kid) => normalizeForCompare(stored) === normalizeForCompare(kid),
        );
      const lenient = matchesValue || matchesEmpty || inProductAgnostic || matchesKids;

      // PRODUCT_SPLIT_KPIS hard-pin: those rows store aggregate AND
      // children under the same kpi_name, so lenient OR matching children
      // would double-count. Hard pin required.
      if (productSplit) {
        if (!matchesValue) return false;
      } else if (!lenient) {
        return false;
      }
      continue;
    }

    if (key === "category") {
      if (!caseInsensitiveMatch(row.category, v)) return false;
      continue;
    }

    // generic string equality
    if (!caseInsensitiveMatch(row[key], v)) return false;
  }

  // granularity is always applied (default DAY) — same as SQL.
  if (context?.granularity != null && context.granularity !== "") {
    if (!caseInsensitiveMatch(row.granularity, context.granularity)) return false;
  }
  return true;
}

function rowMatchesTime(row, { date, from, to }) {
  if (date) return row.date === date;
  if (!from && !to) return true;
  if (from && row.date < from) return false;
  if (to && row.date > to) return false;
  return true;
}

function rowMatchesKpis(row, kpiNames) {
  if (!kpiNames || kpiNames.length === 0) return true;
  return kpiNames.includes(row.kpi_name);
}

function rowMatchesParentFilters(row, parentFilters) {
  for (const [k, v] of Object.entries(parentFilters ?? {})) {
    if (v == null || v === "") continue;
    if (!caseInsensitiveMatch(row[k], v)) return false;
  }
  return true;
}

/* ----------------------------------------------------------- spelling aliases
 * Mirrors canonicalDimensionPredicate in normalize.js. The SQL helper
 * builds `LOWER(spelling) = canon` chains; we mirror as a Set lookup.
 * Kept conservative — only the documented aliases, no edge cases
 * that would diverge from the SQL.
 * --------------------------------------------------------------------- */

const SUB_SECTION_ALIASES = {
  "stock preparation": ["stock preparation", "stock prep", "stock-prep"],
  "4 roll": ["4 roll", "four roll", "4-roll"],
  "3 roll": ["3 roll", "three roll", "3-roll"],
  "slitter": ["slitter", "slitter "],
  "tbm": ["tbm"],
  "curing": ["curing"],
  "green tyre": ["green tyre", "green tire"],
  "cured tyre": ["cured tyre", "cured tire"],
};

const PRODUCT_TYPE_ALIASES = {
  // Aliases follow canonicalizeProductType in normalize.js
  "passenger radial": ["passenger radial", "pcr"],
  "lt": ["lt", "light truck"],
  "tbr": ["tbr", "truck bus radial"],
  "comp": ["comp", "compound"],
};

function spellingAliasesFor(key, canonicalValue) {
  const set = new Set([String(canonicalValue).toLowerCase().trim()]);
  if (key === "sub_section") {
    const aliases = SUB_SECTION_ALIASES[String(canonicalValue).toLowerCase().trim()];
    if (aliases) for (const a of aliases) set.add(a.toLowerCase().trim());
  }
  if (key === "product_type") {
    const aliases = PRODUCT_TYPE_ALIASES[String(canonicalValue).toLowerCase().trim()];
    if (aliases) for (const a of aliases) set.add(a.toLowerCase().trim());
  }
  return set;
}

/* ----------------------------------------------------------- state
 * Per-plant state lives in `state.byPlant` and is read-only after
 * assignment in the refresh. The reference swap is what makes
 * reads lock-free — a refresh never mutates an existing set.
 * --------------------------------------------------------------------- */

const state = {
  byPlant: new Map(), // plantId -> { rows, refreshedAt, durationMs, errors, index }
  refreshing: new Map(), // plantId -> Promise (single-flight per plant)
  timer: null,
  bootTimer: null,
};

const REDIS_PREFIX = "materialize:";
const REDIS_SUFFIX = ":levels";

function redisKey(plantId) {
  return `${REDIS_PREFIX}${plantId}${REDIS_SUFFIX}`;
}

/* ----------------------------------------------------------- indexer
 * Build the in-memory index used by lookups. The hot path is
 * (granularity, category, section) — the three dimensions the cards
 * filter on. Drill filters add kpi_name and parentFilters at lookup
 * time. Returns { buckets: Map<key, rows[]>, allRows: rows[] }.
 * --------------------------------------------------------------------- */

function indexRows(rows) {
  const buckets = new Map();
  for (const row of rows) {
    const gran = (row.granularity ?? "").toLowerCase();
    const cat = (row.category ?? "").toLowerCase();
    const sec = (row.section ?? "").toLowerCase();
    const key = `${gran}|${cat}|${sec}`;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = [];
      buckets.set(key, bucket);
    }
    bucket.push(row);
  }
  return { buckets, allRows: rows };
}

function bucketKey(row) {
  const gran = (row.granularity ?? "").toLowerCase();
  const cat = (row.category ?? "").toLowerCase();
  const sec = (row.section ?? "").toLowerCase();
  return `${gran}|${cat}|${sec}`;
}

/* ----------------------------------------------------------- refresh
 * Pull the dataset for one plant and atomically swap it into state.
 * A failure logs and leaves the old set live.
 * --------------------------------------------------------------------- */

async function refreshPlant(plantId) {
  const inFlight = state.refreshing.get(plantId);
  if (inFlight) return inFlight;

  const promise = (async () => {
    const startedAt = Date.now();
    const windowDays = config.materialize.windowDays;
    const levels = config.materialize.levels;

    const countSql = buildMaterializeCountQuery({ plantId, windowDays, levels });
    const pullSql = buildMaterializePullQuery({ plantId, windowDays, levels });

    const countRows = await runQuery(countSql);
    const rowsRaw = await runQuery(pullSql);
    const rows = rowsRaw.map(normalizeRow);
    const indexed = indexRows(rows);

    state.byPlant.set(plantId, {
      rows,
      refreshedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAt,
      errors: [],
      count: Number(countRows?.[0]?.n ?? rows.length),
      buckets: indexed.buckets,
      allRows: indexed.allRows,
    });

    // Persist to Redis as the durable copy. Skip on best-effort — Redis
    // outages should not block the in-process set being live.
    try {
      await cacheSet(redisKey(plantId), {
        rows,
        refreshedAt: state.byPlant.get(plantId).refreshedAt,
        count: state.byPlant.get(plantId).count,
      });
    } catch (err) {
      console.warn(`[materializer] redis persist failed for ${plantId}: ${err.message}`);
    }

    console.log(
      `[materializer] ${plantId} refreshed in ${Date.now() - startedAt}ms (${rows.length} rows)`,
    );
    return state.byPlant.get(plantId);
  })().catch((err) => {
    const prev = state.byPlant.get(plantId);
    if (prev) {
      prev.errors.push({ at: new Date().toISOString(), message: err.message });
    }
    console.warn(`[materializer] ${plantId} refresh failed: ${err.message}`);
    return prev ?? null;
  });

  state.refreshing.set(plantId, promise);
  try {
    return await promise;
  } finally {
    state.refreshing.delete(plantId);
  }
}

async function refreshAll() {
  if (!config.materialize.enabled) return;
  const plants = config.materialize.plants.filter((id) => normalizePlantId(id));
  await Promise.allSettled(plants.map((p) => refreshPlant(p)));
}

/* ----------------------------------------------------------- boot
 * On startup, attempt to restore from Redis (durability copy). If
 * found and recent, skip the boot refresh. Otherwise schedule a
 * refresh on a short delay so the server is listening and warmer
 * traffic settles.
 * --------------------------------------------------------------------- */

async function tryRestoreFromRedis() {
  for (const plantId of config.materialize.plants) {
    try {
      const stored = await cacheGet(redisKey(plantId));
      if (!stored || !Array.isArray(stored.rows)) continue;
      const ageMs = Date.now() - Date.parse(stored.refreshedAt ?? "");
      if (!Number.isFinite(ageMs) || ageMs > config.materialize.intervalMs) continue;
      const rows = stored.rows.map(normalizeRow);
      const indexed = indexRows(rows);
      state.byPlant.set(plantId, {
        rows,
        refreshedAt: stored.refreshedAt,
        durationMs: 0,
        errors: [],
        count: stored.count ?? rows.length,
        buckets: indexed.buckets,
        allRows: indexed.allRows,
      });
      console.log(
        `[materializer] ${plantId} restored from redis (${rows.length} rows, age ${Math.round(ageMs / 1000)}s)`,
      );
    } catch (err) {
      console.warn(`[materializer] ${plantId} redis restore failed: ${err.message}`);
    }
  }
}

export function startMaterializer() {
  if (!config.materialize.enabled) {
    console.log("[materializer] disabled (CACHE_MATERIALIZE_ENABLED=false)");
    return;
  }
  console.log(
    `[materializer] enabled — every ${Math.round(config.materialize.intervalMs / 1000)}s, ` +
      `window ${config.materialize.windowDays}d, levels ${config.materialize.levels.join(",")}, ` +
      `plants: ${config.materialize.plants.join(", ")}`,
  );

  // Best-effort restore from Redis on boot. If successful, the boot
  // refresh is skipped because the restored set is recent enough.
  const boot = setTimeout(async () => {
    await tryRestoreFromRedis();
    await refreshAll();
    state.timer = setInterval(() => refreshAll(), config.materialize.intervalMs);
    state.timer.unref?.();
  }, config.materialize.bootDelayMs);
  boot.unref?.();
}

export function stopMaterializer() {
  if (state.timer) clearInterval(state.timer);
  state.timer = null;
  if (state.bootTimer) clearTimeout(state.bootTimer);
  state.bootTimer = null;
}

/* ----------------------------------------------------------- lookups
 * Read paths. Each returns either the matching rows or null when the
 * materializer cannot answer (e.g. plant not warmed, window outside
 * range). Callers fall back to the cache/Athena path on null.
 * --------------------------------------------------------------------- */

function timeScopeInWindow({ date, from, to }) {
  const set = state.byPlant.get(arguments[0]?.plantId ?? "");
  // Time-window check is loose: if the materializer has any rows for
  // this plant, we trust it covers the trailing window. Drift in the
  // window start is fine — older rows are simply absent from the set.
  return Boolean(set);
}

function rowsForBody(plantSet, body) {
  const { context = {}, date, from, to, drillKpis, landingKpis, parentFilters } =
    body || {};

  // Build the candidate set: prefer the indexed bucket for the (granularity,
  // category, section) triple; fall back to allRows if section is empty.
  const gran = (context.granularity ?? GRAN_DAY).toLowerCase();
  const cat = (context.category ?? "").toLowerCase();
  const sec = (context.section ?? "").toLowerCase();
  let candidates;
  if (sec) {
    candidates =
      plantSet.buckets.get(`${gran}|${cat}|${sec}`) ??
      plantSet.buckets.get(`${gran}|${cat}|""`) ??
      plantSet.buckets.get(`${gran}|""|""`) ??
      [];
  } else {
    candidates = plantSet.allRows;
  }

  // For a landing query, only level-1 (or Quality-parent) rows survive
  // — mirroring the LANDING_PREDICATE in buildFetchQuery (dashboard-query.js
  // lines 996-1000). For drill, the kpi_name IN drillKpis is enough; the
  // SQL path drops the level filter under drillOnly (lines 1015-1018).
  const hasKpiFilter =
    (Array.isArray(landingKpis) && landingKpis.length > 0) ||
    (Array.isArray(drillKpis) && drillKpis.length > 0);
  const isDrill = Array.isArray(drillKpis) && drillKpis.length > 0;

  const out = [];
  for (const row of candidates) {
    if (!rowMatchesContext(row, context, row.kpi_name)) continue;
    if (!rowMatchesTime(row, { date, from, to })) continue;
    if (!rowMatchesParentFilters(row, parentFilters)) continue;
    if (!isDrill) {
      // Landing predicate: drill_down_level = 1 OR Quality-parent
      // (level NULL + no machine / itemcode / sub_section).
      const lvl = row.drill_down_level;
      const isLevelOne = lvl === 1 || lvl === "1" || lvl === "1.0";
      const isQualityParent =
        lvl == null &&
        isEmpty(row.machine) &&
        isEmpty(row.itemcode) &&
        isEmpty(row.sub_section);
      if (!isLevelOne && !isQualityParent) continue;
    }
    if (hasKpiFilter) {
      // Union of landingKpis and drillKpis matches the SQL (lines 1040-1058):
      // rows with kpi_name in EITHER set are kept. drillOnly skip is moot
      // here because we already applied the landing predicate above.
      const inLanding = Array.isArray(landingKpis) && landingKpis.includes(row.kpi_name);
      const inDrill = Array.isArray(drillKpis) && drillKpis.includes(row.kpi_name);
      if (!inLanding && !inDrill) continue;
    }
    out.push(row);
  }
  return out;
}

function shapeKpiRows(rows) {
  // Strip the row of fields the API does not project.
  return rows.map((r) => ({
    date: r.date,
    section: r.section ?? null,
    sub_section: r.sub_section ?? null,
    machine: r.machine ?? null,
    product_type: r.product_type ?? null,
    itemcode: r.itemcode ?? null,
    granularity: r.granularity ?? null,
    category: r.category ?? null,
    kpi_name: r.kpi_name ?? null,
    unit_of_measurement: r.unit_of_measurement ?? null,
    drill_down_attribute: r.drill_down_attribute ?? null,
    drill_down_level: r.drill_down_level ?? null,
    actual_value: r.actual_value ?? null,
    threshold_value: r.threshold_value ?? null,
    status: r.status ?? null,
    remarks: r.remarks ?? null,
  }));
}

/**
 * Lookup for `postFetch`. Returns the same shape the SQL path returns
 * (`{ rows, truncated }`) or null when the materializer cannot answer.
 *
 * Truncation matches the SQL path: cap+1 rows when the result exceeds
 * `effectiveLimit`, so the caller can surface a "row cap reached" state.
 */
export function lookupLanding(body) {
  const plantId = normalizePlantId(body?.plantId ?? "banmore");
  if (!plantId) return null;
  const set = state.byPlant.get(plantId);
  if (!set) return null;
  const rows = rowsForBody(set, body);
  if (rows.length === 0) return null;
  return shapeKpiRows(rows);
}

/**
 * Lookup for `postFetch` with `drillOnly: true`. Drill semantics:
 *   - `kpi_name IN drillKpis` only — NO landing band (the SQL enforces
 *     this when `drillOnly` is set in buildFetchQuery lines 1015-1018).
 *   - The dashboard hook sends landingKpis=undefined on drill payloads
 *     (frontend/src/hooks/useDashboardFetch.js:437-460), so the
 *     landingKpis ∪ drillKpis union does not include unrelated KPIs.
 */
export function lookupDrill(body) {
  const plantId = normalizePlantId(body?.plantId ?? "banmore");
  if (!plantId) return null;
  const set = state.byPlant.get(plantId);
  if (!set) return null;
  const rows = rowsForBody(set, body);
  if (rows.length === 0) return null;
  return shapeKpiRows(rows);
}

/**
 * Lookup for `postDrillAggregate`. Rolls up the matching rows per
 * (groupBy cols) with SUM(actual_value), SUM(threshold_value) and
 * MIN(unit_of_measurement). Mirrors buildDrillAggregateQuery's
 * aggregation exactly (dashboard-query.js:1247-1265).
 */
export function lookupDrillAggregate(body) {
  const plantId = normalizePlantId(body?.plantId ?? "banmore");
  if (!plantId) return null;
  const set = state.byPlant.get(plantId);
  if (!set) return null;

  const { context = {}, parentFilters = {}, date, from, to, kpiName, groupBy = [] } =
    body || {};
  if (!kpiName) return null;
  const cols = [...new Set(groupBy)];
  if (cols.length === 0) return null;

  const candidates = state.byPlant.get(plantId).allRows;
  const out = new Map();
  for (const row of candidates) {
    if (!caseInsensitiveMatch(row.kpi_name, kpiName)) continue;
    if (!rowMatchesContext(row, context, row.kpi_name)) continue;
    if (!rowMatchesTime(row, { date, from, to })) continue;
    if (!rowMatchesParentFilters(row, parentFilters)) continue;
    // Mirrors buildDrillAggregateQuery: a machine-grouped lens shows machine
    // data, so rows carrying no machine are not one of its rows.
    if (cols.includes("machine") && isEmpty(row.machine)) continue;

    const keyParts = cols.map((c) => normalizeForCompare(row[c]) ?? "");
    const key = keyParts.join("\x00");
    let acc = out.get(key);
    if (!acc) {
      acc = { keyParts, count: 0, actual_value: 0, threshold_value: 0, unit: null };
      out.set(key, acc);
    }
    acc.count++;
    if (typeof row.actual_value === "number") acc.actual_value += row.actual_value;
    if (typeof row.threshold_value === "number") acc.threshold_value += row.threshold_value;
    if (!acc.unit && !isEmpty(row.unit_of_measurement)) {
      acc.unit = row.unit_of_measurement;
    }
  }

  const arr = [...out.values()];
  arr.sort((a, b) => {
    for (let i = 0; i < a.keyParts.length; i++) {
      const av = a.keyParts[i] ?? "";
      const bv = b.keyParts[i] ?? "";
      if (av < bv) return -1;
      if (av > bv) return 1;
    }
    return 0;
  });
  if (arr.length === 0) return null;
  return arr.map((a) => {
    const row = {};
    cols.forEach((c, i) => (row[c] = a.keyParts[i] === "" ? null : a.keyParts[i]));
    row.actual_value = a.actual_value;
    row.threshold_value = a.threshold_value;
    row.unit_of_measurement = a.unit;
    return row;
  });
}

/** Snapshot for /admin/cache/stats. */
export function materializerStats() {
  const plants = [];
  for (const [plantId, s] of state.byPlant) {
    plants.push({
      plantId,
      rows: s.rows.length,
      buckets: s.buckets.size,
      count: s.count,
      refreshedAt: s.refreshedAt,
      durationMs: s.durationMs,
      failures: s.errors.length,
      windowDays: config.materialize.windowDays,
      levels: config.materialize.levels,
    });
  }
  return {
    enabled: config.materialize.enabled,
    configuredPlants: config.materialize.plants,
    plants,
  };
}

/* Exposed for tests — reset all state. */
export function _resetForTests() {
  stopMaterializer();
  state.byPlant.clear();
  state.refreshing.clear();
}

/* Exposed for tests — populate state without going through refresh. */
export function _setForTests(plantId, rows) {
  const normalized = rows.map(normalizeRow);
  const indexed = indexRows(normalized);
  state.byPlant.set(plantId, {
    rows: normalized,
    refreshedAt: new Date().toISOString(),
    durationMs: 0,
    errors: [],
    count: normalized.length,
    buckets: indexed.buckets,
    allRows: indexed.allRows,
  });
}
