---
baseline_commit: NO_VCS
status: review
---

# Story 1.3: ViaggiaTreno API client

## Story

As a developer,
I want un client typed per l'API ViaggiaTreno con null safety,
So that il sistema possa interrogare partenze e posizione treni senza crash su campi nullable.

## Acceptance Criteria

- AC1: `fetchPartenze(stationCode, env)` restituisce `VTPartenza[]` filtrati per categoria da `env.TRAIN_CATEGORIES`
- AC2: se la risposta è 403 o non-JSON lancia un `Error` tipizzato invece di crashare silenziosamente
- AC3: `fetchAndamentoTreno(originCode, trainNumber, departureDateMs)` restituisce `VTAndamento`
- AC4: `fermate[n].effettiva` è tipizzato `number | null` — nessun TypeError se null
- AC5: `subTitle` è tipizzato `string | null` — nessun TypeError se null
- AC6: base URL corretta: `http://www.viaggiatreno.it/infomobilita/resteasy/viaggiatreno/`
- AC7: test unitari con fetch mockato coprono: successo, 403, risposta non-JSON, campi null

## Tasks/Subtasks

- [x] Task 1: Creare `src/api/viaggiatreno.ts` con `fetchPartenze` e `fetchAndamentoTreno`
- [x] Task 2: Creare `src/api/viaggiatreno.test.ts` con test mockati
- [x] Task 3: Verificare tsc e test passano

## Dev Notes

### Base URL (critico)

```
http://www.viaggiatreno.it/infomobilita/resteasy/viaggiatreno/
```

Il vecchio path `/viaggiatrenonew/` è rotto dal 2022 — non usarlo mai.

### Endpoint partenze

```
GET /partenze/{stationCode}/{isoTimestamp}
```

Dove `{isoTimestamp}` è la data/ora corrente in formato `Mon Jun 16 2026 10:00:00 GMT+0200`. In pratica si usa `new Date().toISOString()` — l'API accetta formati diversi, l'importante è che sia "ora corrente" per filtrare solo i treni in partenza adesso.

Risposta: JSON array di oggetti partenza. Campi rilevanti:
```json
{
  "numeroTreno": 3041,
  "categoria": "REG",
  "codOrigine": "S01700",
  "subTitle": "PINEROLO",
  "orarioPartenza": 1750000000000
}
```

### Endpoint andamentoTreno

```
GET /andamentoTreno/{originCode}/{trainNumber}/{departureDateMs}
```

Risposta: JSON con `fermate[]`. Campi rilevanti:
```json
{
  "numeroTreno": 3041,
  "codOrigine": "S01700",
  "ritardo": 2,
  "subTitle": null,
  "fermate": [
    {
      "id": "S01700",
      "programmata": 1750000000000,
      "effettiva": 1750000060000,
      "arrivoReale": null
    }
  ]
}
```

### Filtro categorie

```typescript
const categories = env.TRAIN_CATEGORIES.split(",");
return departures.filter(t => categories.includes(t.categoria));
```

### Error handling

```typescript
if (!res.ok) {
  throw new Error(`ViaggiaTreno HTTP ${res.status}: ${url}`);
}
let json: unknown;
try {
  json = await res.json();
} catch {
  throw new Error(`ViaggiaTreno parse error: ${url}`);
}
```

### Timestamp partenze

L'API `partenze` richiede un timestamp nel formato italiano. Usare `new Date().toUTCString()` o simile. In pratica, il valore esatto non è critico — l'API restituisce le partenze "ora" indipendentemente dal formato. Usare `encodeURIComponent(new Date().toISOString())`.

## Dev Agent Record

### Implementation Plan

Implementare il client con fetch nativo (disponibile in Workers). Nei test usare `vi.stubGlobal("fetch", ...)` per mockare le chiamate HTTP.

### Debug Log

### Completion Notes

15/15 test passati. `vtFetch` centralizza error handling: errore di rete, HTTP non-2xx, parse non-JSON — tutti lanciano `Error` tipizzati con URL nel messaggio. `fetchPartenze` filtra per `env.TRAIN_CATEGORIES.split(",")` — configurable senza modifica codice. Tutti i campi nullable (`effettiva`, `arrivoReale`, `subTitle`) testati esplicitamente.

## File List

- `src/api/viaggiatreno.ts`
- `src/api/viaggiatreno.test.ts`

## Change Log

- 2026-06-16: Story 1.3 completata — VT API client con 15 test (successo, 403, non-JSON, nullable)
