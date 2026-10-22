import { QueryFailedError, type DataSource } from "typeorm";

import { droneSchema } from "../../database/entities/drone.js";
import { medicationSchema } from "../../database/entities/medication.js";
import { HttpError } from "../../lib/http-error.js";
import type { RegisterDroneInput } from "./drone.schemas.js";

export const createDroneService = (database: DataSource) => {
  const drones = database.getRepository(droneSchema);
  const medications = database.getRepository(medicationSchema);

  const findDrone = async (serialNumber: string) => {
    const drone = await drones.findOneBy({ serialNumber });
    if (!drone) throw new HttpError(404, "DRONE_NOT_FOUND", "Drone not found.");
    return drone;
  };

  return {
    async register(input: RegisterDroneInput) {
      try {
        return await drones.save({ ...input, state: "IDLE" });
      } catch (error) {
        if (
          error instanceof QueryFailedError &&
          "code" in error.driverError && error.driverError.code === "23505" &&
          "constraint" in error.driverError && error.driverError.constraint === "UQ_drones_serial_number"
        ) {
          throw new HttpError(409, "DRONE_ALREADY_EXISTS", "A drone with this serial number already exists.");
        }
        throw error;
      }
    },

    async getBattery(serialNumber: string) {
      const drone = await findDrone(serialNumber);
      return { serialNumber: drone.serialNumber, batteryCapacity: drone.batteryCapacity };
    },

    async getMedications(serialNumber: string) {
      const drone = await findDrone(serialNumber);
      return medications.find({ where: { droneId: drone.id }, order: { createdAt: "ASC", id: "ASC" } });
    },

    async getAvailable() {
      return drones.createQueryBuilder("drone")
        .where("drone.state IN (:...states)", { states: ["IDLE", "LOADING", "LOADED"] })
        .andWhere("drone.batteryCapacity >= :minimumBattery", { minimumBattery: 25 })
        .andWhere((query) => {
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

export type DroneService = ReturnType<typeof createDroneService>;
