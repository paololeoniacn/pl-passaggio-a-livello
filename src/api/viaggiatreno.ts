import type { VTAndamento, VTPartenza, WorkerEnv } from "../types";

const BASE_URL =
  "http://www.viaggiatreno.it/infomobilita/resteasy/viaggiatreno";

const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

async function vtFetch<T>(url: string, env: WorkerEnv): Promise<T> {
  const proxyUrl = env.PROXY_URL;
  const target =
    proxyUrl
      ? `${proxyUrl}?url=${encodeURIComponent(url)}`
      : url;

  const headers: Record<string, string> = {
    "User-Agent": BROWSER_UA,
    Referer: "http://www.viaggiatreno.it/",
  };

  if (proxyUrl && env.PROXY_SECRET) {
    headers["X-Proxy-Secret"] = env.PROXY_SECRET;
  }

  let res: Response;
  try {
    res = await fetch(target, { headers });
  } catch (err) {
    throw new Error(`ViaggiaTreno network error: ${url} — ${String(err)}`);
  }

  if (!res.ok) {
    throw new Error(`ViaggiaTreno HTTP ${res.status}: ${url}`);
  }

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    throw new Error(`ViaggiaTreno parse error (non-JSON response): ${url}`);
  }

  return json as T;
}

/**
 * Fetches trains departing from `stationCode` and filters by
 * categories defined in `env.TRAIN_CATEGORIES` (e.g. "REG,RV").
 *
 * Used to enumerate active SFM2 trains passing through the target station.
 * SFM2 trains originate from Chivasso/Torino, so partenze at Nichelino
 * shows passing trains, not just trains originating there.
 */
export async function fetchPartenze(
  stationCode: string,
  env: WorkerEnv
): Promise<VTPartenza[]> {
  // VT partenze requires a JS Date.toString()-style string, NOT epoch ms.
  // epoch ms → HTTP 400; Date.toString() format ("Wed Jun 17 2026 15:58:00 GMT+0000 ...") → HTTP 200.
  const url = `${BASE_URL}/partenze/${stationCode}/${encodeURIComponent(new Date().toString())}`;

  const raw = await vtFetch<VTPartenza[]>(url, env);
  const categories = env.TRAIN_CATEGORIES.split(",");
  return raw.filter((t) => categories.includes(t.categoria));
}

/**
 * Fetches the real-time progress of a specific train.
 * Returns stop list with actual timestamps where the train has already passed.
 *
 * @param originCode - Origin station S-code (e.g. "S01700")
 * @param trainNumber - Train number (e.g. 3041)
 * @param departureDateMs - Midnight of departure date in Europe/Rome (ms epoch)
 *                          Use getRomeMidnightMs() from utils/timezone.ts
 */
export async function fetchAndamentoTreno(
  originCode: string,
  trainNumber: number,
  departureDateMs: number,
  env: WorkerEnv
): Promise<VTAndamento> {
  const url = `${BASE_URL}/andamentoTreno/${originCode}/${trainNumber}/${departureDateMs}`;
  return vtFetch<VTAndamento>(url, env);
}
