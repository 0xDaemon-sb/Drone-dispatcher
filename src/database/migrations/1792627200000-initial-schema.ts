import type { MigrationInterface, QueryRunner } from "typeorm";

export class InitialSchema1792627200000 implements MigrationInterface {
  name = "InitialSchema1792627200000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "drone_model" AS ENUM ('Lightweight', 'Middleweight', 'Cruiserweight', 'Heavyweight');
      CREATE TYPE "drone_state" AS ENUM ('IDLE', 'LOADING', 'LOADED', 'DELIVERING', 'DELIVERED', 'RETURNING');

      CREATE TABLE "drones" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "serial_number" varchar(100) NOT NULL,
        "model" drone_model NOT NULL,
        "weight_limit" integer NOT NULL,
        "battery_capacity" integer NOT NULL,
        "state" drone_state NOT NULL DEFAULT 'IDLE',
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_drones_serial_number" UNIQUE ("serial_number"),
        CONSTRAINT "CHK_drones_serial_number" CHECK (length(btrim("serial_number")) > 0),
        CONSTRAINT "CHK_drones_weight_limit" CHECK ("weight_limit" > 0 AND "weight_limit" <= 500),
        CONSTRAINT "CHK_drones_battery_capacity" CHECK ("battery_capacity" BETWEEN 0 AND 100),
        CONSTRAINT "CHK_drones_loading_battery" CHECK ("state" != 'LOADING' OR "battery_capacity" >= 25)
      );

      CREATE TABLE "medications" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "name" text NOT NULL,
        "weight" integer NOT NULL,
        "code" text NOT NULL,
        "image" text NOT NULL,
        "drone_id" uuid,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "FK_medications_drone" FOREIGN KEY ("drone_id") REFERENCES "drones"("id") ON DELETE RESTRICT,
        CONSTRAINT "CHK_medications_name" CHECK ("name" ~ '^[A-Za-z0-9_-]+$'),
        CONSTRAINT "CHK_medications_code" CHECK ("code" ~ '^[A-Z0-9_]+$'),
        CONSTRAINT "CHK_medications_weight" CHECK ("weight" > 0),
        CONSTRAINT "CHK_medications_image" CHECK (length(btrim("image")) > 0)
      );
      CREATE INDEX "IDX_medications_drone_id" ON "medications" ("drone_id");

      CREATE TABLE "battery_audits" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "drone_id" uuid NOT NULL,
        "battery_capacity" integer NOT NULL,
        "state" drone_state NOT NULL,
        "checked_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "FK_battery_audits_drone" FOREIGN KEY ("drone_id") REFERENCES "drones"("id") ON DELETE RESTRICT,
        CONSTRAINT "CHK_battery_audits_capacity" CHECK ("battery_capacity" BETWEEN 0 AND 100)
      );
      CREATE INDEX "IDX_battery_audits_drone_checked_at" ON "battery_audits" ("drone_id", "checked_at");
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE "battery_audits";
      DROP TABLE "medications";
      DROP TABLE "drones";
      DROP TYPE "drone_state";
      DROP TYPE "drone_model";
    `);
  }
}
