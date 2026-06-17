---
baseline_commit: NO_VCS
status: review
---

# Story 1.7: Scheduled handler orchestration

## Story

As a system operator,
I want un handler `scheduled()` che orchestra tutti i moduli nel ciclo di monitoraggio,
So that ogni minuto il sistema controlli i treni e invii le notifiche corrette senza intervento manuale.

## Acceptance Criteria

- AC1: `src/index.ts` con `export default { scheduled(event, env, ctx) }`
- AC2: per ogni treno da `fetchPartenze(NICHELINO_CODE)`: chiama `fetchAndamentoTreno`, valuta `isApproaching`
- AC3: se `isApproaching` è `true` e `readState` è `"OPEN"` (o `null`): chiama `writeState("CLOSED", 900)` poi `sendTelegram("⚠️...")`
- AC4: se `isApproaching` è `false` e `readState` è `"CLOSED"`: chiama `writeState("OPEN", 900)` poi `sendTelegram("✅...")`
- AC5: se nessuna transizione di stato: nessuna chiamata Telegram
- AC6: `wrangler dev` si avvia senza errori TypeScript
- AC7: test unitari coprono le 4 combinazioni stato/approaching

## Tasks/Subtasks

- [x] Task 1: Implementare `src/index.ts` con l'handler orchestrator
- [x] Task 2: Creare `src/index.test.ts` con tutti i moduli mockati
- [x] Task 3: Verificare tsc e test passano, eseguire full test suite

## Dev Notes

### Logica state machine

```
Per ogni treno in fetchPartenze(NICHELINO_CODE):
  andamento = fetchAndamentoTreno(codOrigine, numeroTreno, getRomeMidnightMs())
  approaching = isApproaching(andamento, env)

  state = readState(env)
  if approaching && state !== "CLOSED":
    writeState(env, "CLOSED", 900)
    sendTelegram(env, "⚠️ Treno in avvicinamento — PL Via Dega potrebbe chiudersi")
  else if !approaching && state === "CLOSED":
    writeState(env, "OPEN", 900)
    sendTelegram(env, "✅ Treno transitato — PL Via Dega libero")
```

La `readState` va fatta UNA VOLTA per ciclo treno (read-before-write idempotente). Se più treni sono attivi contemporaneamente, il primo che triggera la transizione chiude/apre; gli altri trovano lo stato già aggiornato e non inviano notifiche duplicate.

### getRomeMidnightMs in handler

Chiamare `getRomeMidnightMs()` per ogni `fetchAndamentoTreno` per garantire che il `departureDateMs` sia sempre la mezzanotte del giorno corrente in Europe/Rome.

### Note su Story 2.1

L'`isActiveHour` check viene aggiunto in Story 2.1 (Epic 2). Questo handler non lo include ancora.

## Dev Agent Record

### Implementation Plan

Mockerò i moduli con `vi.mock()` in vitest per isolare il handler dai side effects reali.

### Debug Log

### Completion Notes

10/10 test passati. Full suite: 70/70. Handler wira tutti i moduli con vi.mock(). La logica anti-duplicate è testata: treno 1 triggera OPEN→CLOSED, treno 2 trova già CLOSED e non manda notifica. `readState` è chiamata per ogni treno nel loop — comportamento corretto per eventual consistency KV. `isActiveHour` non incluso (Story 2.1).

## File List

- `src/index.ts`
- `src/index.test.ts`

## Change Log

- 2026-06-16: Story 1.7 completata — handler orchestrator con 10 test, full suite 70/70
