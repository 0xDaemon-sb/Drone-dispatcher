import type { DataSource } from "typeorm";

import { droneModels, droneSchema } from "./entities/drone.js";
import { medicationSchema } from "./entities/medication.js";

// Stable IDs let this command add missing fixtures without overwriting existing data.
export const seedDatabase = async (database: DataSource): Promise<void> => {
  await database.transaction(async (manager) => {
    const drones = Array.from({ length: 10 }, (_, index) => ({
      id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
      serialNumber: `BLU-${String(index + 1).padStart(3, "0")}`,
      model: droneModels[index % droneModels.length]!,
      weightLimit: [200, 300, 400, 500][index % 4]!,
      batteryCapacity: [100, 80, 50, 25, 24, 10, 60, 90, 40, 75][index]!,
      state: "IDLE" as const,
    }));

    await manager.createQueryBuilder().insert().into(droneSchema).values(drones).orIgnore().execute();
    const image = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=";
    await manager.createQueryBuilder().insert().into(medicationSchema).values([
      { id: "00000000-0000-4000-9000-000000000001", name: "Paracetamol_500", weight: 50, code: "PARA_500", image },
      { id: "00000000-0000-4000-9000-000000000002", name: "Amoxicillin-250", weight: 100, code: "AMOX_250", image },
      { id: "00000000-0000-4000-9000-000000000003", name: "Vitamin_C", weight: 75, code: "VIT_C", image },
    ]).orIgnore().execute();
  });
};
