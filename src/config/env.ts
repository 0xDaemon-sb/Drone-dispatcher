import "dotenv/config";

import { z } from "zod";

const environmentSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3_000),
  BATTERY_AUDIT_INTERVAL_MS: z.coerce.number().int().min(1_000).max(2_147_483_647).default(60_000),
  DATABASE_URL: z
    .url({ protocol: /^postgres(ql)?$/ })
    .default("postgresql://blusalt:blusalt@localhost:5432/blusalt"),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),
});

const result = environmentSchema.safeParse(process.env);

if (!result.success) {
  throw new Error(`Invalid environment configuration: ${z.prettifyError(result.error)}`);
}

export const env = result.data;
