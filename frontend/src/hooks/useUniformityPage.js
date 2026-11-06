import { useEffect, useState } from "react";
import { getUniformityPage } from "@/api/uniformity.js";

/** Only the selected page is requested; late/unmounted responses are ignored. */
export default function useUniformityPage(kind, scope, enabled = true) {
  const scopeKey = JSON.stringify(scope);
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState(null);
  const key = `${kind}|${scopeKey}|${attempt}`;
  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    getUniformityPage(kind, JSON.parse(scopeKey)).then(
      (data) => {
        if (!cancelled) setResult({ key, data });
      },
      (error) => {
        if (!cancelled) setResult({ key, error });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [kind, scopeKey, key, enabled]);
  const current = enabled && result?.key === key ? result : null;
  return {
    data: current?.data,
    error: current?.error,
    loading: enabled && !current,
    retry: () => setAttempt((n) => n + 1),
  };
}
