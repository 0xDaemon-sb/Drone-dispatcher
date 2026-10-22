import { describe, expect, it } from "@jest/globals";
import request from "supertest";

import { createApp } from "../src/app.js";
import { batteryAuditSchema } from "../src/database/entities/battery-audit.js";
import { droneSchema } from "../src/database/entities/drone.js";
import { seedDatabase } from "../src/database/seed-data.js";
import { recordBatteryAudits } from "../src/modules/drones/battery-audit.service.js";
import { useTestDatabase } from "./helpers/database.js";

describe("Battery audits", () => {
  const database = useTestDatabase();
  const app = createApp(database);
  const drones = database.getRepository(droneSchema);
  const audits = database.getRepository(batteryAuditSchema);
  const endpoint = "/api/v1/drones/AUDIT-001/battery-audits";
  const droneInput = {
    serialNumber: "AUDIT-001", model: "Lightweight" as const,
    weightLimit: 500, batteryCapacity: 100, state: "IDLE" as const,
  };

  it("handles an empty fleet", async () => {
    await recordBatteryAudits(database);
    expect(await audits.count()).toBe(0);
  });

  it("records every drone with a shared timestamp and leaves the fleet unchanged", async () => {
    await seedDatabase(database);
    const fleet = await drones.find({ order: { id: "ASC" } });
    await recordBatteryAudits(database);
    const snapshots = await audits.find({ order: { droneId: "ASC" } });
    expect(snapshots).toHaveLength(10);
    expect(snapshots.map(({ droneId, batteryCapacity, state }) => ({ droneId, batteryCapacity, state })))
      .toEqual(fleet.map(({ id, batteryCapacity, state }) => ({ droneId: id, batteryCapacity, state })));
    expect(new Set(snapshots.map((snapshot) => snapshot.checkedAt.getTime())).size).toBe(1);
    expect(await drones.find({ order: { id: "ASC" } })).toEqual(fleet);
  });

  it("retains earlier readings when a drone's battery and state change", async () => {
    const drone = await drones.save({ ...droneInput });
    await recordBatteryAudits(database);
    await drones.update(drone.id, { batteryCapacity: 24, state: "RETURNING" });
    await recordBatteryAudits(database);
    const snapshots = await audits.findBy({ droneId: drone.id });
    expect(snapshots).toHaveLength(2);
    expect(snapshots).toEqual(expect.arrayContaining([
      expect.objectContaining({ batteryCapacity: 100, state: "IDLE" }),
      expect.objectContaining({ batteryCapacity: 24, state: "RETURNING" }),
    ]));
  });

  it("rolls back the whole audit batch when an insert fails", async () => {
    const drone = await drones.save({ ...droneInput });
    await drones.insert({ ...droneInput, serialNumber: "AUDIT-002" });
    await database.query(`
      CREATE FUNCTION reject_battery_audit() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.drone_id = '${drone.id}'::uuid THEN RAISE EXCEPTION 'Simulated audit failure'; END IF;
        RETURN NEW;
      END;
      $$;
      CREATE TRIGGER reject_battery_audit BEFORE INSERT ON battery_audits
      FOR EACH ROW EXECUTE FUNCTION reject_battery_audit();
    `);
    try {
      await expect(recordBatteryAudits(database)).rejects.toThrow("Simulated audit failure");
      expect(await audits.count()).toBe(0);
    } finally {
      await database.query("DROP TRIGGER reject_battery_audit ON battery_audits; DROP FUNCTION reject_battery_audit();");
    }
    await recordBatteryAudits(database);
    expect(await audits.count()).toBe(2);
  });

  it("returns only the requested drone's history, newest first with stable tie ordering", async () => {
    const drone = await drones.save({ ...droneInput });
    const other = await drones.save({ ...droneInput, serialNumber: "OTHER" });
    const earlierId = "00000000-0000-4000-8000-000000000001";
    const laterId = "00000000-0000-4000-8000-000000000002";
    await audits.insert([
      { id: earlierId, droneId: drone.id, batteryCapacity: 80, state: "IDLE", checkedAt: new Date("2026-01-02") },
      { id: laterId, droneId: drone.id, batteryCapacity: 50, state: "LOADED", checkedAt: new Date("2026-01-02") },
      { droneId: drone.id, batteryCapacity: 100, state: "IDLE", checkedAt: new Date("2026-01-01") },
      { droneId: other.id, batteryCapacity: 10, state: "RETURNING" },
    ]);
    const response = await request(app).get(endpoint);
    expect(response.status).toBe(200);
    expect(response.headers["x-request-id"]).toBeDefined();
    expect(response.body.map((snapshot: { batteryCapacity: number }) => snapshot.batteryCapacity)).toEqual([50, 80, 100]);
    const page = await request(app).get(`${endpoint}?limit=1&offset=1`);
    expect(page.status).toBe(200);
    expect(page.body).toHaveLength(1);
    expect(page.body[0]).toMatchObject({ id: earlierId, droneId: drone.id, batteryCapacity: 80 });
    expect(page.body[0].checkedAt).toBe("2026-01-02T00:00:00.000Z");
  });

  it("defaults to 50 entries and permits at most 100 per page", async () => {
    const drone = await drones.save({ ...droneInput });
    await audits.insert(Array.from({ length: 120 }, () => ({ droneId: drone.id, batteryCapacity: 100, state: "IDLE" as const })));
    expect((await request(app).get(endpoint)).body).toHaveLength(50);
    expect((await request(app).get(`${endpoint}?limit=100`)).body).toHaveLength(100);
    expect((await request(app).get(`${endpoint}?limit=100&offset=100`)).body).toHaveLength(20);
  });

  it("returns an empty list for a known drone without history", async () => {
    await drones.insert({ ...droneInput });
    const response = await request(app).get(endpoint);
    expect(response.status).toBe(200);
    expect(response.body).toEqual([]);
  });

  it("returns 404 for an unknown drone", async () => {
    const response = await request(app).get(endpoint);
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("DRONE_NOT_FOUND");
  });

  it.each(["limit=0", "limit=101", "limit=1.5", "offset=-1", "offset=abc", "limit=abc", "limit=1&limit=2", "unknown=1"])(
    "rejects invalid history query: %s", async (query) => {
      await drones.insert({ ...droneInput });
      const response = await request(app).get(`${endpoint}?${query}`);
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
    },
  );

  it("validates the serial-number parameter", async () => {
    const response = await request(app).get(`/api/v1/drones/${"A".repeat(101)}/battery-audits`);
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });
});
