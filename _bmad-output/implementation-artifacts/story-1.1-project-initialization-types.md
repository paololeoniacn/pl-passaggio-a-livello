---
baseline_commit: NO_VCS
status: review
---

# Story 1.1: Project initialization & types

## Story

As a developer,
I want a Cloudflare Workers project initialized with TypeScript and all shared type definitions,
So that every subsequent module has a typed contract to implement against.

## Acceptance Criteria

- AC1: Il progetto è strutturato con `wrangler.toml`, `tsconfig.json`, `package.json`, `src/index.ts` con handler `scheduled`
- AC2: `src/types.ts` definisce `WorkerEnv` (con tutti i binding KV e variabili), `TrainStop`, `PlState ("OPEN"|"CLOSED")`, `VTPartenza`, `VTAndamento`
- AC3: `wrangler.toml` contiene `[triggers] crons = ["*/1 * * * *"]` e il binding `[[kv_namespaces]] binding = "PL_STATE"`
- AC4: `tsconfig.json` configurato per Cloudflare Workers (target ES2022, moduleResolution bundler)
- AC5: `npm run build` (o `wrangler deploy --dry-run`) completa senza errori TypeScript
- AC6: `.gitignore` esclude `node_modules/`, `.dev.vars`, `dist/`, `.wrangler/`

## Tasks/Subtasks

- [x] Task 1: Setup package.json e dipendenze
  - [x] Creare `package.json` con `@cloudflare/workers-types`, `typescript`, `wrangler` come devDependencies
  - [x] Creare `tsconfig.json` configurato per Workers
- [x] Task 2: Creare `wrangler.toml`
  - [x] Aggiungere `name`, `main`, `compatibility_date`
  - [x] Aggiungere `[triggers] crons = ["*/1 * * * *"]`
  - [x] Aggiungere `[[kv_namespaces]] binding = "PL_STATE"` con placeholder id
  - [x] Aggiungere `[vars]` con le 6 variabili configurabili
- [x] Task 3: Creare `src/types.ts` con tutte le definizioni
  - [x] Definire `WorkerEnv` interface
  - [x] Definire `PlState` type
  - [x] Definire `TrainStop` interface
  - [x] Definire `VTPartenza` interface
  - [x] Definire `VTAndamento` interface
- [x] Task 4: Creare `src/index.ts` con handler `scheduled` stub
- [x] Task 5: Creare `.gitignore`
- [x] Task 6: Verificare build TypeScript senza errori

## Dev Notes

### Architecture Context

Stack: Cloudflare Workers + TypeScript + KV + Telegram + Git.

`wrangler.toml` variabili (da architecture.md):
- `TELEGRAM_CHAT_ID` — ID canale Telegram
- `NICHELINO_CODE` — codice stazione Nichelino (S-code, es. `S01700`)
- `CANDIOLO_CODE` — codice stazione Candiolo (S-code)
- `ACTIVE_HOURS_START` — ora inizio attività (default `"7"`)
- `ACTIVE_HOURS_END` — ora fine attività (default `"21"`)
- `TRAIN_CATEGORIES` — categorie treni SFM2 (default `"REG,RV"`)

Secrets (NON in wrangler.toml, via `wrangler secret put`):
- `TELEGRAM_TOKEN`
- `ADMIN_CHAT_ID`

### WorkerEnv Interface

```typescript
interface WorkerEnv {
  // KV Namespace
  PL_STATE: KVNamespace;
  // Vars (from wrangler.toml [vars])
  TELEGRAM_CHAT_ID: string;
  NICHELINO_CODE: string;
  CANDIOLO_CODE: string;
  ACTIVE_HOURS_START: string;
  ACTIVE_HOURS_END: string;
  TRAIN_CATEGORIES: string;
  // Secrets (from wrangler secret put)
  TELEGRAM_TOKEN: string;
  ADMIN_CHAT_ID: string;
}
```

### Type Definitions

```typescript
type PlState = "OPEN" | "CLOSED";

interface TrainStop {
  id: string;           // station code
  programmata: number | null;  // scheduled arrival ms
  effettiva: number | null;    // actual arrival ms (null = not yet reached)
  arrivoReale: number | null;  // alternative field used by some endpoints
}

interface VTPartenza {
  numeroTreno: number;
  categoria: string;          // "REG", "RV", "IC", etc.
  codOrigine: string;         // origin station code
  subTitle: string | null;    // destination — nullable (Aug 2025 breaking change)
  orarioPartenza: number;     // scheduled departure ms
}

interface VTAndamento {
  numeroTreno: number;
  codOrigine: string;
  fermate: TrainStop[];
  ritardo: number;            // delay in minutes
  subTitle: string | null;   // nullable
}
```

### tsconfig.json Pattern

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "bundler",
    "lib": ["ES2022"],
    "types": ["@cloudflare/workers-types"],
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist"]
}
```

### Null Safety (mandatory architecture pattern)

Tutti i campi `effettiva`, `arrivoReale`, `subTitle` devono essere tipizzati `| null` — non `| undefined`. Pattern da rispettare in ogni modulo.

## Dev Agent Record

### Implementation Plan

Creare la struttura del progetto Cloudflare Workers in-place nella directory corrente (`/Users/paolo.leoni/git/pl/pl-passaggio-a-livello`), senza `npm create cloudflare@latest` (che creerebbe una subdirectory). I file di planning in `_bmad-output/` e `_bmad/` coesistono.

### Debug Log

### Completion Notes

Story 1.1 completata. Struttura Cloudflare Workers inizializzata in-place nella directory del progetto (no subdirectory separata). `tsc --noEmit` passa zero errori. Tutti i tipi riflettono i pattern null-safety da architecture.md: `effettiva`, `arrivoReale`, `subTitle` tipizzati `| null` (non `| undefined`). `TRAIN_CATEGORIES` inclusa in `WorkerEnv` per Story 1.3.

## File List

- `package.json`
- `tsconfig.json`
- `wrangler.toml`
- `src/index.ts`
- `src/types.ts`

## Change Log

- 2026-06-16: Story 1.1 completata — project init, tipi, tsconfig, wrangler.toml
