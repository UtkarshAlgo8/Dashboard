import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Polled-fetch hook. Calls `fetcher` on mount and every `interval`
 * ms thereafter. Drops stale results if the component unmounts or
 * deps change mid-flight (token guard).
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

  const run = useCallback(() => {
    const myToken = ++tokenRef.current;
    setIsLoading(true);
    fetcher()
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
  }, [fetcher]);

  const refetch = useCallback(() => {
    if (!enabled) return;
    run();
  }, [enabled, run]);

  useEffect(() => {
    if (!enabled) return undefined;
    // Kick off the initial fetch. The `setIsLoading(true)` inside
    // `run()` is the canonical async-fetch-in-effect pattern; the
    // react-hooks plugin flags it as a cascading-render risk but it
    // is the correct behaviour here (we want isLoading=true until
    // the promise resolves). The `deps` spread also defeats the
    // exhaustive-deps check by design — `deps` is forwarded as-is
    // per the hook's contract.
    /* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */
    run();
    if (interval <= 0) return undefined;
    const handle = setInterval(run, interval);
    return () => {
      clearInterval(handle);
      tokenRef.current += 1;
    };
    /* eslint-enable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */
  }, [enabled, interval, run, ...deps]);

  return { data, error, isLoading, refetch };
}

export default usePolledQuery;
