/** Authenticated CTP-only SPC workspace, cached for one minute. */
import { buildCacheKey, cached, cacheSet } from "../../utils/cache.js";
import { runQuery } from "../../utils/upstream.js";
import { resolveSpcRequest, spcWorkspaceQuery } from "./spc.queries.js";
import { toSpcWorkspace } from "./spc.transform.js";

const TTL_MS = 60_000;

export function createSpcWorkspaceHandler({
  run = runQuery,
  read = cached,
  store = cacheSet,
} = {}) {
  return async function getSpcWorkspace(req, res, next) {
    const request = resolveSpcRequest(req.query);
    if (request.error) {
      return res
        .status(400)
        .json({ error: { code: "VALIDATION_ERROR", message: request.error } });
    }
    try {
      const { refresh, ...selection } = request;
      const key = buildCacheKey("/quality/ctp/spc/workspace", {
        ...selection,
        version: 1,
      });
      const load = async () => ({
        ...toSpcWorkspace(await run(spcWorkspaceQuery(request)), request),
        fetched_at: new Date().toISOString(),
      });
      let body;
      if (refresh) {
        body = await load();
        await store(key, body, TTL_MS);
      } else {
        body = await read(key, load, TTL_MS);
      }
      res.json(body);
    } catch (err) {
      next(err);
    }
  };
}

export const getSpcWorkspace = createSpcWorkspaceHandler();
