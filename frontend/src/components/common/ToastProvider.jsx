import { useCallback, useMemo, useState } from "react";
import { Alert, Snackbar } from "@mui/material";
import { ToastContext } from "./useToast.js";

const SEVERITY_DURATIONS = {
  success: 4000,
  info: 4000,
  warning: 6000,
  error: 8000,
};

/**
 * Provider for the shared toast hook. Mount once at the root of <App>.
 */
function ToastProvider({ children }) {
  const [toast, setToast] = useState(null);

  const show = useCallback((severity, message) => {
    setToast({
      severity,
      message,
      duration: SEVERITY_DURATIONS[severity] ?? 4000,
      key: Date.now(),
    });
  }, []);

  const api = useMemo(
    () => ({
      success: (msg) => show("success", msg),
      error: (msg) => show("error", msg),
      warn: (msg) => show("warning", msg),
      info: (msg) => show("info", msg),
      dismiss: () => setToast(null),
    }),
    [show],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <Snackbar
        key={toast?.key}
        open={Boolean(toast)}
        autoHideDuration={toast?.duration}
        onClose={() => setToast(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
      >
        {toast ? (
          <Alert
            onClose={() => setToast(null)}
            severity={toast.severity}
            variant="filled"
            sx={{ borderRadius: "10px", fontSize: "13px" }}
          >
            {toast.message}
          </Alert>
        ) : undefined}
      </Snackbar>
    </ToastContext.Provider>
  );
}

export default ToastProvider;
