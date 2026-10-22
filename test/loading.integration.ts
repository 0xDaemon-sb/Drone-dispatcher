import { describe, expect, it } from "@jest/globals";
import request from "supertest";

import { createApp } from "../src/app.js";
import { droneSchema } from "../src/database/entities/drone.js";
import { medicationSchema } from "../src/database/entities/medication.js";
import { useTestDatabase } from "./helpers/database.js";

describe("Medication loading", () => {
  const database = useTestDatabase();
  const app = createApp(database);
  const drones = database.getRepository(droneSchema);
  const medications = database.getRepository(medicationSchema);
  const endpoint = "/api/v1/drones/LOAD-001/medications";
  const droneInput = {
    serialNumber: "LOAD-001", model: "Lightweight" as const,
    weightLimit: 500, batteryCapacity: 100, state: "IDLE" as const,
  };
  const medication = {
    name: "Paracetamol-500_1", code: "PARA_500", weight: 100,
    image: "https://example.com/medications/paracetamol.png",
  };

  it("loads a batch, sets LOADED, and returns its medications through the query endpoint", async () => {
    const drone = await drones.save({ ...droneInput });
    const response = await request(app).post(endpoint).send({ medications: [medication, { ...medication, code: "SECOND" }] });
    expect(response.status).toBe(201);
    expect(response.headers["x-request-id"]).toBeDefined();
    expect(response.body).toHaveLength(2);
    expect(response.body[0]).toMatchObject({ ...medication, droneId: drone.id, id: expect.any(String) });
    expect((await drones.findOneByOrFail({ id: drone.id })).state).toBe("LOADED");
    const loaded = await request(app).get(endpoint);
    expect(loaded.status).toBe(200);
    expect(loaded.body).toEqual(expect.arrayContaining(response.body));
  });

  it.each(["IDLE", "LOADING", "LOADED"] as const)("accepts %s at exactly 25%% battery and exact capacity", async (state) => {
    const drone = await drones.save({ ...droneInput, state, batteryCapacity: 25 });
    const response = await request(app).post(endpoint).send({ medications: [{ ...medication, weight: 500 }] });
    expect(response.status).toBe(201);
    expect(await medications.sum("weight", { droneId: drone.id })).toBe(500);
    expect((await drones.findOneByOrFail({ id: drone.id })).state).toBe("LOADED");
    expect((await request(app).get("/api/v1/drones/available")).body).toEqual([]);
  });

  it("appends to existing items and preserves other drones and unassigned medications", async () => {
    const drone = await drones.save({ ...droneInput, state: "LOADED" });
    const other = await drones.save({ ...droneInput, serialNumber: "OTHER" });
    await medications.insert([
      { ...medication, droneId: drone.id, weight: 400 },
      { ...medication, droneId: other.id, weight: 500 },
      { ...medication, weight: 500 },
    ]);
    const response = await request(app).post(endpoint).send({ medications: [medication] });
    expect(response.status).toBe(201);
    expect(await medications.countBy({ droneId: drone.id })).toBe(2);
    expect(await medications.sum("weight", { droneId: drone.id })).toBe(500);
    expect(await medications.sum("weight", { droneId: other.id })).toBe(500);
    expect(await medications.count()).toBe(4);
  });

  it.each([0, 24])("rejects battery level %i without changing the drone or its payload", async (batteryCapacity) => {
    const drone = await drones.save({ ...droneInput, batteryCapacity });
    const response = await request(app).post(endpoint).send({ medications: [medication] });
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("INSUFFICIENT_BATTERY");
    expect(await medications.count()).toBe(0);
    expect(await drones.findOneByOrFail({ id: drone.id })).toEqual(drone);
  });

  it.each(["DELIVERING", "DELIVERED", "RETURNING"] as const)("rejects the %s state", async (state) => {
    const drone = await drones.save({ ...droneInput, state });
    const response = await request(app).post(endpoint).send({ medications: [medication] });
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("DRONE_NOT_LOADABLE");
    expect(await medications.count()).toBe(0);
    expect(await drones.findOneByOrFail({ id: drone.id })).toEqual(drone);
  });

  it("rejects an overweight batch as a whole", async () => {
    const drone = await drones.save({ ...droneInput, weightLimit: 200 });
    const response = await request(app).post(endpoint).send({
      medications: [{ ...medication, weight: 100 }, { ...medication, weight: 101 }],
    });
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("WEIGHT_LIMIT_EXCEEDED");
    expect(await medications.count()).toBe(0);
    expect(await drones.findOneByOrFail({ id: drone.id })).toEqual(drone);
  });

  it("includes existing payload when checking capacity", async () => {
    const drone = await drones.save({ ...droneInput, state: "LOADED" });
    await medications.insert({ ...medication, droneId: drone.id, weight: 450 });
    const response = await request(app).post(endpoint).send({ medications: [{ ...medication, weight: 51 }] });
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("WEIGHT_LIMIT_EXCEEDED");
    expect(await medications.sum("weight", { droneId: drone.id })).toBe(450);
    expect(await medications.count()).toBe(1);
  });

  it.each([
    { name: "Invalid name" }, { name: "" }, { name: "Invalid!" },
    { code: "lowercase" }, { code: "" }, { code: "INVALID-CODE" },
    { weight: 0 }, { weight: -1 }, { weight: 0.5 }, { weight: "100" },
    { image: "not-a-url" }, { image: "https://" },
    { image: "data:image/png;base64,AA==" }, { image: "ftp://example.com/med.png" },
    { id: "00000000-0000-4000-8000-000000000001" },
    { droneId: "00000000-0000-4000-8000-000000000001" },
  ])("rejects the entire batch when an item is invalid: %j", async (overrides) => {
    const drone = await drones.save({ ...droneInput });
    const response = await request(app).post(endpoint).send({ medications: [medication, { ...medication, ...overrides }] });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
    expect(await medications.count()).toBe(0);
    expect(await drones.findOneByOrFail({ id: drone.id })).toEqual(drone);
  });

  it.each([{}, { medications: [] }, { medications: {} }, { medications: [{}] }])("rejects an invalid batch envelope: %j", async (body) => {
    await drones.insert({ ...droneInput });
    const response = await request(app).post(endpoint).send(body);
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
    expect(await medications.count()).toBe(0);
  });

  it("accepts an HTTP image URL", async () => {
    await drones.insert({ ...droneInput });
    const image = "http://example.com/medications/test.png";
    const response = await request(app).post(endpoint).send({ medications: [{ ...medication, image }] });
    expect(response.status).toBe(201);
    expect(response.body[0].image).toBe(image);
  });

  it("returns 404 for an unknown drone", async () => {
    const response = await request(app).post(endpoint).send({ medications: [medication] });
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("DRONE_NOT_FOUND");
    expect(await medications.count()).toBe(0);
  });

  it("validates the drone serial number", async () => {
    const response = await request(app).post(`/api/v1/drones/${"A".repeat(101)}/medications`)
      .send({ medications: [medication] });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rolls back inserted medications when the subsequent state update fails", async () => {
    const drone = await drones.save({ ...droneInput });
    await database.query(`
      CREATE FUNCTION reject_loaded_state() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.state = 'LOADED' THEN RAISE EXCEPTION 'Simulated state update failure'; END IF;
        RETURN NEW;
      END;
      $$;
      CREATE TRIGGER reject_loaded_state BEFORE UPDATE ON drones
      FOR EACH ROW EXECUTE FUNCTION reject_loaded_state();
    `);
    try {
      const response = await request(app).post(endpoint).send({ medications: [medication] });
      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: { code: "INTERNAL_SERVER_ERROR", message: "An unexpected error occurred." } });
      expect(await medications.count()).toBe(0);
      expect(await drones.findOneByOrFail({ id: drone.id })).toEqual(drone);
    } finally {
      await database.query("DROP TRIGGER reject_loaded_state ON drones; DROP FUNCTION reject_loaded_state();");
    }
  });

  it("serializes competing batches so concurrent requests cannot overload a drone", async () => {
    const drone = await drones.save({ ...droneInput });
    const responses = await Promise.all([
      request(app).post(endpoint).send({ medications: [{ ...medication, weight: 300, code: "BATCH_A" }] }),
      request(app).post(endpoint).send({ medications: [{ ...medication, weight: 300, code: "BATCH_B" }] }),
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
    expect(responses.find((response) => response.status === 409)?.body.error.code).toBe("WEIGHT_LIMIT_EXCEEDED");
    expect(await medications.countBy({ droneId: drone.id })).toBe(1);
    expect(await medications.sum("weight", { droneId: drone.id })).toBe(300);
    expect((await drones.findOneByOrFail({ id: drone.id })).state).toBe("LOADED");
  });

  it("preserves both concurrent batches when their combined weight fits", async () => {
    const drone = await drones.save({ ...droneInput });
    const responses = await Promise.all([
      request(app).post(endpoint).send({ medications: [{ ...medication, weight: 250, code: "BATCH_A" }] }),
      request(app).post(endpoint).send({ medications: [{ ...medication, weight: 250, code: "BATCH_B" }] }),
    ]);
    expect(responses.map((response) => response.status)).toEqual([201, 201]);
    expect(await medications.countBy({ droneId: drone.id })).toBe(2);
    expect(await medications.sum("weight", { droneId: drone.id })).toBe(500);
  });
});
