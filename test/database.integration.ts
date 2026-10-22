import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
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
    expect(await database.getRepository(medicationSchema).find()).toEqual(
      expect.arrayContaining([expect.objectContaining({ droneId: null })]),
    );
    expect(await database.getRepository(batteryAuditSchema).count()).toBe(0);
  });

  const validDrone = {
    serialNumber: "NEW-DRONE",
    model: "Lightweight" as const,
    weightLimit: 500,
    batteryCapacity: 25,
    state: "IDLE" as const,
  };

  it.each([
    ["duplicate serial", { serialNumber: "BLU-001" }],
    ["empty serial", { serialNumber: "   " }],
    ["long serial", { serialNumber: "A".repeat(101) }],
    ["zero weight limit", { weightLimit: 0 }],
    ["excess weight limit", { weightLimit: 501 }],
    ["negative battery", { batteryCapacity: -1 }],
    ["battery above 100", { batteryCapacity: 101 }],
    ["low battery while loading", { batteryCapacity: 24, state: "LOADING" as const }],
  ])("rejects %s at the database boundary", async (_name, overrides) => {
    await expect(database.getRepository(droneSchema).insert({ ...validDrone, ...overrides })).rejects.toThrow();
  });

  it("accepts exactly 25% battery for LOADING and prevents subsequent reduction below 25%", async () => {
    const drones = database.getRepository(droneSchema);
    const result = await drones.insert({ ...validDrone, state: "LOADING" });
    const id = result.identifiers[0]?.id as string;
    await expect(drones.update(id, { batteryCapacity: 24 })).rejects.toThrow();
  });

  it.each([
    { name: "Invalid name" },
    { code: "lowercase" },
    { weight: 0 },
    { image: "" },
    { droneId: "00000000-0000-4000-8000-999999999999" },
  ])("rejects invalid medication data: %j", async (overrides) => {
    await expect(database.getRepository(medicationSchema).insert({
      name: "Valid-Name_1", code: "VALID_1", weight: 1, image: "data:image/png;base64,AA==", ...overrides,
    })).rejects.toThrow();
  });

  it("persists audit snapshots and protects drone references from deletion", async () => {
    const droneId = "00000000-0000-4000-8000-000000000001";
    const audits = database.getRepository(batteryAuditSchema);
    await audits.insert({ droneId, batteryCapacity: 61, state: "IDLE" });
    expect(await audits.findOneByOrFail({ droneId })).toEqual(expect.objectContaining({
      droneId, batteryCapacity: 61, checkedAt: expect.any(Date),
    }));
    await expect(audits.insert({ droneId, batteryCapacity: 101, state: "IDLE" })).rejects.toThrow();
    await expect(database.getRepository(droneSchema).delete(droneId)).rejects.toThrow();
  });

  it("rolls back and reapplies the initial migration", async () => {
    await database.undoLastMigration();
    expect(await database.query("SELECT to_regclass('public.drones') AS name")).toEqual([{ name: null }]);
    expect(await database.showMigrations()).toBe(true);
    await database.runMigrations();
    expect(await database.getRepository(droneSchema).count()).toBe(0);
  });
});
