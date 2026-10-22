import { EntitySchema } from "typeorm";

export const droneModels = ["Lightweight", "Middleweight", "Cruiserweight", "Heavyweight"] as const;
export const droneStates = ["IDLE", "LOADING", "LOADED", "DELIVERING", "DELIVERED", "RETURNING"] as const;

export type DroneModel = (typeof droneModels)[number];
export type DroneState = (typeof droneStates)[number];

export interface Drone {
  id: string;
  serialNumber: string;
  model: DroneModel;
  weightLimit: number;
  batteryCapacity: number;
  state: DroneState;
  createdAt: Date;
  updatedAt: Date;
}

export const droneSchema = new EntitySchema<Drone>({
  name: "Drone",
  tableName: "drones",
  columns: {
    id: { type: "uuid", primary: true, generated: "uuid" },
    serialNumber: { name: "serial_number", type: "varchar", length: 100 },
    model: { type: "enum", enum: [...droneModels], enumName: "drone_model" },
    weightLimit: { name: "weight_limit", type: "integer" },
    batteryCapacity: { name: "battery_capacity", type: "integer" },
    state: { type: "enum", enum: [...droneStates], enumName: "drone_state", default: "IDLE" },
    createdAt: { name: "created_at", type: "timestamptz", createDate: true },
    updatedAt: { name: "updated_at", type: "timestamptz", updateDate: true },
  },
  uniques: [{ name: "UQ_drones_serial_number", columns: ["serialNumber"] }],
  checks: [
    { name: "CHK_drones_serial_number", expression: 'length(btrim("serial_number")) > 0' },
    { name: "CHK_drones_weight_limit", expression: '"weight_limit" > 0 AND "weight_limit" <= 500' },
    { name: "CHK_drones_battery_capacity", expression: '"battery_capacity" BETWEEN 0 AND 100' },
    { name: "CHK_drones_loading_battery", expression: '"state" != \'LOADING\' OR "battery_capacity" >= 25' },
  ],
});
