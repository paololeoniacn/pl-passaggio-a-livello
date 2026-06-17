---
baseline_commit: NO_VCS
status: review
---

# Story 2.2: Error self-notification

## Story

As a system operator,
I want che il worker mi notifichi su Telegram se accumula 3+ errori consecutivi,
So that posso rilevare rapidamente rotture dell'API ViaggiaTreno senza monitoraggio manuale.

## Acceptance Criteria

- AC1: ogni eccezione nel ciclo principale chiama `incrementErrorCount(env)`
- AC2: se il count restituito è ≥ 3 invia alert a `env.ADMIN_CHAT_ID` con il numero errore
- AC3: ogni ciclo senza eccezioni chiama `resetErrorCount(env)`
- AC4: TTL 3600s su `error_count` garantisce auto-reset se il worker smette di girare
- AC5: test unitari coprono: ciclo ok (reset), 1° errore (no alert), 3° errore (alert admin)

## Tasks/Subtasks

- [x] Task 1: Aggiungere try/catch con error counter in `src/index.ts`
- [x] Task 2: Aggiornare `src/index.test.ts` con test errori
- [x] Task 3: Verificare tsc e full suite passano

## Dev Notes

### Pattern handler

```typescript
try {
  // ... ciclo treni ...
  await resetErrorCount(env);
} catch (err) {
  const count = await incrementErrorCount(env);
  console.error("Scheduled handler error:", err);
  if (count >= 3) {
    await sendTelegram(
      env,
      `🔴 Errore consecutivo #${count} — controlla il worker`,
      env.ADMIN_CHAT_ID
    );
  }
}
```

`incrementErrorCount` e `resetErrorCount` sono già in `src/state/pl-state.ts` da Story 1.5.

## Dev Agent Record

### Implementation Plan

Wrap del body dell'handler in try/catch. Reset su successo, increment + alert su errore.

### Debug Log

### Completion Notes

79/79 test passati (+7 nuovi). Il test "does not throw if sendTelegram fails" ha rivelato un bug reale: se l'alert admin stesso fallisce (es. Telegram 429 durante un'outage), l'errore si propagava fuori dall'handler. Fixato wrappando il blocco di notifica in un secondo try/catch nested. resetErrorCount testato su ciclo ok. Soglia 3 testata esplicitamente (count 1, 2 → no alert; count 3 → alert).

## File List

- `src/index.ts` (modificato)
- `src/index.test.ts` (modificato)

## Change Log

- 2026-06-16: Story 2.2 completata — error self-notification, fix nested try/catch, full suite 79/79
