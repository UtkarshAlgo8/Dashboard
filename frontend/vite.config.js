import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const pkg = JSON.parse(
  readFileSync(path.resolve(__dirname, "package.json"), "utf8"),
);

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  optimizeDeps: {
    exclude: ["maplibre-gl"],
  },
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  server: {
    proxy: {
      // Vite dev-server proxy: the FE talks to a relative path, Vite forwards
      // to the Node backend on :3001. Required for `/quality/*` calls from the
      // Quality dashboard (otherwise Vite falls through to the SPA index and
      // the FE silently sees an HTML response, masking the backend's data).
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
    },
  },
});

