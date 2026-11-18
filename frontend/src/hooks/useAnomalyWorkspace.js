import { useEffect, useReducer } from "react";
import { getAnomalyWorkspace } from "@/api/anomalyDetection.js";

function reducer(state, action) {
  switch (action.type) {
    case "retry":
      return {
        ...state,
        loading: true,
        error: null,
        attempt: state.attempt + 1,
      };
    case "ready":
      return { ...state, loading: false, error: null, model: action.model };
    case "error":
      return { ...state, loading: false, error: action.error };
    default:
      return state;
  }
}

/** Cancellable provider loading; no polling until a real live source exists. */
export default function useAnomalyWorkspace() {
  const [state, dispatch] = useReducer(reducer, {
    loading: true,
    error: null,
    model: null,
    attempt: 0,
  });
  useEffect(() => {
    const controller = new AbortController();
    getAnomalyWorkspace({ signal: controller.signal }).then(
      (model) => {
        if (!controller.signal.aborted) dispatch({ type: "ready", model });
      },
      (error) => {
        if (!controller.signal.aborted) dispatch({ type: "error", error });
      },
    );
    return () => controller.abort();
  }, [state.attempt]);
  return { ...state, retry: () => dispatch({ type: "retry" }) };
}
