import { once } from "node:events";
import { createServer } from "node:http";
import { promisify } from "node:util";

import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { dataSource } from "./database/data-source.js";
import { logger } from "./lib/logger.js";

const server = createServer(createApp());

const closeDatabase = async (): Promise<void> => {
  try {
    if (dataSource.isInitialized) await dataSource.destroy();
  } catch (error) {
    logger.error({ err: error }, "Failed to close database connection");
    process.exitCode = 1;
  }
};

let shuttingDown = false;
const shutDown = async (signal: NodeJS.Signals): Promise<void> => {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, "Shutting down");

  const timeout = setTimeout(() => {
    logger.error("Graceful shutdown timed out");
    process.exit(1);
  }, 10_000);
  timeout.unref();

  try {
    await promisify(server.close.bind(server))();
  } catch (error) {
    logger.error({ err: error }, "Failed to close HTTP server cleanly");
    process.exitCode = 1;
  } finally {
    await closeDatabase();
    clearTimeout(timeout);
  }
};

const start = async (): Promise<void> => {
  await dataSource.initialize();
  if (await dataSource.showMigrations()) {
    throw new Error("Database migrations are pending. Run npm run db:migrate before starting the API.");
  }

  server.listen(env.PORT);
  await once(server, "listening");
  logger.info({ port: env.PORT }, "Dispatch controller listening");

  process.once("SIGINT", () => {
    void shutDown("SIGINT");
  });
  process.once("SIGTERM", () => {
    void shutDown("SIGTERM");
  });
};

void start().catch(async (error: unknown) => {
  logger.error({ err: error }, "Service startup failed");
  process.exitCode = 1;
  await closeDatabase();
});
