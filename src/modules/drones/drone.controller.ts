import type { Request, Response } from "express";

import { droneParamsSchema, loadMedicationsSchema, registerDroneSchema } from "./drone.schemas.js";
import type { DroneService } from "./drone.service.js";

export const createDroneController = (service: DroneService) => ({
  async register(request: Request, response: Response) {
    const input = registerDroneSchema.parse(request.body);
    const drone = await service.register(input);
    response.status(201).json(drone);
  },

  async getBattery(request: Request, response: Response) {
    const { serialNumber } = droneParamsSchema.parse(request.params);
    response.json(await service.getBattery(serialNumber));
  },

  async getMedications(request: Request, response: Response) {
    const { serialNumber } = droneParamsSchema.parse(request.params);
    response.json(await service.getMedications(serialNumber));
  },

  async loadMedications(request: Request, response: Response) {
    const { serialNumber } = droneParamsSchema.parse(request.params);
    const { medications } = loadMedicationsSchema.parse(request.body);
    const loaded = await service.loadMedications(serialNumber, medications);
    response.status(201).json(loaded);
  },

  async getAvailable(_request: Request, response: Response) {
    response.json(await service.getAvailable());
  },
});
