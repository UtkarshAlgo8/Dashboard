import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.jsx";

// StrictMode intentionally double-invokes effects/renders in DEVELOPMENT to
// surface unsafe effects. It's a no-op in production. We removed it because it
// made every data hook fire twice in dev — doubling the network calls in the
// dev tab (and re-mounting drill panels, which read as an open/close flicker),
// which was consistently mistaken for a real bug. Prod behaviour is unchanged.
createRoot(document.getElementById("root")).render(<App />);
