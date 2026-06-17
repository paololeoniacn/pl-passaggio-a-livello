import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getRomeHour, getRomeMidnightMs, isActiveHour } from "./timezone";
import type { WorkerEnv } from "../types";

// Minimal WorkerEnv stub for timezone tests
function makeEnv(start: string, end: string): WorkerEnv {
  return {
    PL_STATE: {} as KVNamespace,
    TELEGRAM_CHAT_ID: "",
    TELEGRAM_TOKEN: "",
    ADMIN_CHAT_ID: "",
    NICHELINO_CODE: "",
    CANDIOLO_CODE: "",
    ACTIVE_HOURS_START: start,
    ACTIVE_HOURS_END: end,
    TRAIN_CATEGORIES: "REG,RV",
  };
}

describe("getRomeMidnightMs", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns a timestamp earlier than now", () => {
    // 2026-01-15 10:30:00 UTC = 11:30 Rome (UTC+1, winter)
    vi.setSystemTime(new Date("2026-01-15T10:30:00Z"));
    const midnight = getRomeMidnightMs();
    const now = Date.now();
    expect(midnight).toBeLessThanOrEqual(now);
  });

  it("midnight in winter (UTC+1): 2026-01-15 → 2026-01-14T23:00:00Z", () => {
    // Rome midnight on 2026-01-15 = UTC 2025-01-14T23:00:00Z
    vi.setSystemTime(new Date("2026-01-15T10:30:00Z"));
    const midnight = getRomeMidnightMs();
    const expected = new Date("2026-01-14T23:00:00Z").getTime();
    expect(midnight).toBe(expected);
  });

  it("midnight in summer (UTC+2): 2026-07-15 → 2026-07-14T22:00:00Z", () => {
    // Rome midnight on 2026-07-15 = UTC 2026-07-14T22:00:00Z
    vi.setSystemTime(new Date("2026-07-15T10:30:00Z"));
    const midnight = getRomeMidnightMs();
    const expected = new Date("2026-07-14T22:00:00Z").getTime();
    expect(midnight).toBe(expected);
  });

  it("is stable across the minute (same midnight for different times of day)", () => {
    vi.setSystemTime(new Date("2026-06-16T08:00:00Z")); // 10:00 Rome (UTC+2)
    const midnight1 = getRomeMidnightMs();

    vi.setSystemTime(new Date("2026-06-16T14:00:00Z")); // 16:00 Rome
    const midnight2 = getRomeMidnightMs();

    expect(midnight1).toBe(midnight2);
  });
});

describe("isActiveHour (default 7–21)", () => {
  const env = makeEnv("7", "21");

  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns false at 06:59 Rome (winter UTC+1)", () => {
    // 06:59 Rome = 05:59 UTC in winter
    vi.setSystemTime(new Date("2026-01-15T05:59:00Z"));
    expect(isActiveHour(env)).toBe(false);
  });

  it("returns true at 07:00 Rome (winter UTC+1)", () => {
    // 07:00 Rome = 06:00 UTC in winter
    vi.setSystemTime(new Date("2026-01-15T06:00:00Z"));
    expect(isActiveHour(env)).toBe(true);
  });

  it("returns true at 07:01 Rome", () => {
    vi.setSystemTime(new Date("2026-01-15T06:01:00Z"));
    expect(isActiveHour(env)).toBe(true);
  });

  it("returns true at 20:59 Rome (last minute active, winter)", () => {
    // 20:59 Rome = 19:59 UTC in winter
    vi.setSystemTime(new Date("2026-01-15T19:59:00Z"));
    expect(isActiveHour(env)).toBe(true);
  });

  it("returns false at 21:00 Rome (window is [start, end), winter)", () => {
    // 21:00 Rome = 20:00 UTC in winter
    vi.setSystemTime(new Date("2026-01-15T20:00:00Z"));
    expect(isActiveHour(env)).toBe(false);
  });

  it("returns true at 07:00 Rome (summer UTC+2)", () => {
    // 07:00 Rome = 05:00 UTC in summer
    vi.setSystemTime(new Date("2026-07-15T05:00:00Z"));
    expect(isActiveHour(env)).toBe(true);
  });

  it("returns false at 06:59 Rome (summer UTC+2)", () => {
    // 06:59 Rome = 04:59 UTC in summer
    vi.setSystemTime(new Date("2026-07-15T04:59:00Z"));
    expect(isActiveHour(env)).toBe(false);
  });

  it("returns false at 21:00 Rome (summer)", () => {
    // 21:00 Rome = 19:00 UTC in summer
    vi.setSystemTime(new Date("2026-07-15T19:00:00Z"));
    expect(isActiveHour(env)).toBe(false);
  });
});

describe("isActiveHour with custom hours", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("respects ACTIVE_HOURS_START and ACTIVE_HOURS_END from env", () => {
    const env = makeEnv("8", "20");
    // 07:00 Rome (UTC+1 winter) → 06:00 UTC — should be false with start=8
    vi.setSystemTime(new Date("2026-01-15T06:00:00Z"));
    expect(isActiveHour(env)).toBe(false);

    // 08:00 Rome = 07:00 UTC — should be true
    vi.setSystemTime(new Date("2026-01-15T07:00:00Z"));
    expect(isActiveHour(env)).toBe(true);
  });
});

describe("getRomeHour", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns 7 at 07:30 Rome winter", () => {
    vi.setSystemTime(new Date("2026-01-15T06:30:00Z")); // 07:30 Rome UTC+1
    expect(getRomeHour()).toBe(7);
  });

  it("returns 0 at midnight Rome", () => {
    vi.setSystemTime(new Date("2026-01-14T23:00:00Z")); // 00:00 Rome UTC+1
    expect(getRomeHour()).toBe(0);
  });
});
