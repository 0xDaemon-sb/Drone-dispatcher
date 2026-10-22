import { logger } from "../lib/logger.js";
import { runDatabaseCommand } from "./run-command.js";

void runDatabaseCommand(async (database) => {
  const action = process.argv[2];
  if (action === "revert") {
    await database.undoLastMigration();
    logger.info("Last database migration reverted");
  } else if (action === undefined) {
    const migrations = await database.runMigrations();
    logger.info({ count: migrations.length }, "Database migrations complete");
  } else {
    throw new Error(`Unknown migration action: ${action}`);
  }
});
