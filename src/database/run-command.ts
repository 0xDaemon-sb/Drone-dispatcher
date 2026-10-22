import type { DataSource } from "typeorm";

import { logger } from "../lib/logger.js";
import { dataSource } from "./data-source.js";

export const runDatabaseCommand = async (command: (database: DataSource) => Promise<void>): Promise<void> => {
  try {
    await dataSource.initialize();
    await command(dataSource);
  } catch (error) {
    logger.error({ err: error }, "Database command failed");
    process.exitCode = 1;
  } finally {
    if (dataSource.isInitialized) {
      await dataSource.destroy();
    }
  }
};
