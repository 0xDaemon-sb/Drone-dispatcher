import type { DataSource } from "typeorm";

import { createBatteryAuditRepository } from "./battery-audit.repository.js";

export const recordBatteryAudits = (database: DataSource): Promise<void> =>
  createBatteryAuditRepository(database.manager).recordSnapshots();
