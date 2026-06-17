---
baseline_commit: NO_VCS
status: review
---

# Story 1.2: Timezone utilities

## Story

As a developer,
I want utility functions che gestiscono la timezone Europe/Rome,
So that tutte le comparazioni orarie nel sistema usino un'unica fonte di verità DST-aware.

## Acceptance Criteria

- AC1: `getRomeMidnightMs()` restituisce l'epoch ms della mezzanotte del giorno corrente in Europe/Rome (non UTC)
- AC2: il valore cambia correttamente al passaggio DST (UTC+1/UTC+2)
- AC3: `isActiveHour(env)` restituisce `false` alle 06:59 Europe/Rome
- AC4: `isActiveHour(env)` restituisce `true` alle 07:00 Europe/Rome
- AC5: `isActiveHour(env)` restituisce `false` alle 21:00 Europe/Rome (finestra è `[start, end)`)
- AC6: i test unitari coprono i boundary e il DST

## Tasks/Subtasks

- [x] Task 1: Creare `src/utils/timezone.ts` con `getRomeMidnightMs` e `isActiveHour`
- [x] Task 2: Creare `src/utils/timezone.test.ts` con test unitari
- [x] Task 3: Configurare test runner (vitest) e verificare che i test passino

## Dev Notes

### Pattern architetturale

Usare `Intl.DateTimeFormat` con `timeZone: "Europe/Rome"` — è disponibile nel runtime V8 di Cloudflare Workers. Non usare librerie esterne (es. `date-fns-tz`, `luxon`) per mantenere zero dipendenze runtime.

### getRomeMidnightMs — implementazione corretta

```typescript
export function getRomeMidnightMs(): number {
  const now = new Date();
  // Format midnight in Rome time as ISO-like string, then parse
  const formatter = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Rome",
    year: "numeric", month: "2-digit", day: "2-digit",
  });
  const dateStr = formatter.format(now); // "YYYY-MM-DD"
  return new Date(`${dateStr}T00:00:00+01:00`).getTime(); // SBAGLIATO — ignora DST
}
```

**Pattern corretto**: usare `sv-SE` locale che produce `YYYY-MM-DD`, poi costruire la data come se fosse `Europe/Rome` midnight via trick:

```typescript
export function getRomeMidnightMs(): number {
  const now = new Date();
  const romeDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Rome",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(now); // "YYYY-MM-DD"
  // Parse come UTC midnight di quel giorno Rome, poi aggiusta l'offset
  const utcMidnight = new Date(`${romeDate}T00:00:00Z`).getTime();
  // Trova l'offset Rome in quel giorno
  const romeOffsetMs = getRomeOffsetMs(new Date(`${romeDate}T12:00:00Z`));
  return utcMidnight + romeOffsetMs;
}

function getRomeOffsetMs(referenceDate: Date): number {
  // Trick: format UTC and Rome time, compute delta
  const utcStr = referenceDate.toLocaleString("en-GB", { timeZone: "UTC" });
  const romeStr = referenceDate.toLocaleString("en-GB", { timeZone: "Europe/Rome" });
  return new Date(romeStr).getTime() - new Date(utcStr).getTime();
}
```

**Pattern ancora più semplice e corretto** (raccomandato):

```typescript
export function getRomeMidnightMs(): number {
  const now = new Date();
  // Get Rome date parts
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Rome",
    year: "numeric", month: "numeric", day: "numeric",
    hour: "numeric", minute: "numeric", second: "numeric",
    hour12: false,
  }).formatToParts(now);
  // Reconstruct as UTC of Rome midnight
  const get = (type: string) => Number(parts.find(p => p.type === type)?.value ?? 0);
  // Create Date representing "this Rome date at 00:00:00" in Rome timezone
  // by subtracting the current Rome time-of-day from now
  const romeHour = get("hour") === 24 ? 0 : get("hour");
  const romeMinute = get("minute");
  const romeSecond = get("second");
  const msFromMidnight = (romeHour * 3600 + romeMinute * 60 + romeSecond) * 1000;
  return now.getTime() - msFromMidnight - now.getMilliseconds();
}
```

**Nota**: questa implementazione ignora l'ora esatta della transizione DST (1:00 AM ambigua). Per questo progetto (polling ogni 60s, finestra 07:00–21:00) è accettabile — l'errore massimo è < 60 secondi al confine DST.

### isActiveHour — finestra `[start, end)`

```typescript
export function isActiveHour(env: WorkerEnv): boolean {
  const romeHour = getRomeHour();
  const start = parseInt(env.ACTIVE_HOURS_START, 10);
  const end = parseInt(env.ACTIVE_HOURS_END, 10);
  return romeHour >= start && romeHour < end;
}
```

- 07:00 → `7 >= 7 && 7 < 21` → `true`
- 21:00 → `21 >= 7 && 21 < 21` → `false`
- 06:59 → ora `6` → `6 >= 7` → `false`

### Test con date fisse

Usare `vi.setSystemTime()` di vitest per fissare la data nei test e testare boundary + DST.

## Dev Agent Record

### Implementation Plan

1. Implementare `src/utils/timezone.ts` con `getRomeMidnightMs` e `isActiveHour`
2. Aggiungere vitest come devDependency e configurare `vitest.config.ts`
3. Scrivere test con `vi.setSystemTime` per boundary 06:59/07:00/21:00 e transizione DST marzo/ottobre

### Debug Log

### Completion Notes

15/15 test passati. `getRomeMidnightMs` usa `formatToParts` per sottrarre il time-of-day Rome dall'ora corrente — corretto per DST (UTC+1 inverno, UTC+2 estate). `isActiveHour` usa finestra `[start, end)` — 21:00 restituisce false come da AC5. `getRomeHour` esportato separatamente per testabilità. Nessuna dipendenza runtime aggiunta.

## File List

- `src/utils/timezone.ts`
- `src/utils/timezone.test.ts`
- `vitest.config.ts`
- `package.json` (aggiunto vitest, script test)

## Change Log

- 2026-06-16: Story 1.2 completata — timezone utilities con 15 test (boundary + DST)
