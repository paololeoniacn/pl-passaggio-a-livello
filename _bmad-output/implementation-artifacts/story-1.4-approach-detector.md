---
baseline_commit: NO_VCS
status: review
---

# Story 1.4: Train approach detector

## Story

As a developer,
I want una funzione che determina se un treno SFM2 è in avvicinamento a Vinovo,
So that il sistema possa distinguere tra "treno in avvicinamento" e "treno già passato".

## Acceptance Criteria

- AC1: `isApproaching(andamento, env)` restituisce `true` quando `fermate[Nichelino].effettiva != null` AND `fermate[Candiolo].effettiva == null`
- AC2: restituisce `false` quando entrambe effettiva sono != null (treno già passato)
- AC3: restituisce `false` quando `fermate[Nichelino].effettiva == null` (non ancora a Nichelino)
- AC4: non lancia eccezioni se `fermate` è vuoto o la stazione target non è trovata
- AC5: test unitari coprono tutti i casi boundary incluso fermate vuoto e stazione mancante

## Tasks/Subtasks

- [x] Task 1: Creare `src/detector/approach.ts` con `isApproaching`
- [x] Task 2: Creare `src/detector/approach.test.ts`
- [x] Task 3: Verificare tsc e test passano

## Dev Notes

### Logica checkpoint

```
fermate[NICHELINO_CODE].effettiva != null  → treno ha superato Nichelino
fermate[CANDIOLO_CODE].effettiva == null   → treno non ha ancora raggiunto Candiolo
→ treno è tra Nichelino e Candiolo → in avvicinamento a Vinovo
```

Usare `env.NICHELINO_CODE` e `env.CANDIOLO_CODE` per trovare le fermate per `id`.

### Null safety

`arrivoReale` è un campo alternativo usato da alcune versioni dell'API. Una fermata è "raggiunta" se `effettiva != null || arrivoReale != null`.

### Implementazione

```typescript
export function isApproaching(andamento: VTAndamento, env: WorkerEnv): boolean {
  const passed = (stop: TrainStop | undefined): boolean =>
    stop != null && (stop.effettiva != null || stop.arrivoReale != null);

  const nichelino = andamento.fermate.find(f => f.id === env.NICHELINO_CODE);
  const candiolo = andamento.fermate.find(f => f.id === env.CANDIOLO_CODE);

  return passed(nichelino) && !passed(candiolo);
}
```

## Dev Agent Record

### Implementation Plan

Logica pura, nessuna dipendenza esterna. Test coprono: avvicinamento, già passato, non ancora arrivato, fermate vuote, stazione non trovata.

### Debug Log

### Completion Notes

10/10 test passati. Logica pura, zero side effects. `hasPassed` controlla sia `effettiva` che `arrivoReale` per compatibilità con variazioni API. Nessuna eccezione possibile: `Array.find` restituisce `undefined` e `hasPassed(undefined)` restituisce `false` per design. Candiolo mancante dalle fermate è trattato come "non ancora raggiunto" (approaching = true) — comportamento corretto per treni la cui corsa non ha ancora quello stop nella lista.

## File List

- `src/detector/approach.ts`
- `src/detector/approach.test.ts`

## Change Log

- 2026-06-16: Story 1.4 completata — approach detector con 10 test boundary
