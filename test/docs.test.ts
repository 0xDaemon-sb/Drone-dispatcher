import { describe, expect, it } from "@jest/globals";
import request from "supertest";

import { createApp } from "../src/app.js";
import { openApiDocument } from "../src/docs/openapi.js";
import { loadMedicationsSchema, registerDroneSchema } from "../src/modules/drones/drone.schemas.js";

describe("API documentation", () => {
  const app = createApp();

  it("serves Swagger UI at the root with a local HTTP-compatible content policy", async () => {
    const response = await request(app).get("/");
    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toMatch(/text\/html/);
    expect(response.text).toContain("Blusalt API Documentation");
    expect(response.text).toContain("./swagger-ui-init.js");
    expect(response.headers["content-security-policy"]).toContain("script-src 'self'");
    expect(response.headers["content-security-policy"]).not.toContain("upgrade-insecure-requests");
  });

  it.each([
    "/swagger-ui.css", "/swagger-ui-bundle.js", "/swagger-ui-standalone-preset.js", "/swagger-ui-init.js",
  ])("serves the local Swagger asset %s", async (path) => {
    const response = await request(app).get(path);
    expect(response.status).toBe(200);
    expect(response.text.length).toBeGreaterThan(100);
    if (path === "/swagger-ui-init.js") {
      expect(response.text).toContain("/openapi.json");
      expect(response.text).not.toContain("petstore.swagger.io");
    }
  });

  it.each(["/does-not-exist", "/index.html", "/package.json", "/api/v1/drones/no-route"])(
    "preserves the JSON 404 response for %s", async (path) => {
      const response = await request(app).get(path);
      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe("NOT_FOUND");
    },
  );

  it("exposes every API operation and uses the current host", async () => {
    const response = await request(app).get("/openapi.json");
    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toMatch(/application\/json/);
    expect(response.body.openapi).toBe("3.0.3");
    expect(response.body.servers).toEqual([{ url: "/", description: "Current server" }]);
    const operations = Object.entries(openApiDocument.paths).flatMap(([path, item]) =>
      Object.entries(item).filter(([method]) => ["get", "post"].includes(method))
        .map(([method]) => `${method.toUpperCase()} ${path}`),
    );
    expect(operations.sort()).toEqual([
      "GET /health", "POST /api/v1/drones", "GET /api/v1/drones/available",
      "GET /api/v1/drones/{serialNumber}/battery", "GET /api/v1/drones/{serialNumber}/battery-audits",
      "GET /api/v1/drones/{serialNumber}/medications", "POST /api/v1/drones/{serialNumber}/medications",
    ].sort());
  });

  it("documents validation limits and examples that pass the runtime validators", () => {
    const schemas = openApiDocument.components.schemas;
    expect(schemas.RegisterDrone.additionalProperties).toBe(false);
    expect(schemas.RegisterDrone.properties?.weightLimit).toMatchObject({ type: "integer", maximum: 500 });
    expect(schemas.LoadMedications.properties?.medications).toMatchObject({ type: "array", minItems: 1 });
    const registerExample = openApiDocument.paths["/api/v1/drones"].post.requestBody.content["application/json"].example;
    const loadExample = openApiDocument.paths["/api/v1/drones/{serialNumber}/medications"].post.requestBody.content["application/json"].example;
    expect(registerDroneSchema.safeParse(registerExample).success).toBe(true);
    expect(loadMedicationsSchema.safeParse(loadExample).success).toBe(true);
    expect(openApiDocument.paths["/api/v1/drones/{serialNumber}/battery-audits"].get.parameters[0]?.schema)
      .toMatchObject({ minimum: 1, maximum: 100, default: 50 });
  });

  it("has no unresolved component references", () => {
    const visit = (value: unknown) => {
      if (value === null || typeof value !== "object") return;
      if ("$ref" in value) {
        expect(typeof value.$ref).toBe("string");
        const reference = String(value.$ref);
        expect(reference.startsWith("#/components/")).toBe(true);
        let target: unknown = openApiDocument;
        for (const segment of reference.slice(2).split("/")) {
          expect(target).toHaveProperty(segment);
          target = (target as Record<string, unknown>)[segment];
        }
      }
      Object.values(value).forEach(visit);
    };
    visit(openApiDocument);
  });

  it("documents loading conflict context and preserves validation detail arrays", () => {
    const schemas = openApiDocument.components.schemas;
    expect(schemas.Error).toMatchObject({ properties: { error: { properties: {
      details: { anyOf: [{ type: "array" }, { type: "object" }] },
    } } } });
    expect(schemas.LoadingConflict).toMatchObject({ properties: { error: { required: ["code", "message", "details"] } } });
    const examples = openApiDocument.components.responses.LoadingConflict.content["application/json"].examples;
    for (const example of Object.values(examples)) {
      expect(Object.keys(example.value.error.details).sort()).toEqual([...(schemas.LoadingConflictDetails.required ?? [])].sort());
      expect(example.value.error.details.remainingCapacity)
        .toBe(example.value.error.details.weightLimit - example.value.error.details.loadedWeight);
    }
  });
});
