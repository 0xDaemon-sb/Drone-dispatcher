import { EntitySchema } from "typeorm";

import type { Drone } from "./drone.js";

export interface Medication {
  id: string;
  name: string;
  weight: number;
  code: string;
  image: string;
  droneId: string | null;
  drone?: Drone;
  createdAt: Date;
}

export const medicationSchema = new EntitySchema<Medication>({
  name: "Medication",
  tableName: "medications",
  columns: {
    id: { type: "uuid", primary: true, generated: "uuid" },
    name: { type: "text" },
    weight: { type: "integer" },
    code: { type: "text" },
    image: { type: "text" },
    droneId: { name: "drone_id", type: "uuid", nullable: true },
    createdAt: { name: "created_at", type: "timestamptz", createDate: true },
  },
  relations: {
    drone: {
      type: "many-to-one",
      target: "Drone",
      joinColumn: { name: "drone_id", foreignKeyConstraintName: "FK_medications_drone" },
      nullable: true,
      onDelete: "RESTRICT",
    },
  },
  indices: [{ name: "IDX_medications_drone_id", columns: ["droneId"] }],
  checks: [
    { name: "CHK_medications_name", expression: '"name" ~ \'^[A-Za-z0-9_-]+$\'' },
    { name: "CHK_medications_code", expression: '"code" ~ \'^[A-Z0-9_]+$\'' },
    { name: "CHK_medications_weight", expression: '"weight" > 0' },
    { name: "CHK_medications_image", expression: 'length(btrim("image")) > 0' },
  ],
});
