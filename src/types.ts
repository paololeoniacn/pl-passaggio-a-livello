/**
 * Cloudflare Worker environment bindings and variables.
 * Secrets (TELEGRAM_TOKEN, ADMIN_CHAT_ID) come from `wrangler secret put`.
 * Vars come from `wrangler.toml [vars]`.
 */
export interface WorkerEnv {
  // KV Namespace binding
  PL_STATE: KVNamespace;

  // Telegram config
  TELEGRAM_CHAT_ID: string;
  TELEGRAM_TOKEN: string; // secret
  ADMIN_CHAT_ID: string;  // secret — receives error self-notifications

  // Station codes (S-codes, e.g. "S01700")
  NICHELINO_CODE: string;
  CANDIOLO_CODE: string;

  // Active hours in Europe/Rome timezone (integer strings, e.g. "7", "21")
  ACTIVE_HOURS_START: string;
  ACTIVE_HOURS_END: string;

  // Comma-separated train categories to monitor (e.g. "REG,RV")
  TRAIN_CATEGORIES: string;

  // Proxy config — set PROXY_URL to route VT requests through a non-cloud IP.
  // Leave empty or unset to call ViaggiaTreno directly (local dev / direct mode).
  PROXY_URL?: string;    // e.g. "https://username.alwaysdata.net/proxy.php"
  PROXY_SECRET?: string; // secret via `wrangler secret put PROXY_SECRET`

  // Set automatically by handle_project.sh deploy (git short hash)
  DEPLOY_VERSION?: string;
}

/**
 * State of the level crossing persisted in KV.
 * OPEN  = no train approaching — OK to transit
 * CLOSED = train approaching or in transit — barriers may be down
 */
export type PlState = "OPEN" | "CLOSED";

/**
 * A single stop in a train's journey as returned by `andamentoTreno`.
 * Fields use `null` (not `undefined`) to represent "not yet reached".
 */
export interface TrainStop {
  /** Station code (S-code) */
  id: string;
  /** Scheduled arrival timestamp (ms epoch), null if not available */
  programmata: number | null;
  /** Actual arrival timestamp (ms epoch), null if not yet reached */
  effettiva: number | null;
  /** Alternative actual arrival field used by some VT endpoint versions */
  arrivoReale: number | null;
}

/**
 * A departing train entry from the `partenze` endpoint.
 */
export interface VTPartenza {
  /** Train number */
  numeroTreno: number;
  /** Category: "REG", "RV", "IC", "FR", "EC", etc. */
  categoria: string;
  /** Origin station code */
  codOrigine: string;
  /** Destination label — nullable since Aug 2025 breaking change */
  subTitle: string | null;
  /** Scheduled departure timestamp (ms epoch) */
  orarioPartenza: number;
}

/**
 * Train progress data from the `andamentoTreno` endpoint.
 * Contains the full stop list with actual timestamps for passed stops.
 */
export interface VTAndamento {
  /** Train number */
  numeroTreno: number;
  /** Origin station code */
  codOrigine: string;
  /** All stops with scheduled and actual timestamps */
  fermate: TrainStop[];
  /** Current delay in minutes (positive = late) */
  ritardo: number;
  /** Destination label — nullable since Aug 2025 breaking change */
  subTitle: string | null;
}
