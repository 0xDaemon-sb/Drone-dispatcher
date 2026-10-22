import { logger } from "../lib/logger.js";

export const startBatteryAuditTask = (record: () => Promise<void>, intervalMs: number) => {
  let running: Promise<void> | undefined;

  const run = async () => {
    try {
      await record();
    } catch (error) {
      logger.error({ err: error }, "Battery audit failed");
    }
  };

  const timer = setInterval(() => {
    if (running) return;
    running = run().finally(() => { running = undefined; });
  }, intervalMs);
  timer.unref();

  return {
    async stop() {
      clearInterval(timer);
      await running;
    },
  };
};
