import express from "express";
import { config } from "./config.js";

import { corsMiddleware } from "./middlewares/cors.js";
import { requestLogger } from "./middlewares/requestLogger.js";
import { notFound } from "./middlewares/notFound.js";
import { errorHandler } from "./middlewares/errorHandler.js";

import { router as staticRouter } from "./routes/static.js";
import { router as plantsRouter } from "./routes/plants.js";
import { router as kpisRouter } from "./routes/kpis.js";
import { router as drillsRouter } from "./routes/drills.js";
import { router as trendsRouter } from "./routes/trends.js";
import { router as inventoryRouter } from "./routes/inventory.js";
import { router as anomaliesRouter } from "./routes/anomalies.js";
import { router as dashboardRouter } from "./routes/dashboard.js";

const app = express();

app.use(corsMiddleware);
app.use(express.json());
app.use(requestLogger);

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

app.use(notFound);
app.use(errorHandler);

app.listen(config.port, () => {
  // eslint-disable-next-line no-console
  console.log(
    `JK Dashboard backend listening on http://localhost:${config.port}`,
  );
  // eslint-disable-next-line no-console
  console.log(`CORS allow-origin: ${config.frontendOrigin}`);
});
