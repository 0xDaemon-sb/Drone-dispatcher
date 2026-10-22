import { Router } from "express";
import type { DataSource } from "typeorm";

import { createDroneController } from "./drone.controller.js";
import { createDroneService } from "./drone.service.js";

export const createDroneRouter = (database: DataSource) => {
  const router = Router();
  const controller = createDroneController(createDroneService(database));

  router.post("/", controller.register);
  router.get("/available", controller.getAvailable);
  router.get("/:serialNumber/battery", controller.getBattery);
  router.get("/:serialNumber/battery-audits", controller.getBatteryAudits);
  router.get("/:serialNumber/medications", controller.getMedications);
  router.post("/:serialNumber/medications", controller.loadMedications);

  return router;
};
