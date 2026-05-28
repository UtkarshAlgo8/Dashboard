import express from "express";
import cors from "cors";
import { config } from "./config.js";
import { UpstreamError } from "./upstream.js";
import { QueryValidationError } from "./dashboard-query.js";
import { router as staticRouter } from "./routes/static.js";
import { router as plantsRouter } from "./routes/plants.js";
import { router as kpisRouter } from "./routes/kpis.js";
import { router as drillsRouter } from "./routes/drills.js";
import { router as trendsRouter } from "./routes/trends.js";
import { router as inventoryRouter } from "./routes/inventory.js";
import { router as anomaliesRouter } from "./routes/anomalies.js";
import { router as dashboardRouter } from "./routes/dashboard.js";

const app = express();

app.use(
  cors({ origin: config.frontendOrigin, credentials: true }),
);
app.use(express.json());

// One-line request log for dev. Skip in tests if we add them later.
app.use((req, _res, next) => {
  // eslint-disable-next-line no-console
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  next();
});

app.get("/api/v1/health", (_req, res) => {
  res.json({ data: { status: "ok", time: new Date().toISOString() } });
});

// URL layout mirrors what the frontend's src/api/*.js already
// targets (audit done 2026-05-26 for CR-06 → reused for CR-07):
//
//   /api/v1/{plants,functions,sections,category-tabs}     → static
//   /api/v1/plants/:id                                    → one plant
//   /api/v1/plants/:id/summary                            → summary
//   /api/v1/plants/:id/inventory                          → inventory (stub)
//   /api/v1/plants/:id/anomalies                          → anomalies (stub)
//   /api/v1/plants/:id/production/kpis                    → KPI grid
//   /api/v1/plants/:id/production/trends                  → trends
//   /api/v1/plants/:id/production/drills/{oee,production,
//                                         downtime,plan-compliance,
//                                         scrap-traceability}  → drills
//
// staticRouter mounts FIRST so /plants (list) doesn't shadow the
// /plants/:id mount below it.
app.use("/api/v1", staticRouter);
app.use("/api/v1/plants", plantsRouter);
app.use("/api/v1/plants/:plantId/production/kpis", kpisRouter);
app.use("/api/v1/plants/:plantId/production/trends", trendsRouter);
app.use("/api/v1/plants/:plantId/production/drills", drillsRouter);
app.use("/api/v1/plants/:plantId/inventory", inventoryRouter);
app.use("/api/v1/plants/:plantId/anomalies", anomaliesRouter);
app.use("/api/v1/dashboard", dashboardRouter);

app.use((req, res) => {
  res.status(404).json({
    error: {
      code: "NOT_FOUND",
      message: `No route for ${req.method} ${req.originalUrl}`,
    },
  });
});

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  if (err instanceof UpstreamError) {
    res
      .status(err.status)
      .json({ error: { code: err.type, message: err.message } });
    return;
  }
  if (err instanceof QueryValidationError) {
    res.status(400).json({ error: { code: "VALIDATION_ERROR", message: err.message } });
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
  console.log(
    `JK Dashboard backend listening on http://localhost:${config.port}`,
  );
  // eslint-disable-next-line no-console
  console.log(`CORS allow-origin: ${config.frontendOrigin}`);
});
