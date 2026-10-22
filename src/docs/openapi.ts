import { z } from "zod";

import { droneStates } from "../database/entities/drone.js";
import { MINIMUM_BATTERY_CAPACITY } from "../modules/drones/drone.constants.js";
import {
  batteryAuditQuerySchema,
  droneParamsSchema,
  loadMedicationsSchema,
  medicationInputSchema,
  registerDroneSchema,
} from "../modules/drones/drone.schemas.js";

const toSchema = (schema: z.ZodType) => z.toJSONSchema(schema, { target: "openapi-3.0" });
const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const arrayOf = (name: string) => ({ type: "array", items: ref(name) });
const errorRef = (name: string) => ({ $ref: `#/components/responses/${name}` });
const serialParameter = { $ref: "#/components/parameters/SerialNumber" };

const jsonResponse = (description: string, schema: Record<string, unknown>, example?: unknown) => ({
  description,
  headers: {
    "x-request-id": { description: "Correlation ID for this request and its logs.", schema: { type: "string" } },
  },
  content: { "application/json": { schema, ...(example === undefined ? {} : { example }) } },
});

const errorResponse = (description: string, code: string, message: string) =>
  jsonResponse(description, ref("Error"), { error: { code, message } });

const droneExample = {
  id: "00000000-0000-4000-8000-000000000001",
  serialNumber: "BLU-001", model: "Lightweight", weightLimit: 200,
  batteryCapacity: 100, state: "IDLE",
  createdAt: "2026-10-22T10:00:00.000Z", updatedAt: "2026-10-22T10:00:00.000Z",
};
const medicationExample = {
  name: "Paracetamol_500", weight: 50, code: "PARA_500",
  image: "https://example.com/medications/paracetamol.png",
};
const loadedExample = {
  ...medicationExample, id: "00000000-0000-4000-9000-000000000001",
  droneId: droneExample.id, createdAt: "2026-10-22T10:00:00.000Z",
};

const loadingConflictDetailsSchema = z.strictObject({
  serialNumber: droneParamsSchema.shape.serialNumber,
  state: z.enum(droneStates),
  allowedStates: z.array(z.enum(droneStates)),
  batteryCapacity: registerDroneSchema.shape.batteryCapacity,
  minimumBatteryCapacity: z.literal(MINIMUM_BATTERY_CAPACITY),
  weightLimit: registerDroneSchema.shape.weightLimit,
  loadedWeight: z.number().int().min(0).describe("Current payload in grams."),
  remainingCapacity: z.number().int().min(0).describe("Remaining payload capacity in grams, clamped to zero."),
  requestedWeight: z.number().int().positive().describe("Total requested batch weight in grams."),
});
const loadingConflictDetailsExample = {
  serialNumber: "BLU-001", state: "LOADED", allowedStates: ["IDLE", "LOADING", "LOADED"],
  batteryCapacity: 100, minimumBatteryCapacity: MINIMUM_BATTERY_CAPACITY,
  weightLimit: 200, loadedWeight: 150, remainingCapacity: 50, requestedWeight: 100,
};

export const openApiDocument = {
  openapi: "3.0.3",
  info: {
    title: "Blusalt Dispatch Controller",
    version: "0.1.0",
    description: "Manage medication delivery drones. All API inputs and outputs are JSON. Weights are integer grams and battery levels are integer percentages. No authentication is required for this challenge. Image URLs are stored without fetching files; example.com images are illustrative placeholders. The periodic audit task snapshots stored battery readings without simulating hardware or battery drain.",
  },
  servers: [{ url: "/", description: "Current server" }],
  tags: [
    { name: "Drones", description: "Registration and current fleet information" },
    { name: "Medications", description: "Transactional loading and current payload" },
    { name: "Battery audits", description: "Historical battery snapshots" },
    { name: "Health", description: "Service liveness" },
  ],
  components: {
    schemas: {
      RegisterDrone: toSchema(registerDroneSchema),
      LoadMedications: toSchema(loadMedicationsSchema),
      Drone: toSchema(registerDroneSchema.extend({
        id: z.uuid(), state: z.enum(droneStates),
        createdAt: z.iso.datetime(), updatedAt: z.iso.datetime(),
      })),
      Medication: toSchema(medicationInputSchema.extend({
        id: z.uuid(), droneId: z.uuid(), createdAt: z.iso.datetime(),
      })),
      Battery: toSchema(registerDroneSchema.pick({ serialNumber: true, batteryCapacity: true })),
      BatteryAudit: toSchema(z.strictObject({
        id: z.uuid(), droneId: z.uuid(),
        batteryCapacity: registerDroneSchema.shape.batteryCapacity,
        state: z.enum(droneStates), checkedAt: z.iso.datetime(),
      })),
      Error: toSchema(z.strictObject({
        error: z.strictObject({
          code: z.string(), message: z.string(),
          details: z.union([z.array(z.unknown()), z.record(z.string(), z.unknown())]).optional(),
        }),
      })),
      LoadingConflictDetails: toSchema(loadingConflictDetailsSchema),
      LoadingConflict: toSchema(z.strictObject({
        error: z.strictObject({
          code: z.enum(["DRONE_NOT_LOADABLE", "INSUFFICIENT_BATTERY", "WEIGHT_LIMIT_EXCEEDED"]),
          message: z.string(), details: loadingConflictDetailsSchema,
        }),
      })),
      Health: toSchema(z.strictObject({ status: z.literal("ok") })),
    },
    parameters: {
      SerialNumber: {
        name: "serialNumber", in: "path", required: true,
        description: "Case-sensitive serial number. Leading and trailing whitespace is trimmed.",
        schema: toSchema(droneParamsSchema.shape.serialNumber), example: "BLU-001",
      },
    },
    responses: {
      InvalidRequest: errorResponse("Invalid input (VALIDATION_ERROR with details), or malformed JSON (INVALID_JSON).", "VALIDATION_ERROR", "The request is invalid."),
      DroneNotFound: errorResponse("No drone has this serial number.", "DRONE_NOT_FOUND", "Drone not found."),
      InternalError: errorResponse("Unexpected server failure. Failed loading batches are rolled back.", "INTERNAL_SERVER_ERROR", "An unexpected error occurred."),
      DuplicateDrone: errorResponse("Serial numbers are unique, including during concurrent registrations.", "DRONE_ALREADY_EXISTS", "A drone with this serial number already exists."),
      LoadingConflict: {
        ...jsonResponse(`DRONE_NOT_LOADABLE: state is ineligible; INSUFFICIENT_BATTERY: battery is below ${MINIMUM_BATTERY_CAPACITY}%; WEIGHT_LIMIT_EXCEEDED: existing payload plus batch exceeds capacity. Details describe the drone and batch while holding the row lock; they may change after the response. Weights are grams, battery values are percentages. Nothing is added on failure.`, ref("LoadingConflict")),
        content: {
          "application/json": {
            schema: ref("LoadingConflict"),
            examples: {
              state: { value: { error: {
                code: "DRONE_NOT_LOADABLE", message: "The drone cannot be loaded in its current state.",
                details: { ...loadingConflictDetailsExample, state: "DELIVERING" },
              } } },
              battery: { value: { error: {
                code: "INSUFFICIENT_BATTERY", message: `The drone needs at least ${MINIMUM_BATTERY_CAPACITY}% battery to load medications.`,
                details: { ...loadingConflictDetailsExample, batteryCapacity: MINIMUM_BATTERY_CAPACITY - 1 },
              } } },
              weight: { value: { error: {
                code: "WEIGHT_LIMIT_EXCEEDED", message: "The medication batch exceeds the drone's remaining capacity.",
                details: loadingConflictDetailsExample,
              } } },
            },
          },
        },
      },
    },
  },
  paths: {
    "/health": {
      get: {
        tags: ["Health"], operationId: "getHealth", summary: "Check process liveness",
        description: "Reports that HTTP is serving requests. This does not continuously probe database readiness.",
        responses: { "200": jsonResponse("Service is running.", ref("Health"), { status: "ok" }) },
      },
    },
    "/api/v1/drones": {
      post: {
        tags: ["Drones"], operationId: "registerDrone", summary: "Register a drone",
        description: "Creates an IDLE drone. All four fields are required; state, id, and other extra fields are rejected. The ten seeded drones are not a registration cap.",
        requestBody: {
          required: true,
          content: { "application/json": { schema: ref("RegisterDrone"), example: { serialNumber: "CUSTOM-001", model: "Lightweight", weightLimit: 200, batteryCapacity: 100 } } },
        },
        responses: {
          "201": jsonResponse("Drone registered.", ref("Drone"), { ...droneExample, serialNumber: "CUSTOM-001" }),
          "400": errorRef("InvalidRequest"), "409": errorRef("DuplicateDrone"), "500": errorRef("InternalError"),
        },
      },
    },
    "/api/v1/drones/available": {
      get: {
        tags: ["Drones"], operationId: "getAvailableDrones", summary: "Find drones available for loading",
        description: `Returns IDLE, LOADING, or LOADED drones with battery at least ${MINIMUM_BATTERY_CAPACITY}% and remaining payload capacity. Sorted by serial number. This query does not reserve capacity; loading checks again under a row lock.`,
        responses: { "200": jsonResponse("Eligible drones, or an empty array.", arrayOf("Drone"), [droneExample]), "500": errorRef("InternalError") },
      },
    },
    "/api/v1/drones/{serialNumber}/battery": {
      parameters: [serialParameter],
      get: {
        tags: ["Drones"], operationId: "getDroneBattery", summary: "Read the current battery level",
        responses: {
          "200": jsonResponse("Current stored battery percentage.", ref("Battery"), { serialNumber: "BLU-001", batteryCapacity: 100 }),
          "400": errorRef("InvalidRequest"), "404": errorRef("DroneNotFound"), "500": errorRef("InternalError"),
        },
      },
    },
    "/api/v1/drones/{serialNumber}/medications": {
      parameters: [serialParameter],
      get: {
        tags: ["Medications"], operationId: "getLoadedMedications", summary: "List the current payload",
        description: "Returns all items assigned to this drone, oldest first. A registered empty drone returns an empty array.",
        responses: {
          "200": jsonResponse("Loaded items.", arrayOf("Medication"), [loadedExample]),
          "400": errorRef("InvalidRequest"), "404": errorRef("DroneNotFound"), "500": errorRef("InternalError"),
        },
      },
      post: {
        tags: ["Medications"], operationId: "loadMedications", summary: "Load a medication batch atomically",
        description: `Requires a non-empty batch, state IDLE/LOADING/LOADED, and battery at least ${MINIMUM_BATTERY_CAPACITY}%. Existing payload plus the entire batch must fit; exact capacity is accepted. The transaction locks the drone, inserts the whole batch, and sets LOADED. Each item is one package; codes may repeat. Additional item/body fields are rejected. Retries create new packages; this operation is not idempotent.`,
        requestBody: {
          required: true,
          content: { "application/json": { schema: ref("LoadMedications"), example: { medications: [medicationExample] } } },
        },
        responses: {
          "201": jsonResponse("Only the newly loaded items. GET this path to see the entire payload.", arrayOf("Medication"), [loadedExample]),
          "400": errorRef("InvalidRequest"), "404": errorRef("DroneNotFound"), "409": errorRef("LoadingConflict"), "500": errorRef("InternalError"),
        },
      },
    },
    "/api/v1/drones/{serialNumber}/battery-audits": {
      parameters: [serialParameter],
      get: {
        tags: ["Battery audits"], operationId: "getBatteryAudits", summary: "Read paginated battery history",
        description: "Newest checkedAt first, then id descending for ties. An existing drone without history returns an empty array. Audit interval defaults to one minute; the first snapshot runs after one interval. Unknown query parameters are rejected.",
        parameters: [
          { name: "limit", in: "query", required: false, schema: toSchema(batteryAuditQuerySchema.shape.limit), description: "Maximum records per page." },
          { name: "offset", in: "query", required: false, schema: toSchema(batteryAuditQuerySchema.shape.offset), description: "Records to skip." },
        ],
        responses: {
          "200": jsonResponse("A page of audit snapshots.", arrayOf("BatteryAudit"), [{ id: "00000000-0000-4000-a000-000000000001", droneId: droneExample.id, batteryCapacity: 100, state: "IDLE", checkedAt: "2026-10-22T10:00:00.000Z" }]),
          "400": errorRef("InvalidRequest"), "404": errorRef("DroneNotFound"), "500": errorRef("InternalError"),
        },
      },
    },
  },
};
