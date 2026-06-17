---
baseline_commit: NO_VCS
status: review
---

# Story 1.6: Telegram notifier

## Story

As a developer,
I want una funzione per inviare messaggi Telegram a un canale o chat specifica,
So that il sistema possa notificare sia il canale pubblico che l'admin in caso di errori.

## Acceptance Criteria

- AC1: `sendTelegram(env, text)` senza chatId invia a `env.TELEGRAM_CHAT_ID`
- AC2: `sendTelegram(env, text, chatId)` con chatId esplicito invia a quella chat
- AC3: usa `https://api.telegram.org/bot{TOKEN}/sendMessage`
- AC4: se la risposta è HTTP non-2xx lancia `Error` con il codice HTTP nel messaggio
- AC5: test unitari con fetch mockato coprono successo, non-2xx, chatId esplicito

## Tasks/Subtasks

- [x] Task 1: Creare `src/notifier/telegram.ts` con `sendTelegram`
- [x] Task 2: Creare `src/notifier/telegram.test.ts`
- [x] Task 3: Verificare tsc e test passano

## Dev Notes

### Telegram sendMessage API

```
POST https://api.telegram.org/bot{TELEGRAM_TOKEN}/sendMessage
Content-Type: application/json
Body: { "chat_id": "...", "text": "..." }
```

### Implementazione

```typescript
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
```

## Dev Agent Record

### Implementation Plan

Funzione thin wrapper su fetch. Test con vi.stubGlobal("fetch").

### Debug Log

### Completion Notes

8/8 test passati. Funzione minimale: nessun retry, nessun parse del body di risposta — l'unica informazione necessaria è `res.ok`. chatId opzionale defaulta a `env.TELEGRAM_CHAT_ID`; `env.ADMIN_CHAT_ID` si passa esplicitamente per errori admin.

## File List

- `src/notifier/telegram.ts`
- `src/notifier/telegram.test.ts`

## Change Log

- 2026-06-16: Story 1.6 completata — Telegram notifier con 8 test
