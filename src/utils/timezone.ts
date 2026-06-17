import type { WorkerEnv } from "../types";

/**
 * Returns the epoch ms of midnight (00:00:00) of the current day
 * in the Europe/Rome timezone. Handles DST correctly (UTC+1 in winter,
 * UTC+2 in summer).
 *
 * Used as `departureDateMs` for ViaggiaTreno `andamentoTreno` requests.
 */
export function getRomeMidnightMs(): number {
  const now = new Date();
  // Get current time components in Rome timezone
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Rome",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hour12: false,
  }).formatToParts(now);

  const get = (type: string): number => {
    const val = parts.find((p) => p.type === type)?.value ?? "0";
    return parseInt(val, 10);
  };

  // hour12: false can return 24 for midnight
  const romeHour = get("hour") === 24 ? 0 : get("hour");
  const romeMinute = get("minute");
  const romeSecond = get("second");

  const msFromMidnight =
    (romeHour * 3600 + romeMinute * 60 + romeSecond) * 1000;

  // Subtract time-of-day and milliseconds to get midnight
  return now.getTime() - msFromMidnight - now.getMilliseconds();
}

/**
 * Returns the current hour (0-23) in the Europe/Rome timezone.
 */
export function getRomeHour(): number {
  const hourStr = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Rome",
    hour: "numeric",
    hour12: false,
  }).format(new Date());
  const hour = parseInt(hourStr, 10);
  // hour12: false returns 24 for midnight hour
  return hour === 24 ? 0 : hour;
}

/**
 * Returns true if the current Europe/Rome hour falls within the
 * configured active window [ACTIVE_HOURS_START, ACTIVE_HOURS_END).
 *
 * Examples with default "7" / "21":
 *   06:59 Rome → hour 6  → false
 *   07:00 Rome → hour 7  → true
 *   20:59 Rome → hour 20 → true
 *   21:00 Rome → hour 21 → false
 */
export function isActiveHour(env: WorkerEnv): boolean {
  const hour = getRomeHour();
  const start = parseInt(env.ACTIVE_HOURS_START, 10);
  const end = parseInt(env.ACTIVE_HOURS_END, 10);
  return hour >= start && hour < end;
}
