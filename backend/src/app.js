/**
 * Express app assembly — separated from the listener so tests can mount it
 * on an ephemeral port in-process. index.js owns binding the real port.
 */
import express from "express";
import cookieParser from "cookie-parser";
import compression from "compression";

import { corsMiddleware } from "./middlewares/cors.js";
import { requestLogger } from "./middlewares/requestLogger.js";
import { warmContext } from "./middlewares/warmContext.js";
import { notFound } from "./middlewares/notFound.js";
import { errorHandler } from "./middlewares/errorHandler.js";
import { warmRecorder } from "./utils/warm-recorder.js";
import { config } from "./config.js";

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
import { router as chatRouter } from "./routes/chat.js";
import { router as mailRouter } from "./routes/mail.js";
import { router as rcaRouter } from "./routes/rca.js";
import { router as qualityProcessRouter } from "./quality/routes/process.routes.js";
import { router as qualityProductRouter } from "./quality/routes/product.routes.js";
import { router as qualitySpcRouter } from "./quality/routes/spc.routes.js";
import { router as qualityRouter } from "./quality/routes/quality.routes.js";
import {
  router as ctpQualityProcessRouter,
  productRouter as ctpQualityProductRouter,
  spcRouter as ctpQualitySpcRouter,
} from "./quality/ctp/routes.js";
import { router as engineeringReliabilityRouter } from "./engineering/routes/reliability.routes.js";
import { router as complianceRouter } from "./compliance/routes.js";
import { router as safetyRouter } from "./safety/routes.js";
import { router as stockCostRouter } from "./stock-cost/routes.js";
import { router as calibrationRouter } from "./calibration/routes.js";

// Auth slice — see backend/src/middlewares/auth.middleware.js
import authRouter from "./routes/auth.js";
import rolesRouter from "./routes/roles.js";
import { verifyJWT } from "./middlewares/auth.middleware.js";

const app = express();

app.use(corsMiddleware);
// gzip JSON responses. kpi-data rows are highly repetitive: a 753 kB payload
// goes over the wire as ~22 kB, which is most of the transfer time for a
// remote browser.
app.use(compression());
app.use(express.json());
// verifyJWT reads the optional `accessToken` cookie as a fallback
// when the Authorization header is absent.
app.use(cookieParser());
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

// --- Auth (unsecured) ---
// Login / refresh / forgot / reset live under /api/v1/auth and are
// reachable without a token. Everything else under /api/v1/* is gated
// by verifyJWT below.
app.use("/api/v1/auth", authRouter);
app.use("/api/v1/roles", rolesRouter);

// Optional kill-switch for local dev / tests: AUTH_ENABLED=false
// leaves every route public (the verifyJWT mount is skipped
// entirely). NODE_ENV=test bypasses auth by default so the route
// smoke tests can hit `/api/v1/*` without a token. Default is true
// in production / development.
const protectApi = config.auth.enabled && process.env.NODE_ENV !== "test";

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
// Static catalog endpoints (plant list, functions, sections,
// category tabs) are PUBLIC so the login page can render the plant
// grid behind the login card. Per-plant detail + production routes
// stay gated. staticRouter MUST mount first so `/plants` (list)
// doesn't shadow `/plants/:id`.
app.use("/api/v1", staticRouter);

const gate = protectApi
  ? (req, _res, next) =>
      req._isWarmReplay ? next() : verifyJWT(req, _res, next)
  : (_req, _res, next) => next();
app.use("/api/v1/plants", gate, plantsRouter);
app.use("/api/v1/plants/:plantId/production/kpis", gate, kpisRouter);
app.use("/api/v1/plants/:plantId/production/trends", gate, trendsRouter);
app.use("/api/v1/plants/:plantId/production/drills", gate, drillsRouter);
app.use("/api/v1/plants/:plantId/inventory", gate, inventoryRouter);
app.use("/api/v1/plants/:plantId/anomalies", gate, anomaliesRouter);
app.use("/api/v1/dashboard", gate, dashboardRouter);
// /api/v1/dashboard/snapshot — composes the page-load chain into one call.
app.use("/api/v1/dashboard", gate, snapshotRouter);
//   /api/v1/admin/cache/{stats,warm}                      → cache ops
app.use("/api/v1/admin", gate, adminRouter);
// JK Agent chatbot — proxies the JK KPI Assistant service.
//   /api/v1/chat                                          → send a query
//   /api/v1/chat/download/:resultId                       → full result JSON
//   /api/v1/chat/report/:reportId/pdf                     → report PDF (binary)
app.use("/api/v1/chat", gate, chatRouter);
// Report mail sent from the dashboard navbar.
//   /api/v1/mail/scheduler-adherence/{preview,send}
app.use("/api/v1/mail", gate, mailRouter);
// RCA Why-Why form → PDF of the official sheet (proxies the RCA export service).
//   /api/v1/rca/pdf
app.use("/api/v1/rca", gate, rcaRouter);

// Quality Dashboard (additive; separate data family — FRD §A).
//   /api/v1/quality/process/{kpi-value,kpi-value-batch,kpi-children,kpi-history}
//   /api/v1/quality/product/{summary,children,history}
//   /api/v1/quality/spc/{summary,filter-options,widgets,detail,*-observations}
app.use("/api/v1/quality/process", gate, qualityProcessRouter);
app.use("/api/v1/quality/product", gate, qualityProductRouter);
app.use("/api/v1/quality/spc", gate, qualitySpcRouter);
//   /api/v1/quality/ctp/process/{summary,trend}          → CTP Process Audit
app.use("/api/v1/quality/ctp/process", gate, ctpQualityProcessRouter);
app.use("/api/v1/quality/ctp/product", gate, ctpQualityProductRouter);
app.use("/api/v1/quality/ctp/spc", gate, ctpQualitySpcRouter);
app.use("/api/v1/quality", gate, qualityRouter);

// Engineering Head dashboard (additive; separate data family — spec 16/17).
//   /api/v1/engineering/reliability/{summary,kpi-children,kpi-history,latest-date,loss-tree}
app.use("/api/v1/engineering/reliability", gate, engineeringReliabilityRouter);
// BTP compliance is selected by exact KPI names, independent of department/category.
app.use("/api/v1/compliance", gate, complianceRouter);
app.use("/api/v1/engineering/safety", gate, safetyRouter);
app.use("/api/v1/engineering/stock-cost", gate, stockCostRouter);
app.use("/api/v1/engineering/calibration", gate, calibrationRouter);

app.use(notFound);
app.use(errorHandler);

export { app };
