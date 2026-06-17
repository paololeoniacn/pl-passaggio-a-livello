---
baseline_commit: NO_VCS
status: review
---

# Story 1.5: KV state machine

## Story

As a developer,
I want una state machine idempotente persistita su Cloudflare KV,
So that il sistema non invii notifiche duplicate anche in caso di eventual consistency KV.

## Acceptance Criteria

- AC1: `readState(env)` restituisce `"OPEN"` | `"CLOSED"` | `null`
- AC2: `null` significa primo avvio o TTL scaduto (nessuno stato salvato)
- AC3: `writeState(env, "CLOSED", 900)` scrive su KV key `"pl_state"` con TTL 900 secondi
- AC4: lettura successiva entro TTL restituisce `"CLOSED"`
- AC5: dopo TTL scaduto KV restituisce `null` (auto-reset safety)
- AC6: test unitari con KV mockato

## Tasks/Subtasks

- [x] Task 1: Creare `src/state/pl-state.ts` con `readState` e `writeState`
- [x] Task 2: Creare `src/state/pl-state.test.ts` con KV mockato
- [x] Task 3: Verificare tsc e test passano

## Dev Notes

### KV key e TTL

- Key: `"pl_state"`, TTL 900s (15 min) — auto-reset se nessun treno rilevato
- Key: `"error_count"`, TTL 3600s — per Story 2.2 (aggiungere qui)

### Pattern read-before-write

Il KV ha eventual consistency. `readState` legge l'ultimo valore noto; `writeState` sovrascrive con TTL. Il TTL garantisce reset automatico se il worker smette di girare.

### Mock KV per test

```typescript
function makeKV(initial?: string): KVNamespace {
  const store = new Map<string, string>();
  if (initial) store.set("pl_state", initial);
  return {
    get: async (key: string) => store.get(key) ?? null,
    put: async (key: string, value: string) => { store.set(key, value); },
    delete: async (key: string) => { store.delete(key); },
    list: async () => ({ keys: [], list_complete: true, cacheStatus: null }),
    getWithMetadata: async (key: string) => ({ value: store.get(key) ?? null, metadata: null, cacheStatus: null }),
  } as unknown as KVNamespace;
}
```

## Dev Agent Record

### Implementation Plan

Implementare `readState`/`writeState` come thin wrapper su KV. Aggiungere anche `incrementErrorCount`/`resetErrorCount` per Story 2.2 così sono nello stesso modulo.

### Debug Log

### Completion Notes

12/12 test passati. `readState` valida il valore letto (restituisce null su valori inattesi/corrotti). `writeState` passa `expirationTtl` a KV.put — verificato con spy. Ho incluso `incrementErrorCount`/`resetErrorCount` in questo modulo (Story 2.2 li usa dallo stesso file), anticipando la dipendenza senza logica aggiuntiva nel handler.

## File List

- `src/state/pl-state.ts`
- `src/state/pl-state.test.ts`

## Change Log

- 2026-06-16: Story 1.5 completata — KV state machine con 12 test + error counter per Story 2.2
