import { afterEach, describe, expect, it, vi } from "vitest";
import { sendTelegram } from "./telegram";
import type { WorkerEnv } from "../types";

function makeEnv(): WorkerEnv {
  return {
    PL_STATE: {} as KVNamespace,
    TELEGRAM_CHAT_ID: "-1001234567890",
    TELEGRAM_TOKEN: "123456:ABC-DEF",
    ADMIN_CHAT_ID: "987654321",
    NICHELINO_CODE: "S01700",
    CANDIOLO_CODE: "S01750",
    ACTIVE_HOURS_START: "7",
    ACTIVE_HOURS_END: "21",
    TRAIN_CATEGORIES: "REG,RV",
  };
}

function mockFetch(status: number): ReturnType<typeof vi.fn> {
  const spy = vi.fn().mockResolvedValue({ ok: status >= 200 && status < 300, status });
  vi.stubGlobal("fetch", spy);
  return spy;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("sendTelegram", () => {
  it("sends to TELEGRAM_CHAT_ID when no chatId provided", async () => {
    const spy = mockFetch(200);
    const env = makeEnv();
    await sendTelegram(env, "⚠️ Treno in avvicinamento");

    const [url, opts] = spy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`https://api.telegram.org/bot${env.TELEGRAM_TOKEN}/sendMessage`);
    const body = JSON.parse(opts.body as string) as { chat_id: string; text: string };
    expect(body.chat_id).toBe(env.TELEGRAM_CHAT_ID);
    expect(body.text).toBe("⚠️ Treno in avvicinamento");
  });

  it("sends to explicit chatId when provided", async () => {
    const spy = mockFetch(200);
    const env = makeEnv();
    await sendTelegram(env, "🔴 Errore", env.ADMIN_CHAT_ID);

    const [, opts] = spy.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(opts.body as string) as { chat_id: string };
    expect(body.chat_id).toBe(env.ADMIN_CHAT_ID);
  });

  it("uses correct Telegram Bot API URL with token", async () => {
    const spy = mockFetch(200);
    const env = makeEnv();
    await sendTelegram(env, "test");

    const [url] = spy.mock.calls[0] as [string];
    expect(url).toContain("api.telegram.org/bot123456:ABC-DEF/sendMessage");
  });

  it("sends POST with application/json Content-Type", async () => {
    const spy = mockFetch(200);
    await sendTelegram(makeEnv(), "test");

    const [, opts] = spy.mock.calls[0] as [string, RequestInit];
    expect(opts.method).toBe("POST");
    expect((opts.headers as Record<string, string>)["Content-Type"]).toBe(
      "application/json"
    );
  });

  it("throws Error with HTTP status on non-2xx response", async () => {
    mockFetch(400);
    await expect(sendTelegram(makeEnv(), "test")).rejects.toThrow(
      "Telegram sendMessage HTTP 400"
    );
  });

  it("throws Error on 401 (bad token)", async () => {
    mockFetch(401);
    await expect(sendTelegram(makeEnv(), "test")).rejects.toThrow(
      "Telegram sendMessage HTTP 401"
    );
  });

  it("throws Error on 429 (rate limited)", async () => {
    mockFetch(429);
    await expect(sendTelegram(makeEnv(), "test")).rejects.toThrow(
      "Telegram sendMessage HTTP 429"
    );
  });

  it("does not throw on 200 OK", async () => {
    mockFetch(200);
    await expect(sendTelegram(makeEnv(), "✅ PL libero")).resolves.toBeUndefined();
  });
});
