import { createContext, useContext } from "react";

export const ToastContext = createContext(null);

/**
 * Access the toast API from any component below <ToastProvider>.
 * Returns { success, error, warn, info, dismiss }.
 */
export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used inside <ToastProvider>");
  }
  return ctx;
}

export default useToast;
