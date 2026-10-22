import { z } from "zod";

import { droneModels } from "../../database/entities/drone.js";

const serialNumber = z.string().trim().min(1).max(100);

export const registerDroneSchema = z.strictObject({
  serialNumber,
  model: z.enum(droneModels),
  weightLimit: z.number().int().positive().max(500),
  batteryCapacity: z.number().int().min(0).max(100),
});

export const droneParamsSchema = z.object({ serialNumber });

export type RegisterDroneInput = z.infer<typeof registerDroneSchema>;
