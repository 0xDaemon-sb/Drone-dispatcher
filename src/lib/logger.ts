import pino from "pino";

import { env } from "../config/env.js";

export const logger = pino({
  enabled: env.NODE_ENV !== "test",
  level: env.LOG_LEVEL,
  redact: {
    paths: ["req.headers.authorization", "req.headers.cookie"],
    censor: "[REDACTED]",
  },
});
