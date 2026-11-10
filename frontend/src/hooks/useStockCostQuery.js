import { useEffect, useState } from "react";
import { getStockCost } from "@/api/stockCost.js";

/** Abort on scope change and suppress stale data, even before the next effect runs. */
export default function useStockCostQuery(input) {
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
    getStockCost(JSON.parse(key), { signal: controller.signal }).then(
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
