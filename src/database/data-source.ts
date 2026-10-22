import "reflect-metadata";

import { DataSource } from "typeorm";

import { env } from "../config/env.js";
import { batteryAuditSchema } from "./entities/battery-audit.js";
import { droneSchema } from "./entities/drone.js";
import { medicationSchema } from "./entities/medication.js";
import { InitialSchema1792627200000 } from "./migrations/1792627200000-initial-schema.js";
import { MedicationImageUrls1792627201000 } from "./migrations/1792627201000-medication-image-urls.js";

export const createDataSource = (url: string = env.DATABASE_URL) => new DataSource({
  type: "postgres",
  url,
  entities: [droneSchema, medicationSchema, batteryAuditSchema],
  migrations: [InitialSchema1792627200000, MedicationImageUrls1792627201000],
  migrationsTableName: "migrations",
  synchronize: false,
  migrationsRun: false,
  installExtensions: false,
  uuidExtension: "pgcrypto",
  logging: false,
  connectTimeoutMS: 5_000,
  extra: { max: 10, idleTimeoutMillis: 30_000 },
});

export const dataSource = createDataSource();
