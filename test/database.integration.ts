import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "@jest/globals";
import { DataSource } from "typeorm";

import { createDataSource } from "../src/database/data-source.js";
import { batteryAuditSchema } from "../src/database/entities/battery-audit.js";
import { droneSchema } from "../src/database/entities/drone.js";
import { medicationSchema } from "../src/database/entities/medication.js";
import { seedDatabase } from "../src/database/seed-data.js";

// A dedicated temporary database keeps the development fleet untouched.
const adminUrl = process.env.TEST_DATABASE_URL;
if (!adminUrl) throw new Error("Set TEST_DATABASE_URL to a local PostgreSQL connection with CREATEDB permission.");

const databaseName = `blusalt_test_${randomUUID().replaceAll("-", "")}`;
const admin = new DataSource({ type: "postgres", url: adminUrl, connectTimeoutMS: 5_000 });
const testUrl = new URL(adminUrl);
testUrl.pathname = `/${databaseName}`;
const database = createDataSource(testUrl.toString());
let created = false;

describe("PostgreSQL persistence", () => {
  beforeAll(async () => {
    await admin.initialize();
    await admin.query(`CREATE DATABASE "${databaseName}"`);
    created = true;
    await database.initialize();
    await database.runMigrations();
  }, 20_000);

  afterAll(async () => {
    if (database.isInitialized) await database.destroy();
    if (admin.isInitialized) {
      if (created) await admin.query(`DROP DATABASE "${databaseName}" WITH (FORCE)`);
      await admin.destroy();
    }
  });

  beforeEach(async () => {
    await database.query('TRUNCATE "battery_audits", "medications", "drones"');
  });

  it("applies migrations once and keeps entity metadata aligned with the schema", async () => {
    expect(await database.showMigrations()).toBe(false);
    expect(await database.runMigrations()).toEqual([]);
    const changes = await database.driver.createSchemaBuilder().log();
    expect(changes.upQueries.map((query) => query.query)).toEqual([]);
  });

  it("seeds ten drones and three unassigned medications without overwriting existing records", async () => {
    await seedDatabase(database);
    const drones = database.getRepository(droneSchema);
    const id = "00000000-0000-4000-8000-000000000001";
    await drones.update(id, { batteryCapacity: 61 });
    await seedDatabase(database);
    expect(await drones.count()).toBe(10);
    expect((await drones.findOneByOrFail({ id })).batteryCapacity).toBe(61);
    expect(await database.getRepository(medicationSchema).count()).toBe(3);
    const medications = await database.getRepository(medicationSchema).find();
    expect(medications.every((medication) => medication.droneId === null)).toBe(true);
    expect(medications.every((medication) => new URL(medication.image).protocol === "https:")).toBe(true);
    expect(await database.getRepository(batteryAuditSchema).count()).toBe(0);
  });

  const validDrone = {
    serialNumber: "NEW-DRONE",
    model: "Lightweight" as const,
    weightLimit: 500,
    batteryCapacity: 25,
    state: "IDLE" as const,
  };

  it("rejects duplicate serial numbers", async () => {
    const drones = database.getRepository(droneSchema);
    await drones.insert({ ...validDrone });
    await expect(drones.insert({ ...validDrone })).rejects.toMatchObject({
      driverError: { code: "23505", constraint: "UQ_drones_serial_number" },
    });
  });

  it.each([
    ["empty serial", { serialNumber: "   " }, "CHK_drones_serial_number"],
    ["zero weight limit", { weightLimit: 0 }, "CHK_drones_weight_limit"],
    ["excess weight limit", { weightLimit: 501 }, "CHK_drones_weight_limit"],
    ["negative battery", { batteryCapacity: -1 }, "CHK_drones_battery_capacity"],
    ["battery above 100", { batteryCapacity: 101 }, "CHK_drones_battery_capacity"],
    ["low battery while loading", { batteryCapacity: 24, state: "LOADING" as const }, "CHK_drones_loading_battery"],
  ])("rejects %s at the database boundary", async (_name, overrides, constraint) => {
    await expect(database.getRepository(droneSchema).insert({ ...validDrone, ...overrides })).rejects.toMatchObject({
      driverError: { code: "23514", constraint },
    });
  });

  it("rejects serial numbers longer than 100 characters", async () => {
    await expect(database.getRepository(droneSchema).insert({
      ...validDrone, serialNumber: "A".repeat(101),
    })).rejects.toMatchObject({ driverError: { code: "22001" } });
  });

  it("accepts exactly 25% battery for LOADING and prevents subsequent reduction below 25%", async () => {
    const drones = database.getRepository(droneSchema);
    const drone = await drones.save({ ...validDrone, state: "LOADING" });
    await expect(drones.update(drone.id, { batteryCapacity: 24 })).rejects.toMatchObject({
      driverError: { code: "23514", constraint: "CHK_drones_loading_battery" },
    });
  });

  it.each([
    [{ name: "Invalid name" }, "23514", "CHK_medications_name"],
    [{ code: "lowercase" }, "23514", "CHK_medications_code"],
    [{ weight: 0 }, "23514", "CHK_medications_weight"],
    [{ image: "" }, "23514", "CHK_medications_image"],
    [{ droneId: "00000000-0000-4000-8000-999999999999" }, "23503", "FK_medications_drone"],
  ])("rejects invalid medication data: %j", async (overrides, code, constraint) => {
    await expect(database.getRepository(medicationSchema).insert({
      name: "Valid-Name_1", code: "VALID_1", weight: 1,
      image: "https://example.com/medications/test.png", ...overrides,
    })).rejects.toMatchObject({ driverError: { code, constraint } });
  });

  it("persists audit snapshots and protects drone references from deletion", async () => {
    const drone = await database.getRepository(droneSchema).save({ ...validDrone });
    const droneId = drone.id;
    const audits = database.getRepository(batteryAuditSchema);
    await audits.insert({ droneId, batteryCapacity: 61, state: "IDLE" });
    expect(await audits.findOneByOrFail({ droneId })).toEqual(expect.objectContaining({
      droneId, batteryCapacity: 61, checkedAt: expect.any(Date),
    }));
    await expect(audits.insert({ droneId, batteryCapacity: 101, state: "IDLE" })).rejects.toMatchObject({
      driverError: { code: "23514", constraint: "CHK_battery_audits_capacity" },
    });
    await expect(database.getRepository(droneSchema).delete(droneId)).rejects.toMatchObject({
      driverError: { code: "23503", constraint: "FK_battery_audits_drone" },
    });
  });

  it("upgrades the old image fixtures while preserving custom images", async () => {
    await seedDatabase(database);
    const medications = database.getRepository(medicationSchema);
    const customId = "00000000-0000-4000-9000-000000000002";
    const customImage = "https://example.com/medications/custom.png";
    await medications.update(customId, { image: customImage });
    await database.undoLastMigration();
    const legacy = await medications.findOneByOrFail({ code: "PARA_500" });
    expect(legacy.image.startsWith("data:image/png;base64,")).toBe(true);
    await database.runMigrations();
    expect((await medications.findOneByOrFail({ code: "PARA_500" })).image)
      .toBe("https://example.com/medications/paracetamol.png");
    expect((await medications.findOneByOrFail({ id: customId })).image).toBe(customImage);
  });

  it("rolls back and reapplies all migrations", async () => {
    for (let index = 0; index < database.migrations.length; index++) {
      await database.undoLastMigration();
    }
    expect(await database.query("SELECT to_regclass('public.drones') AS name")).toEqual([{ name: null }]);
    expect(await database.showMigrations()).toBe(true);
    await database.runMigrations();
    expect(await database.getRepository(droneSchema).count()).toBe(0);
  });
});
