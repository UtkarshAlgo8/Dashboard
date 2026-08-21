import { useCallback, useEffect, useRef, useState } from "react";

const queryCache = new Map();
const pendingQueries = new Map();

/**
 * Polled-fetch hook. Calls `fetcher` on mount and every `interval`
 * ms thereafter. Drops stale results if the component unmounts or
 * deps change mid-flight (token guard).
 *
 * The fetcher is held in a ref so callers can pass an inline arrow
 * function — e.g. `usePolledQuery(() => getPlant(id), { deps: [id] })`
 * — without retriggering the effect every render. Pass any
 * closure-captured variables via the `deps` option so polling
 * respects their changes.
 *
 * Vanilla React — no React Query. Q-DATA-01 resolved to 60-second
 * polling for Phase 1; callers can override with `interval`. Set
 * `enabled: false` to pause (e.g. before a drill panel is opened).
 *
 * @template T
 * @param {() => Promise<T>} fetcher
 * @param {object} [options]
 * @param {number} [options.interval=60000] - Milliseconds between
 *   refetches. Set to 0 to disable polling (fetch once on mount).
 * @param {ReadonlyArray<unknown>} [options.deps=[]] - Re-create the
 *   loop and refetch when these change. Same semantics as a
 *   useEffect deps array.
 * @param {boolean} [options.enabled=true] - When false, the hook
 *   does not fetch and returns null data.
 * @param {boolean} [options.keepPreviousData=false] - When true, dependency
 *   changes refetch in place instead of clearing the last successful result.
 * @param {string} [options.cacheKey] - Optional key for stale-while-revalidate
 *   cache and in-flight request dedupe.
 * @param {number} [options.staleTime=0] - Milliseconds a cached result can be
 *   shown immediately before the background refresh completes.
 * @returns {{
 *   data: T | null,
 *   error: Error | null,
 *   isLoading: boolean,
 *   refetch: () => void
 * }}
 */
export function usePolledQuery(fetcher, options = {}) {
  const {
    interval = 60000,
    deps = [],
    enabled = true,
    keepPreviousData = false,
    cacheKey = null,
    staleTime = 0,
  } = options;

  const [data, setData] = useState(() => {
    const cachedEntry =
      cacheKey && staleTime > 0 ? queryCache.get(cacheKey) : null;
    return cachedEntry && cachedEntry.expiresAt > Date.now()
      ? cachedEntry.data
      : null;
  });
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(() => {
    const cachedEntry =
      cacheKey && staleTime > 0 ? queryCache.get(cacheKey) : null;
    const hasFreshData = cachedEntry && cachedEntry.expiresAt > Date.now();
    return enabled && !hasFreshData;
  });

  const tokenRef = useRef(0);
  const fetcherRef = useRef(fetcher);

  // Keep the ref pointing at the latest fetcher without re-running
  // the effect. Inline arrow-function fetchers (the common case)
  // change reference every render but call the same underlying API.
  useEffect(() => {
    fetcherRef.current = fetcher;
  });

  const run = useCallback(() => {
    const myToken = ++tokenRef.current;
    const hit = cacheKey && staleTime > 0 ? queryCache.get(cacheKey) : null;
    const freshHit = hit && hit.expiresAt > Date.now();
    if (freshHit) {
      setData(hit.data);
      setError(null);
      setIsLoading(false);
    } else {
      setIsLoading(true);
    }

    const pending =
      cacheKey && staleTime > 0 ? pendingQueries.get(cacheKey) : null;
    const promise =
      pending ??
      fetcherRef
        .current()
        .then((result) => {
          if (cacheKey && staleTime > 0) {
            queryCache.set(cacheKey, {
              data: result,
              expiresAt: Date.now() + staleTime,
            });
          }
          return result;
        })
        .finally(() => {
          if (cacheKey && staleTime > 0) pendingQueries.delete(cacheKey);
        });
    if (!pending && cacheKey && staleTime > 0) {
      pendingQueries.set(cacheKey, promise);
    }

    promise
      .then((result) => {
        if (tokenRef.current !== myToken) return;
        setData(result);
        setError(null);
        setIsLoading(false);
      })
      .catch((err) => {
        if (tokenRef.current !== myToken) return;
        setError(err);
        setIsLoading(false);
      });
  }, [cacheKey, staleTime]);

  const refetch = useCallback(() => {
    if (!enabled) return;
    run();
  }, [enabled, run]);

  useEffect(() => {
    if (!enabled) return undefined;
    // Async-fetch-in-effect is intentional here; the lint rule
    // assumes synchronous setState cascading is a problem, but here
    // setIsLoading(true) + a deferred setData on resolution is the
    // canonical pattern.
    // Drop the previous slice on deps-change so consumers can show a
    // skeleton instead of stale data from the prior selection.
    // Background polls (the setInterval below) call run() directly
    // without resetting data — so polled refreshes stay seamless.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!keepPreviousData) setData(null);
    run();
    if (interval <= 0) return undefined;
    const handle = setInterval(run, interval);
    return () => {
      clearInterval(handle);
      tokenRef.current += 1;
    };
    // `deps` is the caller-owned list of fetch inputs; spreading it here is
    // the API this hook exposes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, interval, keepPreviousData, run, ...deps]);

  return { data, error, isLoading, refetch };
}

export default usePolledQuery;
