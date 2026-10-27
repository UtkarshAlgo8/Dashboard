/**
 * CTP Quality — Process tab controllers.
 *
 * validate → build SQL → runQuery (Athena, gold.ctp_gold) → transform, with
 * the shared Redis cache in front. Cache keys use the resolved period start,
 * so every date inside one month shares the Month view's entry. An open
 * period lives 10 minutes in the cache, a closed one an hour.
 */
import { CACHE_TTL, buildCacheKey, cached } from "../../utils/cache.js";
import { runQuery } from "../../utils/upstream.js";
import {
  isCurrentPeriod,
  isIsoDate,
  periodStart,
  resolvePeriod,
} from "./periods.js";
import { processSummaryQuery, processTrendQuery } from "./queries.js";
import { CARD_KPIS, TYRE_TYPE_TO_GOLD } from "./registry.js";
import { toProcessSummary, toProcessTrend } from "./transform.js";

function badRequest(res, message) {
  res.status(400).json({ error: { code: "VALIDATION_ERROR", message } });
}

function goldTyreTypeOf(tyre) {
  return TYRE_TYPE_TO_GOLD[tyre ?? "All"] ?? null;
}

const ttlFor = (open) =>
  open ? CACHE_TTL.CTP_QUALITY_CURRENT : CACHE_TTL.CTP_QUALITY_PAST;

/**
 * GET /quality/ctp/process/summary
 *   ?tyre=All|PCR|TBR &granularity=DAY|MONTH|YEAR &date=yyyy-mm-dd
 *   [&shift=All|A|B|C]   (shift applies to DAY only)
 */
export async function getProcessSummary(req, res, next) {
  try {
    const { tyre = "All" } = req.query;
    const goldTyreType = goldTyreTypeOf(tyre);
    if (!goldTyreType) return badRequest(res, `Unsupported tyre: ${tyre}`);
    const period = resolvePeriod(req.query);
    if (period.error) return badRequest(res, period.error);

    const key = buildCacheKey("/quality/ctp/process/summary", {
      tyre,
      granularity: period.goldGranularity,
      anchor: period.anchor,
    });
    const body = await cached(
      key,
      async () =>
        toProcessSummary(
          await runQuery(processSummaryQuery({ goldTyreType, ...period })),
          period,
        ),
      ttlFor(isCurrentPeriod(period.anchor, period.grain)),
    );

    res.json({
      context: {
        tyre,
        granularity: period.grain,
        goldGranularity: period.goldGranularity,
        anchor: period.anchor,
      },
      ...body,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /quality/ctp/process/trend
 *   ?kpi=<card kpi_name> &tyre= &granularity= [&shift=]
 *   &date_from=yyyy-mm-dd &date_to=yyyy-mm-dd
 */
export async function getProcessTrend(req, res, next) {
  try {
    const { kpi, tyre = "All", date_from: from, date_to: to } = req.query;
    if (!Object.values(CARD_KPIS).includes(kpi)) {
      return badRequest(res, `Unsupported kpi: ${kpi}`);
    }
    const goldTyreType = goldTyreTypeOf(tyre);
    if (!goldTyreType) return badRequest(res, `Unsupported tyre: ${tyre}`);
    if (!isIsoDate(from) || !isIsoDate(to) || from > to) {
      return badRequest(res, "`date_from` and `date_to` must be yyyy-mm-dd.");
    }
    const period = resolvePeriod({ ...req.query, date: to });
    if (period.error) return badRequest(res, period.error);
    const rangeFrom = periodStart(from, period.grain);

    const key = buildCacheKey("/quality/ctp/process/trend", {
      kpi,
      tyre,
      granularity: period.goldGranularity,
      from: rangeFrom,
      to,
    });
    const body = await cached(
      key,
      async () =>
        toProcessTrend(
          await runQuery(
            processTrendQuery({
              kpiName: kpi,
              goldTyreType,
              goldGranularity: period.goldGranularity,
              from: rangeFrom,
              to,
            }),
          ),
        ),
      ttlFor(isCurrentPeriod(period.anchor, period.grain)),
    );
    res.json({ kpi, ...body });
  } catch (err) {
    next(err);
  }
}
