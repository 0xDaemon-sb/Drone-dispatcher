import { describe, expect, it } from "@jest/globals";
import request from "supertest";

import { createApp } from "../src/app.js";
import { droneModels, droneSchema, droneStates } from "../src/database/entities/drone.js";
import { medicationSchema } from "../src/database/entities/medication.js";
import { useTestDatabase } from "./helpers/database.js";

describe("Drone endpoints", () => {
  const database = useTestDatabase();
  const app = createApp(database);
  const drones = database.getRepository(droneSchema);
  const medications = database.getRepository(medicationSchema);
  const input = {
    serialNumber: "TEST-001",
    model: "Lightweight" as const,
    weightLimit: 500,
    batteryCapacity: 100,
  };
  const medication = {
    name: "Medication_1", code: "MED_1", weight: 100,
    image: "https://example.com/medications/test.png",
  };

  it.each(droneModels)("registers a %s drone in IDLE", async (model) => {
    const response = await request(app).post("/api/v1/drones").send({ ...input, model });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ ...input, model, state: "IDLE", id: expect.any(String) });
    expect(response.headers["content-type"]).toMatch(/application\/json/);
    expect(response.headers["x-request-id"]).toBeDefined();
    expect(await drones.findOneByOrFail({ serialNumber: input.serialNumber }))
      .toMatchObject({ ...input, model, state: "IDLE" });
  });

  it("accepts boundary values and trims serial numbers", async () => {
    const response = await request(app).post("/api/v1/drones").send({
      ...input, serialNumber: ` ${"A".repeat(100)} `, weightLimit: 1, batteryCapacity: 0,
    });
    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ serialNumber: "A".repeat(100), weightLimit: 1, batteryCapacity: 0 });
  });

  it.each([
    { serialNumber: "" },
    { serialNumber: "   " },
    { serialNumber: "A".repeat(101) },
    { model: "Unknown" },
    { weightLimit: 0 },
    { weightLimit: 501 },
    { weightLimit: 10.5 },
    { weightLimit: "100" },
    { batteryCapacity: -1 },
    { batteryCapacity: 101 },
    { batteryCapacity: 25.5 },
    { batteryCapacity: "25" },
    { state: "DELIVERING" },
    { id: "00000000-0000-4000-8000-000000000001" },
  ])("rejects invalid registration data: %j", async (overrides) => {
    const response = await request(app).post("/api/v1/drones").send({ ...input, ...overrides });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
    expect(await drones.count()).toBe(0);
  });

  it("rejects a registration missing required fields", async () => {
    const response = await request(app).post("/api/v1/drones").send({ serialNumber: "TEST" });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
    expect(await drones.count()).toBe(0);
  });

  it("returns 409 for duplicate serial numbers, including concurrent registrations", async () => {
    const responses = await Promise.all([
      request(app).post("/api/v1/drones").send(input),
      request(app).post("/api/v1/drones").send(input),
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
    expect(responses.find((response) => response.status === 409)?.body).toEqual({
      error: { code: "DRONE_ALREADY_EXISTS", message: "A drone with this serial number already exists." },
    });
    expect(await drones.count()).toBe(1);
  });

  it("returns a drone's battery percentage", async () => {
    await drones.insert({ ...input, batteryCapacity: 25 });
    const response = await request(app).get("/api/v1/drones/TEST-001/battery");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ serialNumber: "TEST-001", batteryCapacity: 25 });
  });

  it("returns only medications assigned to the specified drone, preserving image URLs", async () => {
    const first = await drones.save({ ...input, state: "LOADED" });
    const second = await drones.save({ ...input, serialNumber: "TEST-002", state: "LOADED" });
    await medications.insert([
      { ...medication, droneId: first.id },
      { ...medication, droneId: second.id, code: "OTHER_DRONE" },
      { ...medication, code: "UNASSIGNED" },
    ]);
    const response = await request(app).get("/api/v1/drones/TEST-001/medications");
    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(1);
    expect(response.body[0]).toMatchObject({ ...medication, droneId: first.id });
  });

  it("returns an empty medication list for a registered empty drone", async () => {
    await drones.insert({ ...input });
    const response = await request(app).get("/api/v1/drones/TEST-001/medications");
    expect(response.status).toBe(200);
    expect(response.body).toEqual([]);
  });

  it.each(["battery", "medications"])("returns 404 when querying %s for an unknown drone", async (resource) => {
    const response = await request(app).get(`/api/v1/drones/MISSING/${resource}`);
    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: { code: "DRONE_NOT_FOUND", message: "Drone not found." } });
  });

  it.each(["battery", "medications"])("validates serial-number parameters for %s", async (resource) => {
    const response = await request(app).get(`/api/v1/drones/${"A".repeat(101)}/${resource}`);
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns an empty available list when the fleet is empty", async () => {
    const response = await request(app).get("/api/v1/drones/available");
    expect(response.status).toBe(200);
    expect(response.body).toEqual([]);
  });

  it("filters availability by state, battery, and total existing medication weight", async () => {
    for (const state of droneStates) {
      await drones.insert({ ...input, serialNumber: `STATE-${state}`, state });
    }
    await drones.insert({ ...input, serialNumber: "LOW-BATTERY", batteryCapacity: 24 });
    await drones.insert({ ...input, serialNumber: "AT-THRESHOLD", batteryCapacity: 25 });
    const full = await drones.save({ ...input, serialNumber: "FULL", state: "LOADED" });
    const partial = await drones.save({ ...input, serialNumber: "PARTIAL", state: "LOADED" });
    await medications.insert([
      { ...medication, droneId: full.id, weight: 200 },
      { ...medication, droneId: full.id, weight: 300 },
      { ...medication, droneId: partial.id, weight: 499 },
      { ...medication, weight: 500 },
    ]);

    const response = await request(app).get("/api/v1/drones/available");
    expect(response.status).toBe(200);
    expect(response.body.map((drone: { serialNumber: string }) => drone.serialNumber))
      .toEqual(["AT-THRESHOLD", "PARTIAL", "STATE-IDLE", "STATE-LOADED", "STATE-LOADING"]);
  });
});
