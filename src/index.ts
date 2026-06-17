import { fetchAndamentoTreno, fetchPartenze } from "./api/viaggiatreno";
import { isApproaching } from "./detector/approach";
import { sendTelegram } from "./notifier/telegram";
import {
  incrementErrorCount,
  readState,
  resetErrorCount,
  writeState,
} from "./state/pl-state";
import type { WorkerEnv } from "./types";
import { getRomeMidnightMs, isActiveHour } from "./utils/timezone";

const STATE_TTL = 900; // seconds (15 min)
const ERROR_ALERT_THRESHOLD = 3;

export default {
  async scheduled(
    _event: ScheduledEvent,
    env: WorkerEnv,
    _ctx: ExecutionContext
  ): Promise<void> {
    if (!isActiveHour(env)) return;

    try {
      const departures = await fetchPartenze(env.NICHELINO_CODE, env);

      for (const train of departures) {
        const andamento = await fetchAndamentoTreno(
          train.codOrigine,
          train.numeroTreno,
          getRomeMidnightMs(),
          env
        );

        const approaching = isApproaching(andamento, env);
        const state = await readState(env);

        if (approaching && state !== "CLOSED") {
          await writeState(env, "CLOSED", STATE_TTL);
          await sendTelegram(
            env,
            "⚠️ Treno in avvicinamento — PL Via Dega potrebbe chiudersi"
          );
        } else if (!approaching && state === "CLOSED") {
          await writeState(env, "OPEN", STATE_TTL);
          await sendTelegram(env, "✅ Treno transitato — PL Via Dega libero");
        }
      }

      await resetErrorCount(env);
    } catch (err) {
      console.error("Scheduled handler error:", err);
      try {
        const count = await incrementErrorCount(env);
        if (count >= ERROR_ALERT_THRESHOLD) {
          await sendTelegram(
            env,
            `🔴 Errore consecutivo #${count} — controlla il worker`,
            env.ADMIN_CHAT_ID
          );
        }
      } catch (notifyErr) {
        console.error("Failed to send admin error notification:", notifyErr);
      }
    }
  },
};
