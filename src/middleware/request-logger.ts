import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";

import { pinoHttp } from "pino-http";

import { env } from "../config/env.js";
import { logger } from "../lib/logger.js";

const compactRequestLog = (
  request: IncomingMessage,
  response: ServerResponse,
  log: { responseTime?: number },
) => ({
  method: request.method,
  path: request.url,
  statusCode: response.statusCode,
  responseTime: log.responseTime,
});

export const requestLogger = pinoHttp({
  logger,
  autoLogging: env.NODE_ENV !== "test",
  ...(env.NODE_ENV === "development" && {
    autoLogging: { ignore: (request: IncomingMessage) => request.url === "/health" },
    quietReqLogger: true,
    quietResLogger: true,
    customSuccessObject: compactRequestLog,
    customErrorObject: (
      request: IncomingMessage,
      response: ServerResponse,
      error: Error,
      log: { responseTime?: number },
    ) => ({ ...compactRequestLog(request, response, log), error: error.message }),
  }),
  genReqId(request, response) {
    const suppliedId = request.headers["x-request-id"];
    const requestId = typeof suppliedId === "string" && suppliedId.length > 0
      ? suppliedId
      : randomUUID();

    response.setHeader("x-request-id", requestId);
    return requestId;
  },
});
