import { randomUUID } from "node:crypto";

import express from "express";
import helmet from "helmet";
import { pinoHttp } from "pino-http";

import { env } from "./config/env.js";
import { logger } from "./lib/logger.js";
import { errorHandler } from "./middleware/error-handler.js";
import { healthRouter } from "./routes/health.js";

export const createApp = () => {
  const app = express();
  const isDevelopment = env.NODE_ENV === "development";

  app.disable("x-powered-by");
  app.use(
    pinoHttp({
      logger,
      autoLogging:
        env.NODE_ENV === "test"
          ? false
          : isDevelopment
            ? { ignore: (request) => request.url === "/health" }
            : true,
      quietReqLogger: isDevelopment,
      quietResLogger: isDevelopment,
      customSuccessObject(request, response, loggableObject) {
        if (!isDevelopment) {
          return loggableObject;
        }

        return {
          method: request.method,
          path: request.url,
          statusCode: response.statusCode,
          responseTime: loggableObject.responseTime,
        };
      },
      customErrorObject(request, response, error, loggableObject) {
        if (!isDevelopment) {
          return loggableObject;
        }

        return {
          method: request.method,
          path: request.url,
          statusCode: response.statusCode,
          responseTime: loggableObject.responseTime,
          error: error.message,
        };
      },
      genReqId(request, response) {
        const suppliedRequestId = request.headers["x-request-id"];
        const requestId =
          typeof suppliedRequestId === "string" && suppliedRequestId.length > 0
            ? suppliedRequestId
            : randomUUID();

        response.setHeader("x-request-id", requestId);
        return requestId;
      },
    }),
  );
  app.use(helmet());
  app.use(express.json({ limit: "1mb" }));

  app.use("/health", healthRouter);

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
