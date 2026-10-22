import type { EntityManager } from "typeorm";

import { medicationSchema, type Medication } from "../../database/entities/medication.js";

type NewMedication = Pick<Medication, "name" | "weight" | "code" | "image">;

export const createMedicationRepository = (manager: EntityManager) => {
  const medications = manager.getRepository(medicationSchema);

  return {
    findByDroneId(droneId: string) {
      return medications.find({ where: { droneId }, order: { createdAt: "ASC", id: "ASC" } });
    },

    async getLoadedWeight(droneId: string) {
      return await medications.sum("weight", { droneId }) ?? 0;
    },

    createBatch(droneId: string, items: NewMedication[]) {
      return medications.save(items.map((item) => ({ ...item, droneId })));
    },
  };
};
