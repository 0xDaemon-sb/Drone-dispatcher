import { describe, expect, it } from "@jest/globals";
import request from "supertest";

import { createApp } from "../src/app.js";

describe("HTTP application", () => {
  it("reports its health", async () => {
    const response = await request(createApp()).get("/health");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ok" });
    expect(response.headers).toHaveProperty("x-request-id");
  });

  it("returns a JSON response for unknown routes", async () => {
    const response = await request(createApp()).get("/does-not-exist");

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      error: {
        code: "NOT_FOUND",
        message: "Route not found.",
      },
    });
  });

  it("returns a consistent error for malformed JSON", async () => {
    const response = await request(createApp())
      .post("/does-not-exist")
      .set("content-type", "application/json")
      .send("{");

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: {
        code: "INVALID_JSON",
        message: "The request body contains invalid JSON.",
      },
    });
  });
});
