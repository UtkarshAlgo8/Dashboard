import express from "express";
import cors from "cors";
import { config } from "./config.js";
import { UpstreamError } from "./upstream.js";
import { router as plantsRouter } from "./routes/plants.js";
import { router as kpisRouter } from "./routes/kpis.js";
import { router as drillsRouter } from "./routes/drills.js";
import { router as trendsRouter } from "./routes/trends.js";
import { router as inventoryRouter } from "./routes/inventory.js";
import { router as anomaliesRouter } from "./routes/anomalies.js";

const app = express();

app.use(
  cors({
    origin: config.frontendOrigin,
    credentials: true,
  }),
);
app.use(express.json());

// One-line request log so we can tell what the frontend is calling
// during dev. Skip in tests if we add them later.
app.use((req, _res, next) => {
  // eslint-disable-next-line no-console
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  next();
});

app.get("/api/v1/health", (_req, res) => {
  res.json({ data: { status: "ok", time: new Date().toISOString() } });
});

// All Phase 1 resources live under /plants/banmore. Scope-limit
// here so we don't accidentally bake other plants into the URL
// shape before Phase 2 makes a decision.
app.use("/api/v1/plants", plantsRouter);
app.use("/api/v1/plants/:plantId/kpis", kpisRouter);
app.use("/api/v1/plants/:plantId/drills", drillsRouter);
app.use("/api/v1/plants/:plantId/trends", trendsRouter);
app.use("/api/v1/plants/:plantId/inventory", inventoryRouter);
app.use("/api/v1/plants/:plantId/anomalies", anomaliesRouter);

// 404 envelope matching docs/api-contract.md.
app.use((req, res) => {
  res.status(404).json({
    error: {
      code: "NOT_FOUND",
      message: `No route for ${req.method} ${req.originalUrl}`,
    },
  });
});

// Error envelope. UpstreamError → 502/504 with type; everything else → 500.
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  if (err instanceof UpstreamError) {
    res.status(err.status).json({
      error: { code: err.type, message: err.message },
    });
    return;
  }
  // eslint-disable-next-line no-console
  console.error("Unhandled error:", err);
  res.status(500).json({
    error: {
      code: "INTERNAL_ERROR",
      message: "Something went wrong on the server.",
    },
  });
});

app.listen(config.port, () => {
  // eslint-disable-next-line no-console
  console.log(`JK Dashboard backend listening on http://localhost:${config.port}`);
  // eslint-disable-next-line no-console
  console.log(`CORS allow-origin: ${config.frontendOrigin}`);
});
