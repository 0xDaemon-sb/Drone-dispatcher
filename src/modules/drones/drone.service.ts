import type { DataSource } from "typeorm";

import type { DroneState } from "../../database/entities/drone.js";
import { HttpError } from "../../lib/http-error.js";
import { createBatteryAuditRepository } from "./battery-audit.repository.js";
import { createDroneRepository, isDuplicateSerialNumberError } from "./drone.repository.js";
import type { BatteryAuditQuery, MedicationInput, RegisterDroneInput } from "./drone.schemas.js";
import { createMedicationRepository } from "./medication.repository.js";

const loadableStates: DroneState[] = ["IDLE", "LOADING", "LOADED"];
const minimumBatteryCapacity = 25;

export const createDroneService = (database: DataSource) => {
  const drones = createDroneRepository(database.manager);
  const medications = createMedicationRepository(database.manager);
  const audits = createBatteryAuditRepository(database.manager);

  const findDrone = async (serialNumber: string) => {
    const drone = await drones.findBySerialNumber(serialNumber);
    if (!drone) throw new HttpError(404, "DRONE_NOT_FOUND", "Drone not found.");
    return drone;
  };

  return {
    async register(input: RegisterDroneInput) {
      try {
        return await drones.create({ ...input, state: "IDLE" });
      } catch (error) {
        if (isDuplicateSerialNumberError(error)) {
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
      return audits.findByDroneId(drone.id, query);
    },

    async getMedications(serialNumber: string) {
      const drone = await findDrone(serialNumber);
      return medications.findByDroneId(drone.id);
    },

    async loadMedications(serialNumber: string, items: MedicationInput[]) {
      return database.transaction("READ COMMITTED", async (manager) => {
        const transactionDrones = createDroneRepository(manager);
        const transactionMedications = createMedicationRepository(manager);

        // Serialize loads for this drone before reading its current payload.
        const drone = await transactionDrones.findBySerialNumberForUpdate(serialNumber);
        if (!drone) throw new HttpError(404, "DRONE_NOT_FOUND", "Drone not found.");

        const loadedWeight = await transactionMedications.getLoadedWeight(drone.id);
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

        const loaded = await transactionMedications.createBatch(drone.id, items);
        await transactionDrones.updateState(drone.id, "LOADED");
        return loaded;
      });
    },

    getAvailable() {
      return drones.findAvailable(loadableStates, minimumBatteryCapacity);
    },
  };
};

export type DroneService = ReturnType<typeof createDroneService>;
