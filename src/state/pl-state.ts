import type { PlState, WorkerEnv } from "../types";

const KEY_PL_STATE = "pl_state";
const KEY_ERROR_COUNT = "error_count";
const KEY_PAUSED = "monitoring_paused";
const KEY_LAST_SUCCESS = "last_success";
const KEY_CONFIG_PREFIX = "cfg_";

// Allowed runtime config keys settable via /set
export const CONFIG_KEYS = ["write_interval"] as const;
export type ConfigKey = typeof CONFIG_KEYS[number];

export async function readConfig(env: WorkerEnv, key: ConfigKey): Promise<string | null> {
  return env.PL_STATE.get(`${KEY_CONFIG_PREFIX}${key}`);
}

export async function writeConfig(env: WorkerEnv, key: ConfigKey, value: string): Promise<void> {
  await env.PL_STATE.put(`${KEY_CONFIG_PREFIX}${key}`, value);
}

/**
 * Reads the current level crossing state from KV.
 * Returns null on first run or after TTL expiry (auto-reset safety).
 */
export async function readState(env: WorkerEnv): Promise<PlState | null> {
  const value = await env.PL_STATE.get(KEY_PL_STATE);
  if (value === "OPEN" || value === "CLOSED") return value;
  return null;
}

/**
 * Persists the level crossing state to KV with a TTL.
 * TTL guarantees auto-reset if the worker stops running.
 *
 * @param state - "OPEN" or "CLOSED"
 * @param ttlSeconds - KV expiration in seconds (default 900 = 15 min)
 */
export async function writeState(
  env: WorkerEnv,
  state: PlState,
  ttlSeconds: number
): Promise<void> {
  await env.PL_STATE.put(KEY_PL_STATE, state, { expirationTtl: ttlSeconds });
}

/**
 * Increments the consecutive error counter and returns the new count.
 * TTL of 3600s auto-resets the counter if the worker stops entirely.
 * Used by Story 2.2 (error self-notification).
 */
export async function incrementErrorCount(env: WorkerEnv): Promise<number> {
  const current = await env.PL_STATE.get(KEY_ERROR_COUNT);
  const next = (current != null ? parseInt(current, 10) : 0) + 1;
  await env.PL_STATE.put(KEY_ERROR_COUNT, String(next), {
    expirationTtl: 3600,
  });
  return next;
}

/**
 * Resets the consecutive error counter to zero.
 * Call this after a successful monitoring cycle.
 * No-op if already zero to avoid unnecessary KV writes.
 */
export async function resetErrorCount(env: WorkerEnv): Promise<void> {
  const current = await env.PL_STATE.get(KEY_ERROR_COUNT);
  if (current !== null && current !== "0") {
    await env.PL_STATE.put(KEY_ERROR_COUNT, "0", { expirationTtl: 3600 });
  }
}

/**
 * Persists the timestamp and response time of the last successful VT API call.
 * @param tsMs - Unix epoch ms of the call
 * @param elapsedMs - Response time in ms
 */
export async function writeLastSuccess(
  env: WorkerEnv,
  tsMs: number,
  elapsedMs: number
): Promise<void> {
  await env.PL_STATE.put(
    KEY_LAST_SUCCESS,
    JSON.stringify({ ts: tsMs, elapsed: elapsedMs }),
    { expirationTtl: 86400 } // auto-expire after 24h of silence
  );
}

/** Reads the last successful VT API call info, or null if never recorded. */
export async function readLastSuccess(
  env: WorkerEnv
): Promise<{ ts: number; elapsed: number } | null> {
  const raw = await env.PL_STATE.get(KEY_LAST_SUCCESS);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as { ts: number; elapsed: number };
  } catch {
    return null;
  }
}

/** Returns true if monitoring is paused via the /pause HTTP endpoint. */
export async function isPaused(env: WorkerEnv): Promise<boolean> {
  return (await env.PL_STATE.get(KEY_PAUSED)) === "1";
}

/** Pauses monitoring (persisted in KV with no TTL — manual resume required). */
export async function setPaused(env: WorkerEnv, paused: boolean): Promise<void> {
  if (paused) {
    await env.PL_STATE.put(KEY_PAUSED, "1");
  } else {
    await env.PL_STATE.delete(KEY_PAUSED);
  }
}
