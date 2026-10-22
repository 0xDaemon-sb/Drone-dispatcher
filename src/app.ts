import express from "express";
import helmet from "helmet";
import type { DataSource } from "typeorm";

import { dataSource } from "./database/data-source.js";
import { errorHandler } from "./middleware/error-handler.js";
import { requestLogger } from "./middleware/request-logger.js";
import { createDroneRouter } from "./modules/drones/drone.routes.js";
import { docsRouter } from "./routes/docs.js";
import { healthRouter } from "./routes/health.js";

export const createApp = (database: DataSource = dataSource) => {
  const app = express();

  app.disable("x-powered-by");
  app.use(requestLogger);
  app.use(helmet());
  app.use(express.json({ limit: "1mb" }));

  app.use("/health", healthRouter);
  app.use("/api/v1/drones", createDroneRouter(database));
  app.use(docsRouter);

  app.use((_request, response) => {
    response.status(404).json({
      error: {
        code: "NOT_FOUND",
        message: "Route not found.",
      },
    });
  });

  app.use(errorHandler);

  return app;
};
