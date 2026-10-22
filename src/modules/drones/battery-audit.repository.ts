import type { EntityManager } from "typeorm";

import { batteryAuditSchema } from "../../database/entities/battery-audit.js";

export const createBatteryAuditRepository = (manager: EntityManager) => ({
  findByDroneId(droneId: string, page: { limit: number; offset: number }) {
    return manager.getRepository(batteryAuditSchema).find({
      where: { droneId },
      order: { checkedAt: "DESC", id: "DESC" },
      take: page.limit,
      skip: page.offset,
    });
  },

  async recordSnapshots(): Promise<void> {
    // One statement gives every drone a consistent snapshot and commits the batch atomically.
    await manager.query(`
      INSERT INTO battery_audits (drone_id, battery_capacity, state, checked_at)
      SELECT id, battery_capacity, state, statement_timestamp() FROM drones
    `);
  },
});
