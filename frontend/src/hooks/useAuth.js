import { useContext } from "react";
import { AuthContext } from "@/contexts/AuthContext.jsx";

/**
 * Public hook — every component that needs the current user / login
 * actions goes through this. Centralises the context error so callers
 * don't have to handle the "Provider missing" check themselves.
 */
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
