import { afterEach, describe, expect, it } from "vitest";
import { getEnv, resetEnvForTests } from "@/src/config/env";

describe("getEnv", () => {
  const originalDailyTarget = process.env.DAILY_TARGET;
  const originalApiBase = process.env.JUNGLEGRID_API_BASE;

  afterEach(() => {
    if (originalDailyTarget === undefined) {
      delete process.env.DAILY_TARGET;
    } else {
      process.env.DAILY_TARGET = originalDailyTarget;
    }

    if (originalApiBase === undefined) {
      delete process.env.JUNGLEGRID_API_BASE;
    } else {
      process.env.JUNGLEGRID_API_BASE = originalApiBase;
    }

    resetEnvForTests();
  });

  it("clamps oversized numeric env values to supported limits", () => {
    process.env.DAILY_TARGET = "500";

    expect(getEnv().DAILY_TARGET).toBe(100);
  });

  it("throws a plain error for invalid non-numeric env values", () => {
    process.env.JUNGLEGRID_API_BASE = "not-a-url";

    expect(() => getEnv()).toThrowError(/Invalid environment configuration/);
  });
});
