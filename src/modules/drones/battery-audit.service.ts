import type { DataSource } from "typeorm";

export const recordBatteryAudits = async (database: DataSource): Promise<void> => {
  // One statement gives every drone a consistent snapshot and commits the batch atomically.
  await database.query(`
    INSERT INTO battery_audits (drone_id, battery_capacity, state, checked_at)
    SELECT id, battery_capacity, state, statement_timestamp() FROM drones
  `);
};
