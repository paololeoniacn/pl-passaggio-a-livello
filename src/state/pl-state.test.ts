import { describe, expect, it } from "vitest";
import {
  incrementErrorCount,
  readState,
  resetErrorCount,
  writeState,
} from "./pl-state";
import type { WorkerEnv } from "../types";

/** In-memory KV mock sufficient for state tests */
function makeKV(initial?: Record<string, string>): KVNamespace {
  const store = new Map<string, string>(
    initial ? Object.entries(initial) : []
  );
  return {
    get: async (key: string) => store.get(key) ?? null,
    put: async (
      key: string,
      value: string,
      _opts?: { expirationTtl?: number }
    ) => {
      store.set(key, value);
    },
    delete: async (key: string) => {
      store.delete(key);
    },
    list: async () => ({
      keys: [],
      list_complete: true,
      cacheStatus: null,
    }),
    getWithMetadata: async (key: string) => ({
      value: store.get(key) ?? null,
      metadata: null,
      cacheStatus: null,
    }),
  } as unknown as KVNamespace;
}

function makeEnv(kv: KVNamespace): WorkerEnv {
  return {
    PL_STATE: kv,
    TELEGRAM_CHAT_ID: "",
    TELEGRAM_TOKEN: "",
    ADMIN_CHAT_ID: "",
    NICHELINO_CODE: "S01700",
    CANDIOLO_CODE: "S01750",
    ACTIVE_HOURS_START: "7",
    ACTIVE_HOURS_END: "21",
    TRAIN_CATEGORIES: "REG,RV",
  };
}

// ---------------------------------------------------------------------------
// readState
// ---------------------------------------------------------------------------

describe("readState", () => {
  it("returns null when KV has no value (first run)", async () => {
    const env = makeEnv(makeKV());
    expect(await readState(env)).toBeNull();
  });

  it("returns 'OPEN' when stored", async () => {
    const env = makeEnv(makeKV({ pl_state: "OPEN" }));
    expect(await readState(env)).toBe("OPEN");
  });

  it("returns 'CLOSED' when stored", async () => {
    const env = makeEnv(makeKV({ pl_state: "CLOSED" }));
    expect(await readState(env)).toBe("CLOSED");
  });

  it("returns null for unexpected/corrupted value", async () => {
    const env = makeEnv(makeKV({ pl_state: "INVALID" }));
    expect(await readState(env)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// writeState + readState roundtrip
// ---------------------------------------------------------------------------

describe("writeState", () => {
  it("persists CLOSED and readState returns CLOSED", async () => {
    const kv = makeKV();
    const env = makeEnv(kv);
    await writeState(env, "CLOSED", 900);
    expect(await readState(env)).toBe("CLOSED");
  });

  it("persists OPEN and readState returns OPEN", async () => {
    const kv = makeKV();
    const env = makeEnv(kv);
    await writeState(env, "OPEN", 900);
    expect(await readState(env)).toBe("OPEN");
  });

  it("overwrites previous state", async () => {
    const kv = makeKV({ pl_state: "OPEN" });
    const env = makeEnv(kv);
    await writeState(env, "CLOSED", 900);
    expect(await readState(env)).toBe("CLOSED");
  });

  it("passes expirationTtl to KV.put", async () => {
    const calls: Array<{ key: string; value: string; opts?: unknown }> = [];
    const kv = {
      get: async () => null,
      put: async (
        key: string,
        value: string,
        opts?: { expirationTtl?: number }
      ) => {
        calls.push({ key, value, opts });
      },
      delete: async () => {},
      list: async () => ({ keys: [], list_complete: true, cacheStatus: null }),
      getWithMetadata: async () => ({
        value: null,
        metadata: null,
        cacheStatus: null,
      }),
    } as unknown as KVNamespace;
    const env = makeEnv(kv);
    await writeState(env, "CLOSED", 900);
    expect(calls[0]).toEqual({
      key: "pl_state",
      value: "CLOSED",
      opts: { expirationTtl: 900 },
    });
  });
});

// ---------------------------------------------------------------------------
// incrementErrorCount / resetErrorCount
// ---------------------------------------------------------------------------

describe("incrementErrorCount", () => {
  it("returns 1 on first call (no previous count)", async () => {
    const env = makeEnv(makeKV());
    expect(await incrementErrorCount(env)).toBe(1);
  });

  it("increments from existing value", async () => {
    const env = makeEnv(makeKV({ error_count: "2" }));
    expect(await incrementErrorCount(env)).toBe(3);
  });

  it("accumulates across multiple calls", async () => {
    const kv = makeKV();
    const env = makeEnv(kv);
    await incrementErrorCount(env);
    await incrementErrorCount(env);
    const count = await incrementErrorCount(env);
    expect(count).toBe(3);
  });
});

describe("resetErrorCount", () => {
  it("resets counter to zero", async () => {
    const kv = makeKV({ error_count: "5" });
    const env = makeEnv(kv);
    await resetErrorCount(env);
    // Next increment should start from 0+1=1
    expect(await incrementErrorCount(env)).toBe(1);
  });
});
