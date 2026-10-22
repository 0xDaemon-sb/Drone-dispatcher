import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { logger } from "./lib/logger.js";

const app = createApp();

const server = app.listen(env.PORT, () => {
  logger.info({ port: env.PORT }, "Dispatch controller listening");
});

const shutDown = (signal: NodeJS.Signals) => {
  logger.info({ signal }, "Shutting down");
  server.close((error) => {
    if (error) {
      logger.error({ error }, "Failed to close HTTP server cleanly");
      process.exitCode = 1;
    }
  });
};

process.on("SIGINT", shutDown);
process.on("SIGTERM", shutDown);
