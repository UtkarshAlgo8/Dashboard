import { createContext, useContext } from "react";

export const AnomalyContext = createContext(null);

export default function useAnomaly() {
  const workspace = useContext(AnomalyContext);
  if (!workspace)
    throw new Error("Anomaly components require the workspace provider.");
  return workspace;
}
