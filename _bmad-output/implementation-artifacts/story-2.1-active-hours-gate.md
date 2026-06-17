---
baseline_commit: NO_VCS
status: review
---

# Story 2.1: Active hours gate

## Story

As a system operator,
I want che il worker non effettui chiamate API fuori dall'orario configurato,
So that il sistema non consumi risorse inutilmente di notte e non generi notifiche indesiderate.

## Acceptance Criteria

- AC1: handler esce immediatamente alle 06:59 Rome senza chiamare `fetchPartenze`
- AC2: handler procede normalmente alle 07:00 Rome
- AC3: handler esce immediatamente alle 21:00 Rome (finestra `[start, end)`)
- AC4: `ACTIVE_HOURS_START = "7"` e `ACTIVE_HOURS_END = "21"` sono i default in `wrangler.toml`
- AC5: test unitari verificano exit early e proceed

## Tasks/Subtasks

- [x] Task 1: Aggiungere guard `isActiveHour(env)` in `src/index.ts`
- [x] Task 2: Aggiornare `src/index.test.ts` con test per active hours
- [x] Task 3: Verificare tsc e full test suite passano

## Dev Notes

### Pattern

```typescript
if (!isActiveHour(env)) return;
```

Prima riga dell'handler, prima di qualsiasi chiamata API. `isActiveHour` è già implementata in Story 1.2.

`wrangler.toml` ha già i default `"7"` / `"21"` da Story 1.1.

## Dev Agent Record

### Implementation Plan

Modifica minimale a src/index.ts: aggiungere import di isActiveHour e una riga di guard. Aggiungere 2 test in src/index.test.ts.

### Debug Log

### Completion Notes

72/72 test passati (+2 nuovi). Modifica minimale: 1 import aggiunto, 1 riga di guard in index.ts. I test esistenti continuano a passare perché il mock di `isActiveHour` defaulta a `true`. I 2 nuovi test coprono exit early (false) e proceed (true).

## File List

- `src/index.ts` (modificato)
- `src/index.test.ts` (modificato)

## Change Log

- 2026-06-16: Story 2.1 completata — active hours gate, full suite 72/72
