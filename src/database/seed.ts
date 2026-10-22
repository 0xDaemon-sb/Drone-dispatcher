import { logger } from "../lib/logger.js";
import { runDatabaseCommand } from "./run-command.js";
import { seedDatabase } from "./seed-data.js";

void runDatabaseCommand(async (database) => {
  if (await database.showMigrations()) {
    throw new Error("Run database migrations before seeding.");
  }
  await seedDatabase(database);
  logger.info("Database seed complete");
});
