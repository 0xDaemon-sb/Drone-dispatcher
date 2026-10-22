import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";

import { startBatteryAuditTask } from "../src/jobs/battery-audit.task.js";
import { logger } from "../src/lib/logger.js";

describe("Battery audit task", () => {
  beforeEach(() => { jest.useFakeTimers(); });
  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it("waits for the configured interval and repeats without success logs", async () => {
    const record = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const log = jest.spyOn(logger, "info");
    const task = startBatteryAuditTask(record, 1_000);
    expect(record).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(999);
    expect(record).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(1);
    expect(record).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(1_000);
    expect(record).toHaveBeenCalledTimes(2);
    expect(log).not.toHaveBeenCalled();
    await task.stop();
  });

  it("skips overlapping ticks and resumes once the active run completes", async () => {
    let finish = () => {};
    const pending = new Promise<void>((resolve) => { finish = resolve; });
    const record = jest.fn<() => Promise<void>>()
      .mockReturnValueOnce(pending).mockResolvedValue(undefined);
    const task = startBatteryAuditTask(record, 1_000);
    await jest.advanceTimersByTimeAsync(5_000);
    expect(record).toHaveBeenCalledTimes(1);
    finish();
    await jest.advanceTimersByTimeAsync(1_000);
    expect(record).toHaveBeenCalledTimes(2);
    await task.stop();
  });

  it("logs a failed run and retries on the next interval", async () => {
    const error = new Error("Database unavailable");
    const record = jest.fn<() => Promise<void>>()
      .mockRejectedValueOnce(error).mockResolvedValue(undefined);
    const log = jest.spyOn(logger, "error");
    const task = startBatteryAuditTask(record, 1_000);
    await jest.advanceTimersByTimeAsync(2_000);
    expect(record).toHaveBeenCalledTimes(2);
    expect(log).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith({ err: error }, "Battery audit failed");
    await task.stop();
  });

  it("also handles synchronous failures without leaving the task stuck", async () => {
    const error = new Error("Unexpected failure");
    const record = jest.fn<() => Promise<void>>()
      .mockImplementationOnce(() => { throw error; }).mockResolvedValue(undefined);
    const log = jest.spyOn(logger, "error");
    const task = startBatteryAuditTask(record, 1_000);
    await jest.advanceTimersByTimeAsync(2_000);
    expect(record).toHaveBeenCalledTimes(2);
    expect(log).toHaveBeenCalledWith({ err: error }, "Battery audit failed");
    await task.stop();
  });

  it("cancels future runs when stopped, including repeated stop calls", async () => {
    const record = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const task = startBatteryAuditTask(record, 1_000);
    await task.stop();
    await task.stop();
    await jest.advanceTimersByTimeAsync(5_000);
    expect(record).not.toHaveBeenCalled();
  });

  it("waits for an in-flight audit and schedules no more runs during shutdown", async () => {
    let finish = () => {};
    const pending = new Promise<void>((resolve) => { finish = resolve; });
    const record = jest.fn<() => Promise<void>>().mockReturnValue(pending);
    const task = startBatteryAuditTask(record, 1_000);
    await jest.advanceTimersByTimeAsync(1_000);
    let stopped = false;
    const stop = task.stop().then(() => { stopped = true; });
    await jest.advanceTimersByTimeAsync(5_000);
    expect(stopped).toBe(false);
    expect(record).toHaveBeenCalledTimes(1);
    finish();
    await stop;
    expect(stopped).toBe(true);
  });
});
