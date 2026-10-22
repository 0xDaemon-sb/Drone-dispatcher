import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, beforeEach } from "@jest/globals";
import { DataSource } from "typeorm";

import { createDataSource } from "../../src/database/data-source.js";

// Each integration suite gets its own temporary database and clean tables per test.
export const useTestDatabase = () => {
  const adminUrl = process.env.TEST_DATABASE_URL;
  if (!adminUrl) throw new Error("Set TEST_DATABASE_URL to a local PostgreSQL connection with CREATEDB permission.");

  const databaseName = `blusalt_test_${randomUUID().replaceAll("-", "")}`;
  const admin = new DataSource({ type: "postgres", url: adminUrl, connectTimeoutMS: 5_000 });
  const testUrl = new URL(adminUrl);
  testUrl.pathname = `/${databaseName}`;
  const database = createDataSource(testUrl.toString());
  let created = false;

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

  return database;
};
