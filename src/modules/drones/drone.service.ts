import { QueryFailedError, type DataSource } from "typeorm";

import { batteryAuditSchema } from "../../database/entities/battery-audit.js";
import { droneSchema, type DroneState } from "../../database/entities/drone.js";
import { medicationSchema } from "../../database/entities/medication.js";
import { HttpError } from "../../lib/http-error.js";
import type { BatteryAuditQuery, MedicationInput, RegisterDroneInput } from "./drone.schemas.js";

const loadableStates: DroneState[] = ["IDLE", "LOADING", "LOADED"];
const minimumBatteryCapacity = 25;

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

    async getBatteryAudits(serialNumber: string, query: BatteryAuditQuery) {
      const drone = await findDrone(serialNumber);
      return database.getRepository(batteryAuditSchema).find({
        where: { droneId: drone.id },
        order: { checkedAt: "DESC", id: "DESC" },
        take: query.limit,
        skip: query.offset,
      });
    },

    async getMedications(serialNumber: string) {
      const drone = await findDrone(serialNumber);
      return medications.find({ where: { droneId: drone.id }, order: { createdAt: "ASC", id: "ASC" } });
    },

    async loadMedications(serialNumber: string, items: MedicationInput[]) {
      return database.transaction("READ COMMITTED", async (manager) => {
        const transactionDrones = manager.getRepository(droneSchema);
        const transactionMedications = manager.getRepository(medicationSchema);

        // Serialize loads for this drone before reading its current payload.
        const drone = await transactionDrones.findOne({
          where: { serialNumber },
          lock: { mode: "pessimistic_write" },
        });
        if (!drone) throw new HttpError(404, "DRONE_NOT_FOUND", "Drone not found.");

        const loadedWeight = await transactionMedications.sum("weight", { droneId: drone.id }) ?? 0;
        const incomingWeight = items.reduce((total, item) => total + item.weight, 0);
        const details = {
          serialNumber: drone.serialNumber,
          state: drone.state,
          allowedStates: loadableStates,
          batteryCapacity: drone.batteryCapacity,
          minimumBatteryCapacity,
          weightLimit: drone.weightLimit,
          loadedWeight,
          remainingCapacity: Math.max(0, drone.weightLimit - loadedWeight),
          requestedWeight: incomingWeight,
        };

        if (!loadableStates.includes(drone.state)) {
          throw new HttpError(409, "DRONE_NOT_LOADABLE", "The drone cannot be loaded in its current state.", details);
        }
        if (drone.batteryCapacity < minimumBatteryCapacity) {
          throw new HttpError(409, "INSUFFICIENT_BATTERY", "The drone needs at least 25% battery to load medications.", details);
        }

        if (loadedWeight + incomingWeight > drone.weightLimit) {
          throw new HttpError(409, "WEIGHT_LIMIT_EXCEEDED", "The medication batch exceeds the drone's remaining capacity.", details);
        }

        const loaded = await transactionMedications.save(items.map((item) => ({ ...item, droneId: drone.id })));
        await transactionDrones.update(drone.id, { state: "LOADED" });
        return loaded;
      });
    },

    async getAvailable() {
      return drones.createQueryBuilder("drone")
        .where("drone.state IN (:...states)", { states: loadableStates })
        .andWhere("drone.batteryCapacity >= :minimumBattery", { minimumBattery: minimumBatteryCapacity })
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
