import type { WorkerEnv } from "../types";

/**
 * Sends a Telegram message via the Bot API.
 *
 * @param env - Worker environment (provides TELEGRAM_TOKEN and TELEGRAM_CHAT_ID)
 * @param text - Message text to send
 * @param chatId - Target chat/channel ID; defaults to env.TELEGRAM_CHAT_ID.
 *                 Pass env.ADMIN_CHAT_ID to send error alerts to the admin.
 */
export async function sendTelegram(
  env: WorkerEnv,
  text: string,
  chatId?: string
): Promise<void> {
  const target = chatId ?? env.TELEGRAM_CHAT_ID;
  const url = `https://api.telegram.org/bot${env.TELEGRAM_TOKEN}/sendMessage`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: target, text }),
  });

  if (!res.ok) {
    throw new Error(`Telegram sendMessage HTTP ${res.status}`);
  }
}
