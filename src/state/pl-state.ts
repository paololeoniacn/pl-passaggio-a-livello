import type { PlState, WorkerEnv } from "../types";

const KEY_PL_STATE = "pl_state";
const KEY_ERROR_COUNT = "error_count";

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
 */
export async function resetErrorCount(env: WorkerEnv): Promise<void> {
  await env.PL_STATE.put(KEY_ERROR_COUNT, "0", { expirationTtl: 3600 });
}
