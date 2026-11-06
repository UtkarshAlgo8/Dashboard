import { useEffect, useState } from "react";
import { getSafety } from "@/api/safety.js";

/** No preload/poll/browser cache. Abort on scope change; ignore even late aborted responses. */
export default function useSafetyQuery(input) {
  const key = input ? JSON.stringify(input) : null;
  const [state, setState] = useState({
    key: null,
    data: null,
    error: null,
    isLoading: false,
  });
  useEffect(() => {
    if (!key) return undefined;
    const controller = new AbortController();
    let active = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState({ key, data: null, error: null, isLoading: true });
    getSafety(JSON.parse(key), { signal: controller.signal }).then(
      (data) => {
        if (active) setState({ key, data, error: null, isLoading: false });
      },
      (error) => {
        if (active) setState({ key, data: null, error, isLoading: false });
      },
    );
    return () => {
      active = false;
      controller.abort();
    };
  }, [key]);
  return key && state.key === key
    ? state
    : { data: null, error: null, isLoading: Boolean(key) };
}
