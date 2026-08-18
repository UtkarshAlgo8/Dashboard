/**
 * Express app assembly — separated from the listener so tests can mount it
 * on an ephemeral port in-process. index.js owns binding the real port.
 */
import express from "express";

import { corsMiddleware } from "./middlewares/cors.js";
import { requestLogger } from "./middlewares/requestLogger.js";
import { warmContext } from "./middlewares/warmContext.js";
import { notFound } from "./middlewares/notFound.js";
import { errorHandler } from "./middlewares/errorHandler.js";
import { warmRecorder } from "./utils/warm-recorder.js";

import { router as staticRouter } from "./routes/static.js";
import { router as plantsRouter } from "./routes/plants.js";
import { router as kpisRouter } from "./routes/kpis.js";
import { router as drillsRouter } from "./routes/drills.js";
import { router as trendsRouter } from "./routes/trends.js";
import { router as inventoryRouter } from "./routes/inventory.js";
import { router as anomaliesRouter } from "./routes/anomalies.js";
import { router as dashboardRouter } from "./routes/dashboard.js";
import { router as snapshotRouter } from "./routes/snapshot.js";
import { router as adminRouter } from "./routes/admin.js";
import { router as qualityProcessRouter } from "./quality/routes/process.routes.js";
import { router as qualitySpcRouter } from "./quality/routes/spc.routes.js";

const app = express();

app.use(corsMiddleware);
app.use(express.json());
app.use(requestLogger);
// Both must sit AFTER express.json (they read req.body) and BEFORE the
// routers. warmContext puts warm replays into write-through mode; warmRecorder
// remembers which dashboard views real browsers ask for, so the warmer replays
// the exact request bodies the frontend sends.
app.use(warmContext);
app.use(warmRecorder);

app.get("/api/v1/health", (_req, res) => {
  res.json({ data: { status: "ok", time: new Date().toISOString() } });
});

// URL layout (unchanged from CR-07):
//   /api/v1/{plants,functions,sections,category-tabs}     → static
//   /api/v1/plants/:id(/summary|/as-of|/section-oee)      → plants
//   /api/v1/plants/:id/inventory                          → inventory
//   /api/v1/plants/:id/anomalies                          → anomalies
//   /api/v1/plants/:id/production/kpis                    → KPI grid
//   /api/v1/plants/:id/production/trends                  → trends
//   /api/v1/plants/:id/production/drills/*                → drills
//   /api/v1/dashboard/{fetch,vocab}                       → dashboard
//
// staticRouter mounts FIRST so /plants (list) doesn't shadow /plants/:id.
app.use("/api/v1", staticRouter);
app.use("/api/v1/plants", plantsRouter);
app.use("/api/v1/plants/:plantId/production/kpis", kpisRouter);
app.use("/api/v1/plants/:plantId/production/trends", trendsRouter);
app.use("/api/v1/plants/:plantId/production/drills", drillsRouter);
app.use("/api/v1/plants/:plantId/inventory", inventoryRouter);
app.use("/api/v1/plants/:plantId/anomalies", anomaliesRouter);
app.use("/api/v1/dashboard", dashboardRouter);
// /api/v1/dashboard/snapshot — composes the page-load chain into one call.
app.use("/api/v1/dashboard", snapshotRouter);
//   /api/v1/admin/cache/{stats,warm}                      → cache ops
app.use("/api/v1/admin", adminRouter);

// Quality Dashboard (additive; separate data family — FRD §A).
//   /api/v1/quality/process/{kpi-value,kpi-value-batch,kpi-children,kpi-history}
//   /api/v1/quality/spc/{summary,filter-options,widgets,detail,*-observations}
app.use("/api/v1/quality/process", qualityProcessRouter);
app.use("/api/v1/quality/spc", qualitySpcRouter);

app.use(notFound);
app.use(errorHandler);

export { app };
