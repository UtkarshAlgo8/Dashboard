import { useCallback, useEffect, useRef, useState } from "react";

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
 * @returns {{
 *   data: T | null,
 *   error: Error | null,
 *   isLoading: boolean,
 *   refetch: () => void
 * }}
 */
export function usePolledQuery(fetcher, options = {}) {
  const { interval = 60000, deps = [], enabled = true } = options;

  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(enabled);

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
    setIsLoading(true);
    fetcherRef
      .current()
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
  }, []);

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
    /* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */
    run();
    if (interval <= 0) return undefined;
    const handle = setInterval(run, interval);
    return () => {
      clearInterval(handle);
      tokenRef.current += 1;
    };
    /* eslint-enable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */
  }, [enabled, interval, ...deps]);

  return { data, error, isLoading, refetch };
}

export default usePolledQuery;
