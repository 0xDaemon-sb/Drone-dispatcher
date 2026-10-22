import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { dataSource } from "./database/data-source.js";
import { logger } from "./lib/logger.js";

const start = async (): Promise<void> => {
  await dataSource.initialize();
  if (await dataSource.showMigrations()) {
    throw new Error("Database migrations are pending. Run npm run db:migrate before starting the API.");
  }

  const server = createApp().listen(env.PORT, () => {
    logger.info({ port: env.PORT }, "Dispatch controller listening");
  });

  server.on("error", (error) => {
    logger.error({ err: error }, "HTTP server failed");
    process.exitCode = 1;
    void dataSource.destroy().catch((cause: unknown) => {
      logger.error({ err: cause }, "Failed to close database connection");
    });
  });

  let shuttingDown = false;
  const shutDown = (signal: NodeJS.Signals) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, "Shutting down");
    const timeout = setTimeout(() => {
      logger.error("Graceful shutdown timed out");
      process.exit(1);
    }, 10_000);
    timeout.unref();

    server.close((error) => {
      void (async () => {
        if (error) {
          logger.error({ err: error }, "Failed to close HTTP server cleanly");
          process.exitCode = 1;
        }
        try {
          if (dataSource.isInitialized) await dataSource.destroy();
        } catch (cause) {
          logger.error({ err: cause }, "Failed to close database connection");
          process.exitCode = 1;
        } finally {
          clearTimeout(timeout);
        }
      })();
    });
  };
  process.on("SIGINT", shutDown);
  process.on("SIGTERM", shutDown);
};

void start().catch(async (error: unknown) => {
  logger.error({ err: error }, "Service startup failed");
  process.exitCode = 1;
  if (dataSource.isInitialized) await dataSource.destroy();
});
