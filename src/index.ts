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
  async fetch(
    request: Request,
    env: WorkerEnv,
    _ctx: ExecutionContext
  ): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/startup") {
      try {
        const version = env.DEPLOY_VERSION ?? "unknown";
        const chatId = env.ADMIN_CHAT_ID || env.TELEGRAM_CHAT_ID;
        await sendTelegram(
          env,
          `🟢 Worker live — versione ${version}\nProssimo ciclo: tra ~1 min`,
          chatId
        );
        return new Response("ok");
      } catch (err) {
        console.error("[startup] errore notifica:", String(err));
        return new Response(String(err), { status: 500 });
      }
    }
    return new Response("not found", { status: 404 });
  },

  async scheduled(
    _event: ScheduledEvent,
    env: WorkerEnv,
    _ctx: ExecutionContext
  ): Promise<void> {
    if (!isActiveHour(env)) {
      console.log("[skip] fuori orario attivo");
      return;
    }

    try {
      const departures = await fetchPartenze(env.NICHELINO_CODE, env);
      console.log(`[cycle] treni SFM2 trovati: ${departures.length}`);

      for (const train of departures) {
        const andamento = await fetchAndamentoTreno(
          train.codOrigine,
          train.numeroTreno,
          getRomeMidnightMs(),
          env
        );

        const approaching = isApproaching(andamento, env);
        const state = await readState(env);

        console.log(
          `[train] ${train.numeroTreno} | approaching=${approaching} | state=${state ?? "null"} | delay=${andamento.ritardo}min`
        );

        if (approaching && state !== "CLOSED") {
          await writeState(env, "CLOSED", STATE_TTL);
          await sendTelegram(
            env,
            "⚠️ Treno in avvicinamento — PL Via Dega potrebbe chiudersi"
          );
          console.log(`[notify] ⚠️ inviata per treno ${train.numeroTreno}`);
        } else if (!approaching && state === "CLOSED") {
          await writeState(env, "OPEN", STATE_TTL);
          await sendTelegram(env, "✅ Treno transitato — PL Via Dega libero");
          console.log(`[notify] ✅ inviata per treno ${train.numeroTreno}`);
        }
      }

      await resetErrorCount(env);
    } catch (err) {
      console.error("[error]", String(err));
      try {
        const count = await incrementErrorCount(env);
        console.error(`[error] contatore errori consecutivi: ${count}`);
        if (count >= ERROR_ALERT_THRESHOLD) {
          await sendTelegram(
            env,
            `🔴 Errore consecutivo #${count} — controlla il worker`,
            env.ADMIN_CHAT_ID
          );
        }
      } catch (notifyErr) {
        console.error("[error] impossibile inviare notifica admin:", String(notifyErr));
      }
    }
  },
};
