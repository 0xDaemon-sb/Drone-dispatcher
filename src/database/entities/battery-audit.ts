import { EntitySchema } from "typeorm";

import { droneStates, type Drone, type DroneState } from "./drone.js";

export interface BatteryAudit {
  id: string;
  droneId: string;
  drone?: Drone;
  batteryCapacity: number;
  state: DroneState;
  checkedAt: Date;
}

export const batteryAuditSchema = new EntitySchema<BatteryAudit>({
  name: "BatteryAudit",
  tableName: "battery_audits",
  columns: {
    id: { type: "uuid", primary: true, generated: "uuid" },
    droneId: { name: "drone_id", type: "uuid" },
    batteryCapacity: { name: "battery_capacity", type: "integer" },
    state: { type: "enum", enum: [...droneStates], enumName: "drone_state" },
    checkedAt: { name: "checked_at", type: "timestamptz", createDate: true },
  },
  relations: {
    drone: {
      type: "many-to-one",
      target: "Drone",
      joinColumn: { name: "drone_id", foreignKeyConstraintName: "FK_battery_audits_drone" },
      nullable: false,
      onDelete: "RESTRICT",
    },
  },
  indices: [{ name: "IDX_battery_audits_drone_checked_at", columns: ["droneId", "checkedAt"] }],
  checks: [
    { name: "CHK_battery_audits_capacity", expression: '"battery_capacity" BETWEEN 0 AND 100' },
  ],
});
