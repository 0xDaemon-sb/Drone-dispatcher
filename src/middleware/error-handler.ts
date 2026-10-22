import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";

import { logger } from "../lib/logger.js";

type ErrorResponse = {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
};

const isMalformedJsonError = (error: unknown): error is SyntaxError & { status: number } =>
  error instanceof SyntaxError &&
  "status" in error &&
  error.status === 400 &&
  "body" in error;

export const errorHandler: ErrorRequestHandler = (error, request, response, _next) => {
  if (error instanceof ZodError) {
    const body: ErrorResponse = {
      error: {
        code: "VALIDATION_ERROR",
        message: "The request is invalid.",
        details: error.issues,
      },
    };

    response.status(400).json(body);
    return;
  }

  if (isMalformedJsonError(error)) {
    response.status(400).json({
      error: {
        code: "INVALID_JSON",
        message: "The request body contains invalid JSON.",
      },
    } satisfies ErrorResponse);
    return;
  }

  logger.error({ error, method: request.method, path: request.path }, "Unhandled request error");
  response.status(500).json({
    error: {
      code: "INTERNAL_SERVER_ERROR",
      message: "An unexpected error occurred.",
    },
  } satisfies ErrorResponse);
};
