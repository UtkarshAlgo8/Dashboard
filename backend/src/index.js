import { logger } from "./utils/logger.js";
/**
 * Process entry point: bind the port.
 *
 * The app itself is assembled in app.js so tests can mount it on an ephemeral
 * port without this module's side effect of listening on the configured one.
 */
import { config } from "./config.js";
import { app } from "./app.js";
import { startWarmer } from "./utils/warmer.js";
import { startMaterializer } from "./utils/materializer.js";
import { startPreheater } from "./utils/preheater.js";

export const server = app.listen(config.port, () => {
  logger.info(
    `JK Dashboard backend listening on http://localhost:${config.port}`,
  );
  logger.info(`CORS allow-origin: ${config.frontendOrigin}`);
  // Started here rather than in app.js so mounting the app in a test never
  // schedules background upstream traffic. The warmer replays HTTP requests
  // against this server, so it can only start once we are listening.
  startWarmer();
  startMaterializer();
  startPreheater();
});
