import { fetchAndamentoTreno, fetchPartenze } from "./api/viaggiatreno";
import { isApproaching } from "./detector/approach";
import { sendTelegram } from "./notifier/telegram";
import {
  CONFIG_KEYS,
  type ConfigKey,
  incrementErrorCount,
  isPaused,
  readConfig,
  readLastSuccess,
  readState,
  resetErrorCount,
  setPaused,
  writeConfig,
  writeLastSuccess,
  writeState,
} from "./state/pl-state";
import type { WorkerEnv } from "./types";
import { getRomeMidnightMs, isActiveHour } from "./utils/timezone";

const STATE_TTL = 900; // seconds (15 min)
const ERROR_ALERT_THRESHOLD = 3;

function formatLastSuccess(last: { ts: number; elapsed: number } | null): string {
  if (!last) return "mai";
  const agoMin = Math.round((Date.now() - last.ts) / 60_000);
  const agoStr = agoMin === 0 ? "< 1 min fa" : `${agoMin} min fa`;
  return `${agoStr} (${last.elapsed}ms)`;
}

export default {
  async fetch(
    request: Request,
    env: WorkerEnv,
    _ctx: ExecutionContext
  ): Promise<Response> {
    const url = new URL(request.url);
    try {
      if (url.pathname === "/startup") {
        const version = env.DEPLOY_VERSION ?? "unknown";
        const chatId = env.ADMIN_CHAT_ID || env.TELEGRAM_CHAT_ID;
        await sendTelegram(
          env,
          `🟢 Worker live — versione ${version}\nProssimo ciclo: tra ~1 min`,
          chatId
        );
        return new Response("ok");
      }

      if (url.pathname === "/pause") {
        await setPaused(env, true);
        await sendTelegram(env, "⏸ Monitoring sospeso", env.ADMIN_CHAT_ID || env.TELEGRAM_CHAT_ID);
        console.log("[op] monitoring sospeso via HTTP");
        return new Response("paused");
      }

      if (url.pathname === "/resume") {
        await setPaused(env, false);
        await sendTelegram(env, "▶️ Monitoring ripreso", env.ADMIN_CHAT_ID || env.TELEGRAM_CHAT_ID);
        console.log("[op] monitoring ripreso via HTTP");
        return new Response("resumed");
      }

      if (url.pathname === "/status") {
        const [state, paused, last] = await Promise.all([readState(env), isPaused(env), readLastSuccess(env)]);
        const version = env.DEPLOY_VERSION ?? "unknown";
        const text = [
          `📊 Status PL Via Dega`,
          `Versione: ${version}`,
          `Monitoring: ${paused ? "⏸ sospeso" : "▶️ attivo"}`,
          `PL state: ${state ?? "sconosciuto"}`,
          `Ultima chiamata VT: ${formatLastSuccess(last)}`,
        ].join("\n");
        await sendTelegram(env, text, env.ADMIN_CHAT_ID || env.TELEGRAM_CHAT_ID);
        return new Response("ok");
      }

      if (url.pathname === "/test-channel") {
        await sendTelegram(env, "🧪 Test canale — bot operativo");
        return new Response("ok");
      }

      if (url.pathname === "/test-bot") {
        await sendTelegram(env, "🧪 Test bot — notifiche admin operative", env.ADMIN_CHAT_ID || env.TELEGRAM_CHAT_ID);
        return new Response("ok");
      }

      if (url.pathname === "/webhook" && request.method === "POST") {
        const update = await request.json() as {
          message?: { chat: { id: number }; text?: string };
        };
        const message = update.message;
        if (!message) return new Response("ok");

        const chatId = String(message.chat.id);
        const adminId = env.ADMIN_CHAT_ID || env.TELEGRAM_CHAT_ID;

        // Only respond to the authorized admin chat
        if (chatId !== adminId) return new Response("ok");

        const parts = (message.text ?? "").trim().split(/\s+/);
        const text = parts[0].toLowerCase();

        if (text === "/status") {
          const [state, paused, last, rawInterval] = await Promise.all([
            readState(env), isPaused(env), readLastSuccess(env),
            readConfig(env, "write_interval"),
          ]);
          const version = env.DEPLOY_VERSION ?? "unknown";
          const writeInterval = rawInterval ?? "5";
          await sendTelegram(env, [
            `📊 Status PL Via Dega`,
            `Versione: ${version}`,
            `Monitoring: ${paused ? "⏸ sospeso" : "▶️ attivo"}`,
            `PL state: ${state ?? "sconosciuto"}`,
            `Ultima chiamata VT: ${formatLastSuccess(last)}`,
            `write_interval: ${writeInterval} min`,
          ].join("\n"), chatId);
        } else if (text === "/stop" || text === "/pause") {
          await setPaused(env, true);
          await sendTelegram(env, "⏸ Monitoring sospeso", chatId);
          console.log("[webhook] monitoring sospeso");
        } else if (text === "/riavvia" || text === "/resume") {
          await setPaused(env, false);
          await sendTelegram(env, "▶️ Monitoring ripreso", chatId);
          console.log("[webhook] monitoring ripreso");
        } else if (text === "/set") {
          const key = parts[1] as ConfigKey | undefined;
          const value = parts[2];
          if (!key || !value || !(CONFIG_KEYS as readonly string[]).includes(key)) {
            await sendTelegram(env, [
              `❌ Uso: /set <chiave> <valore>`,
              `Chiavi valide: ${CONFIG_KEYS.join(", ")}`,
            ].join("\n"), chatId);
          } else {
            await writeConfig(env, key, value);
            await sendTelegram(env, `✅ ${key} = ${value}`, chatId);
            console.log(`[webhook] config set: ${key}=${value}`);
          }
        } else if (text === "/start") {
          await sendTelegram(env, [
            `🤖 PL Via Dega Monitor`,
            ``,
            `/status       — stato attuale`,
            `/stop         — sospendi monitoring`,
            `/riavvia      — riprendi monitoring`,
            `/set <k> <v>  — imposta parametro`,
            ``,
            `Parametri: ${CONFIG_KEYS.join(", ")}`,
          ].join("\n"), chatId);
        }

        return new Response("ok");
      }

    } catch (err) {
      console.error("[http] errore:", String(err));
      return new Response(String(err), { status: 500 });
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

    if (await isPaused(env)) {
      console.log("[skip] monitoring sospeso");
      return;
    }

    try {
      const t0 = Date.now();
      const departures = await fetchPartenze(env.NICHELINO_CODE, env);
      // Write at most once every N minutes to stay under KV write limits.
      const rawInterval = await readConfig(env, "write_interval");
      const writeInterval = rawInterval ? Math.max(1, parseInt(rawInterval, 10)) : 10;
      if (new Date().getMinutes() % writeInterval === 0) {
        await writeLastSuccess(env, t0, Date.now() - t0);
      }
      console.log(`[cycle] treni SFM2 trovati: ${departures.length}`);

      let state = await readState(env);

      for (const train of departures) {
        const andamento = await fetchAndamentoTreno(
          train.codOrigine,
          train.numeroTreno,
          getRomeMidnightMs(),
          env
        );

        const approaching = isApproaching(andamento, env);

        console.log(
          `[train] ${train.numeroTreno} | approaching=${approaching} | state=${state ?? "null"} | delay=${andamento.ritardo}min`
        );

        if (approaching && state !== "CLOSED") {
          await writeState(env, "CLOSED", STATE_TTL);
          state = "CLOSED";
          await sendTelegram(
            env,
            "⚠️ Treno in avvicinamento — PL Via Dega potrebbe chiudersi"
          );
          console.log(`[notify] ⚠️ inviata per treno ${train.numeroTreno}`);
        } else if (!approaching && state === "CLOSED") {
          await writeState(env, "OPEN", STATE_TTL);
          state = "OPEN";
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
