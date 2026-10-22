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

const medicationInputSchema = z.strictObject({
  name: z.string().regex(/^[A-Za-z0-9_-]+$/),
  weight: z.number().int().positive(),
  code: z.string().regex(/^[A-Z0-9_]+$/),
  image: z.url({ protocol: /^https?$/ }),
});

export const loadMedicationsSchema = z.strictObject({
  medications: z.array(medicationInputSchema).min(1),
});

export type RegisterDroneInput = z.infer<typeof registerDroneSchema>;
export type MedicationInput = z.infer<typeof medicationInputSchema>;
