import type { TrainStop, VTAndamento, WorkerEnv } from "../types";

/**
 * Returns true if a stop has been physically reached by the train.
 * Checks both `effettiva` and `arrivoReale` to handle API variations.
 */
function hasPassed(stop: TrainStop | undefined): boolean {
  return stop != null && (stop.effettiva != null || stop.arrivoReale != null);
}

/**
 * Determines if a train is approaching Vinovo.
 *
 * A train is approaching when:
 *   - It has passed the Nichelino checkpoint (upstream of Vinovo)
 *   - It has NOT yet reached the Candiolo checkpoint (downstream of Vinovo)
 *
 * Returns false (never throws) if fermate is empty or either station is not found.
 */
export function isApproaching(
  andamento: VTAndamento,
  env: WorkerEnv
): boolean {
  const nichelino = andamento.fermate.find((f) => f.id === env.NICHELINO_CODE);
  const candiolo = andamento.fermate.find((f) => f.id === env.CANDIOLO_CODE);

  return hasPassed(nichelino) && !hasPassed(candiolo);
}
