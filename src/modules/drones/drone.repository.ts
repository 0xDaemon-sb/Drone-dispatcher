import { QueryFailedError, type EntityManager } from "typeorm";

import { droneSchema, type Drone, type DroneState } from "../../database/entities/drone.js";
import { medicationSchema } from "../../database/entities/medication.js";

type NewDrone = Pick<Drone, "serialNumber" | "model" | "weightLimit" | "batteryCapacity" | "state">;

export const isDuplicateSerialNumberError = (error: unknown) =>
  error instanceof QueryFailedError &&
  "code" in error.driverError && error.driverError.code === "23505" &&
  "constraint" in error.driverError && error.driverError.constraint === "UQ_drones_serial_number";

export const createDroneRepository = (manager: EntityManager) => {
  const drones = manager.getRepository(droneSchema);

  return {
    create(input: NewDrone) {
      return drones.save(input);
    },

    findBySerialNumber(serialNumber: string) {
      return drones.findOneBy({ serialNumber });
    },

    findBySerialNumberForUpdate(serialNumber: string) {
      return drones.findOne({ where: { serialNumber }, lock: { mode: "pessimistic_write" } });
    },

    updateState(id: string, state: DroneState) {
      return drones.update(id, { state });
    },

    findAvailable(states: DroneState[], minimumBatteryCapacity: number) {
      return drones.createQueryBuilder("drone")
        .where("drone.state IN (:...states)", { states })
        .andWhere("drone.batteryCapacity >= :minimumBattery", { minimumBattery: minimumBatteryCapacity })
        .andWhere((query) => {
          // Compare the drone's limit with the sum of its currently assigned items.
          const loadedWeight = query.subQuery()
            .select("COALESCE(SUM(medication.weight), 0)")
            .from(medicationSchema, "medication")
            .where("medication.droneId = drone.id")
            .getQuery();
          return `${loadedWeight} < drone.weightLimit`;
        })
        .orderBy("drone.serialNumber", "ASC")
        .getMany();
    },
  };
};
