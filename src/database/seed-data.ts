import type { DataSource } from "typeorm";

import { droneSchema, type Drone } from "./entities/drone.js";
import { medicationSchema } from "./entities/medication.js";

// Stable IDs let reruns insert missing fixtures without overwriting existing records.
const drones: Omit<Drone, "createdAt" | "updatedAt">[] = [
  {
    id: "00000000-0000-4000-8000-000000000001", serialNumber: "BLU-001",
    model: "Lightweight", weightLimit: 200, batteryCapacity: 100, state: "IDLE",
  },
  {
    id: "00000000-0000-4000-8000-000000000002", serialNumber: "BLU-002",
    model: "Middleweight", weightLimit: 300, batteryCapacity: 80, state: "IDLE",
  },
  {
    id: "00000000-0000-4000-8000-000000000003", serialNumber: "BLU-003",
    model: "Cruiserweight", weightLimit: 400, batteryCapacity: 50, state: "IDLE",
  },
  {
    id: "00000000-0000-4000-8000-000000000004", serialNumber: "BLU-004",
    model: "Heavyweight", weightLimit: 500, batteryCapacity: 25, state: "IDLE",
  },
  {
    id: "00000000-0000-4000-8000-000000000005", serialNumber: "BLU-005",
    model: "Lightweight", weightLimit: 200, batteryCapacity: 24, state: "IDLE",
  },
  {
    id: "00000000-0000-4000-8000-000000000006", serialNumber: "BLU-006",
    model: "Middleweight", weightLimit: 300, batteryCapacity: 10, state: "IDLE",
  },
  {
    id: "00000000-0000-4000-8000-000000000007", serialNumber: "BLU-007",
    model: "Cruiserweight", weightLimit: 400, batteryCapacity: 60, state: "IDLE",
  },
  {
    id: "00000000-0000-4000-8000-000000000008", serialNumber: "BLU-008",
    model: "Heavyweight", weightLimit: 500, batteryCapacity: 90, state: "IDLE",
  },
  {
    id: "00000000-0000-4000-8000-000000000009", serialNumber: "BLU-009",
    model: "Lightweight", weightLimit: 200, batteryCapacity: 40, state: "IDLE",
  },
  {
    id: "00000000-0000-4000-8000-000000000010", serialNumber: "BLU-010",
    model: "Middleweight", weightLimit: 300, batteryCapacity: 75, state: "IDLE",
  },
];

const medications = [
  {
    id: "00000000-0000-4000-9000-000000000001", name: "Paracetamol_500", weight: 50, code: "PARA_500",
    image: "https://example.com/medications/paracetamol.png",
  },
  {
    id: "00000000-0000-4000-9000-000000000002", name: "Amoxicillin-250", weight: 100, code: "AMOX_250",
    image: "https://example.com/medications/amoxicillin.png",
  },
  {
    id: "00000000-0000-4000-9000-000000000003", name: "Vitamin_C", weight: 75, code: "VIT_C",
    image: "https://example.com/medications/vitamin-c.png",
  },
];

export const seedDatabase = async (database: DataSource): Promise<void> => {
  await database.transaction(async (manager) => {
    await manager.createQueryBuilder().insert().into(droneSchema).values(drones).orIgnore().execute();
    await manager.createQueryBuilder().insert().into(medicationSchema).values(medications).orIgnore().execute();
  });
};
