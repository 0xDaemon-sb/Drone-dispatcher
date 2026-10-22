import { describe, expect, it, jest } from "@jest/globals";
import express from "express";
import request from "supertest";

import { errorHandler } from "../src/middleware/error-handler.js";
import { requestLogger } from "../src/middleware/request-logger.js";

describe("Unhandled request errors", () => {
  it("logs the original error through the correlated request logger and hides internal details", async () => {
    const app = express();
    const error = new Error("Private database details");
    const logError = jest.fn();
    let logBindings: unknown;

    app.use(requestLogger);
    app.get("/fail", (req) => {
      logBindings = req.log.bindings();
      req.log.error = logError;
      throw error;
    });
    app.use(errorHandler);

    const response = await request(app).get("/fail").set("x-request-id", "debug-request-123");

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      error: { code: "INTERNAL_SERVER_ERROR", message: "An unexpected error occurred." },
    });
    expect(response.headers["x-request-id"]).toBe("debug-request-123");
    expect(logBindings).toMatchObject({ req: { id: "debug-request-123" } });
    expect(logError).toHaveBeenCalledWith(
      { err: error, method: "GET", path: "/fail" },
      "Unhandled request error",
    );
  });
});
