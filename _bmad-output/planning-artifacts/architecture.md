---
stepsCompleted: [1, 2, 3, 4, 5, 6, 7, 8]
lastStep: 8
status: 'complete'
completedAt: '2026-06-16'
inputDocuments:
  - _bmad-output/planning-artifacts/briefs/brief-pl-passaggio-a-livello-2026-06-16/brief.md
  - _bmad-output/planning-artifacts/research/technical-viaggiatreno-api-affidabilita-latenza-research-2026-06-16.md
workflowType: 'architecture'
project_name: 'pl-passaggio-a-livello'
user_name: 'Paolo.leoni'
date: '2026-06-16'
note: 'PRD skipped by explicit user decision — brief used as primary requirements input'
---

# Architecture Decision Document

_Questo documento costruisce collaborativamente le decisioni architetturali per il sistema Passaggio a Livello Monitor — Vinovo._

---

## Input Documents



- **Brief:** `brief-pl-passaggio-a-livello-2026-06-16/brief.md` (validato, stack aggiornato a Cloudflare Workers + Git)
- **Research:** `technical-viaggiatreno-api-affidabilita-latenza-research-2026-06-16.md` (ViaggiaTreno API endpoints, affidabilità, alternative)
- **PRD:** non prodotto — brief utilizzato come requisiti primari per decisione esplicita

---

## Core Architectural Decisions

### Decision Priority Analysis

**Critici (bloccano l'implementazione):**
- Train discovery: dinamica via `partenze` → `andamentoTreno`
- KV state schema: singolo key globale con TTL
- Secrets management: `wrangler secret` per token sensibili

**Importanti (definiscono l'architettura):**
- Error self-notification via admin Telegram chat
- GitHub Actions CI/CD per deploy automatizzato

**Rimandati post-v1:**
- Testing automatizzato (Vitest + Workers pool)
- Multi-PL support

### Data Architecture

**Cloudflare KV — state machine:**

| Key | Valore | TTL |
|---|---|---|
| `pl_state` | `"OPEN"` \| `"CLOSED"` | 900s (15 min) |

- **Rationale:** un solo key globale è sufficiente — il PL ha un unico stato alla volta. TTL 15 min come safety net: se il worker crasha a metà sequenza, lo stato si resetta automaticamente evitando notifiche bloccate.
- **Idempotenza:** prima di inviare qualsiasi notifica, leggi il KV state. Notifica ⚠️ solo se state attuale è `OPEN`. Notifica ✅ solo se state attuale è `CLOSED`. Scrivi il nuovo state subito dopo l'invio.

**Configurazione `wrangler.toml`:**
```toml
[[kv_namespaces]]
binding = "PL_STATE"
id = "<KV_NAMESPACE_ID>"

[vars]
TELEGRAM_CHAT_ID = "@CanaleVinovo"
NICHELINO_CODE = "S01234"
CANDIOLO_CODE = "S01235"
ACTIVE_HOURS_START = "7"
ACTIVE_HOURS_END = "21"
```

**Secrets (via `wrangler secret put`):**
```
TELEGRAM_TOKEN       # bot token da BotFather
ADMIN_CHAT_ID        # chat ID per notifiche di errore
```

### API & Communication

**Train Discovery — flusso dinamico:**

```
ogni 60s:
  1. GET /partenze/{NICHELINO_CODE}/{timestamp}
     → lista treni in partenza da Nichelino oggi
  2. per ogni treno SFM2 rilevante:
     GET /cercaNumeroTrenoTrenoAutocomplete/{trainNumber}
     → ottieni originCode + departureDateMs
  3. GET /andamentoTreno/{originCode}/{trainNumber}/{departureDateMs}
     → analizza fermate[]:
       - fermate[Nichelino].effettiva != null → treno ha superato Nichelino
       - fermate[Vinovo|Candiolo].effettiva == null → non ancora a destinazione
       → treno in avvicinamento → leggi KV → notifica se state == OPEN
```

**Filtro SFM2:** filtrare per categoria treno o numero per escludere treni passanti non SFM2 (Intercity, Frecciarossa) che non chiudono il PL di Vinovo allo stesso modo.

**ViaggiaTreno base URL (corretto):**
```
http://www.viaggiatreno.it/infomobilita/resteasy/viaggiatreno/
```

### Authentication & Security

- **Worker HTTP handler:** disabilitato — il worker risponde solo a cron trigger, nessun endpoint pubblico esposto
- **Telegram token:** `wrangler secret` — mai in `wrangler.toml` o nel repository
- **ViaggiaTreno:** nessuna auth richiesta, HTTP only (no HTTPS)
- **Admin chat ID:** `wrangler secret` — non sensibile ma conveniente tenerlo separato

### Error Handling & Monitoring

**Self-notification pattern (D3 = B):**

```typescript
let consecutiveErrors = 0; // persisto su KV: "error_count"

catch (error) {
  consecutiveErrors++;
  await kv.put("error_count", String(consecutiveErrors), { expirationTtl: 3600 });

  if (consecutiveErrors >= 3) {
    await sendTelegram(ADMIN_CHAT_ID, `🔴 Sistema offline da ${consecutiveErrors} cicli: ${error.message}`);
  }
}

// Su successo: reset counter
await kv.delete("error_count");
```

**Campi nullable da gestire obbligatoriamente:**
- `fermate[n].effettiva` — null se fermata non ancora raggiunta
- `fermate[n].arrivoReale` — null
- `subTitle` — null (Aug 2025, documentato)

### Infrastructure & Deployment

**Cron schedule:**
```toml
[triggers]
crons = ["*/1 * * * *"]
```

**GitHub Actions CI/CD (D4 = B):**
```yaml
# .github/workflows/deploy.yml
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CF_API_TOKEN }}
```

Secrets GitHub richiesti per il deployer: `CF_API_TOKEN` (Cloudflare API token con permessi Workers).

**Ambienti:** solo `production` — nessun staging per v1.

### Decision Impact Analysis

**Sequenza di implementazione:**
1. Init progetto (`npm create cloudflare@latest`)
2. Configurare `wrangler.toml` (KV namespace, cron, vars)
3. Implementare ViaggiaTreno API client (con URL corretto)
4. Implementare train approach detector (checkpoint logic)
5. Implementare Telegram notifier (⚠️ e ✅)
6. Implementare state machine su KV (idempotenza)
7. Implementare filtro orario (Europe/Rome)
8. Implementare error self-notification
9. GitHub Actions workflow
10. README deployer (4 variabili, wrangler secret, wrangler deploy)

**Cross-component dependencies:**
- Timezone handling → usata in: filtro orario (step 7) + `departureDateMs` (step 3)
- KV state → dipende da: notifier (step 5) + error handler (step 8)
- Train discovery dinamica → richiede 2–3 chiamate API per ciclo → error handling critico (step 8)

---

## Implementation Patterns & Consistency Rules

### Naming Patterns

**TypeScript:**
- Funzioni: `camelCase` — `fetchTrainProgress`, `sendTelegram`, `isApproaching`
- Costanti di configurazione: `UPPER_SNAKE_CASE` — `NICHELINO_CODE`, `ACTIVE_HOURS_START`
- Tipi e interfacce: `PascalCase` — `TrainStop`, `PlState`, `WorkerEnv`
- KV keys: stringa `snake_case` letterale — `"pl_state"`, `"error_count"`

### Structure Patterns

**Organizzazione file:**
```
src/
  index.ts              ← entry point: scheduled handler + orchestrazione
  api/
    viaggiatreno.ts     ← client VT: fetch, parsing, null safety
  detector/
    approach.ts         ← logica checkpoint: Nichelino superato, Candiolo non ancora
  notifier/
    telegram.ts         ← invio ⚠️ ✅ e notifiche admin error
  state/
    pl-state.ts         ← read/write KV con idempotenza
  utils/
    timezone.ts         ← helpers Europe/Rome: departureDateMs, isActiveHour
```

### Process Patterns

**P1 — Null safety obbligatoria su ViaggiaTreno**

Tutti i campi nullable (`effettiva`, `arrivoReale`, `subTitle`) usano optional chaining. Mai accesso diretto su risposta API.

```typescript
// ✅ Corretto
const passed = stop.effettiva != null || stop.arrivoReale != null;

// ❌ Anti-pattern
const passed = stop.effettiva > 0; // TypeError se null
```

**P2 — Timezone: unico punto di verità in `utils/timezone.ts`**

Tutte le comparazioni orarie passano per `utils/timezone.ts`. Mai `new Date()` raw senza conversione Europe/Rome.

```typescript
// utils/timezone.ts
export function getRomeMidnightMs(): number {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('it-IT', {
    timeZone: 'Europe/Rome',
    year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(now);
  const d = Object.fromEntries(parts.map(p => [p.type, p.value]));
  return new Date(`${d.year}-${d.month}-${d.day}T00:00:00+01:00`).getTime();
}

export function isActiveHour(env: WorkerEnv): boolean {
  const hour = parseInt(
    new Intl.DateTimeFormat('it-IT', { timeZone: 'Europe/Rome', hour: 'numeric', hour12: false })
      .format(new Date())
  );
  return hour >= parseInt(env.ACTIVE_HOURS_START) && hour < parseInt(env.ACTIVE_HOURS_END);
}
```

**P3 — State machine: read-before-write sempre**

Prima di qualsiasi notifica leggere lo stato KV. Scrivere solo dopo l'invio confermato.

```typescript
// state/pl-state.ts
const current = await env.PL_STATE.get("pl_state"); // "OPEN" | "CLOSED" | null

if (approaching && current !== "CLOSED") {
  await env.PL_STATE.put("pl_state", "CLOSED", { expirationTtl: 900 });
  await sendTelegram(env, "⚠️ ...");
}

if (!approaching && current === "CLOSED") {
  await env.PL_STATE.put("pl_state", "OPEN", { expirationTtl: 900 });
  await sendTelegram(env, "✅ ...");
}
```

**P4 — Filtro categoria treno SFM2**

`partenze` restituisce tutti i treni. Filtrare per categoria prima di chiamare `andamentoTreno`. Categorie incluse: `REG`, `RV`. Escluse: `IC`, `FR`, `EC`, `AV`.

```typescript
const SFM2_CATEGORIES = (env.TRAIN_CATEGORIES ?? "REG,RV").split(",");
const sfm2Trains = departures.filter(t => SFM2_CATEGORIES.includes(t.categoria));
```

**P5 — Error self-notification: soglia 3 errori consecutivi**

```typescript
// Errore: incrementa counter su KV
const count = parseInt(await env.PL_STATE.get("error_count") ?? "0") + 1;
await env.PL_STATE.put("error_count", String(count), { expirationTtl: 3600 });
if (count >= 3) {
  await sendTelegram(env, `🔴 Sistema offline da ${count} cicli: ${error.message}`, env.ADMIN_CHAT_ID);
}

// Successo: reset counter
await env.PL_STATE.delete("error_count");
```

---

## Project Structure & Boundaries

### Complete Project Directory Structure

```
pl-passaggio-a-livello/
├── README.md                          ← guida deployer: 4 variabili + wrangler deploy
├── package.json
├── tsconfig.json
├── wrangler.toml                      ← cron, KV binding, vars (no secrets)
├── .dev.vars.example                  ← template secrets locali (gitignored)
├── .gitignore
├── .github/
│   └── workflows/
│       └── deploy.yml                 ← wrangler-action su push a main
├── src/
│   ├── index.ts                       ← scheduled handler: orchestrazione principale
│   ├── types.ts                       ← WorkerEnv, TrainStop, PlState, VTResponse
│   ├── api/
│   │   └── viaggiatreno.ts            ← client VT: partenze, cercaNumeroTreno, andamentoTreno
│   ├── detector/
│   │   └── approach.ts                ← checkpoint logic: Nichelino→Vinovo, filtro SFM2
│   ├── notifier/
│   │   └── telegram.ts                ← sendTelegram(env, text, chatId?)
│   ├── state/
│   │   └── pl-state.ts                ← readState, writeState, incrementError, resetError
│   └── utils/
│       └── timezone.ts                ← getRomeMidnightMs, isActiveHour
└── test/                              ← (opzionale v1)
    └── detector/
        └── approach.test.ts
```

### Requirements to Structure Mapping

| FR | File |
|---|---|
| FR1 cron trigger | `src/index.ts` |
| FR2 approach detection | `src/detector/approach.ts` + `src/api/viaggiatreno.ts` |
| FR3 notifica ⚠️ | `src/notifier/telegram.ts` |
| FR4 notifica ✅ | `src/notifier/telegram.ts` |
| FR5 filtro orario | `src/utils/timezone.ts` |
| FR6 state machine KV | `src/state/pl-state.ts` |
| FR7 4 variabili config | `wrangler.toml` + `.dev.vars.example` |

### Data Flow

```
Cloudflare Cron → src/index.ts
  → utils/timezone.ts (isActiveHour?) → stop se fuori orario
  → api/viaggiatreno.ts (partenze Nichelino) → lista treni
  → detector/approach.ts (filtro SFM2, categoria REG/RV)
  → per ogni treno SFM2: api/viaggiatreno.ts (andamentoTreno)
  → detector/approach.ts (checkpoint logic) → boolean approaching
  → state/pl-state.ts (read KV "pl_state")
  → [se transizione] notifier/telegram.ts (⚠️ o ✅)
  → state/pl-state.ts (write KV)
  → [se errore] state/pl-state.ts (error_count++) → notifier/telegram.ts (admin alert ≥3)
```

### Integration Points

**Esterni:**
- `ViaggiaTreno API` → `src/api/viaggiatreno.ts` (HTTP GET, no auth)
- `Telegram Bot API` → `src/notifier/telegram.ts` (HTTPS POST, token via secret)
- `Cloudflare KV` → `src/state/pl-state.ts` (binding `PL_STATE`)

**Interni:** moduli comunicano solo via import TypeScript — nessun event bus, nessuna shared mutable state globale.

---

## Architecture Validation Results

### Coherence Validation ✅

Tutte le decisioni sono compatibili: Cloudflare Workers + KV + TypeScript + GitHub Actions formano uno stack coerente senza conflitti di versione o dipendenze circolari. Pattern idempotenti su KV compensano l'eventual consistency. Filtro SFM2 per categoria mitiga falsi positivi da treni non rilevanti.

### Requirements Coverage Validation

| FR/NFR | Coperto | Note |
|---|---|---|
| FR1–FR7 | ✅ tutti | Mapping completo nella struttura |
| NFR1 0€ | ✅ | CF Workers free + Telegram free |
| NFR2 autonomia | ✅ | Cron trigger |
| NFR3 fault tolerance | ✅ | Error handler + admin alert |
| NFR4 latenza 1–2 min | ⚠️ | Dipende da VT API — validazione empirica post-deploy |
| NFR5-6 false positive/negative | ⚠️ | Architettura mitiga, soglie verificabili solo in produzione |
| NFR7 replicabilità | ✅ | Git + 4 vars + wrangler deploy |

### Architecture Completeness Checklist

**Requirements Analysis**
- [x] Project context analizzato
- [x] Scala e complessità valutata (LOW)
- [x] Vincoli tecnici identificati
- [x] Cross-cutting concerns mappati

**Architectural Decisions**
- [x] Decisioni critiche documentate
- [x] Stack tecnologico specificato (CF Workers + KV + Telegram + Git)
- [x] Pattern di integrazione definiti
- [x] Considerazioni performance indirizzate

**Implementation Patterns**
- [x] Naming conventions stabilite
- [x] Pattern struttura definiti
- [x] Pattern comunicazione specificati
- [x] Pattern di processo documentati (error handling, null safety, timezone, state machine)

**Project Structure**
- [x] Struttura directory completa
- [x] Boundaries componenti stabiliti
- [x] Integration points mappati
- [x] Mapping FR → struttura completo

### Architecture Readiness Assessment

**Overall Status: READY FOR IMPLEMENTATION**

**Confidence Level:** medium — architettura solida, 3 gap operativi da validare post-deploy.

**Key Strengths:**
- Stack interamente gratuito e serverless
- Struttura modulare: ogni responsabilità in un file dedicato
- Pattern idempotenti su KV — resiliente a eventual consistency
- Open source first: `wrangler.toml` + README come contratto deployer

**Gap aperti (non bloccanti):**
1. Codici stazione Nichelino/Candiolo — da scoprire via `autocompletaStazione` prima del deploy
2. Validazione latenza VT empirica — loggare `oraUltimoRilevamento` nella prima settimana
3. DST handling in `getRomeMidnightMs` — testare al cambio ora (marzo/ottobre)

### Implementation Handoff

**Prima storia di implementazione:**
```bash
npm create cloudflare@latest pl-passaggio-a-livello -- --type=scheduled
```

**Sequenza raccomandata:**
1. Init + configurare `wrangler.toml` (KV namespace, cron, vars)
2. `src/types.ts` — interfacce VT e WorkerEnv
3. `src/utils/timezone.ts` — helpers Europe/Rome
4. `src/api/viaggiatreno.ts` — client VT con null safety
5. `src/detector/approach.ts` — checkpoint logic + filtro SFM2
6. `src/state/pl-state.ts` — state machine KV idempotente
7. `src/notifier/telegram.ts` — notifiche ⚠️ ✅ e admin
8. `src/index.ts` — orchestrazione scheduled handler
9. `.github/workflows/deploy.yml` — GitHub Actions CI/CD
10. `README.md` — guida deployer

---

### Enforcement

**Tutti gli agenti DEVONO:**
- Importare helpers timezone da `utils/timezone.ts` — mai Intl inline
- Applicare optional chaining su tutti i campi `fermate[]`
- Leggere KV prima di scrivere in ogni transizione di stato
- Filtrare per `TRAIN_CATEGORIES` prima di chiamare `andamentoTreno`
- Usare `wrangler secret put` per `TELEGRAM_TOKEN` e `ADMIN_CHAT_ID` — mai in `wrangler.toml`

---

## Project Context Analysis

### Requirements Overview

**Functional Requirements:**

| ID | Requisito |
|---|---|
| FR1 | Cron trigger ogni 60 secondi (Cloudflare scheduled worker) |
| FR2 | Rilevare treno in avvicinamento via checkpoint logic: Nichelino superato + Candiolo non ancora (`andamentoTreno` + `fermate[]`) |
| FR3 | Notifica ⚠️ Telegram quando treno in avvicinamento |
| FR4 | Notifica ✅ Telegram quando treno ha transitato |
| FR5 | Attivo solo 07:00–21:00 timezone Europe/Rome |
| FR6 | State machine aperto/chiuso su Cloudflare KV — no notifiche duplicate |
| FR7 | 4 variabili configurabili in `wrangler.toml` |

**Non-Functional Requirements:**

| ID | Requisito | Soglia |
|---|---|---|
| NFR1 | Costo | 0€ fissi |
| NFR2 | Autonomia | Zero intervento manuale |
| NFR3 | Fault tolerance | Errori API non crashano il worker |
| NFR4 | Latenza notifica | Entro finestra 1–2 minuti |
| NFR5 | False positive | ≤ 2/settimana |
| NFR6 | False negative 07:00–09:00 | 0 per 2+ settimane consecutive |
| NFR7 | Replicabilità | `git clone` + 4 vars + `wrangler deploy` ≤ 30 min |

**Scale & Complexity:**

- Complessità: **LOW** — funzione singola, sorgente dati singola, output singolo
- Dominio tecnico: serverless scheduled job
- Componenti architetturali stimati: 4

### Technical Constraints & Dependencies

- **ViaggiaTreno API**: HTTP only, undocumented, checkpoint-based (non GPS). `departureDateMs` = mezzanotte del giorno in Europe/Rome. Campi nullable: `effettiva`, `subTitle`, `arrivoReale`.
- **Cloudflare KV**: eventual consistency — state machine deve essere idempotente
- **Train discovery**: numeri treno SFM2 risolti runtime via `cercaNumeroTrenoTrenoAutocomplete`, non hardcoded
- **Timezone**: Europe/Rome pervasiva — filtro orario, costruzione timestamp API, comparazione fermate

### Cross-Cutting Concerns Identified

1. **Timezone handling** — presente in: filtro attività worker, costruzione `departureDateMs`, parsing `fermate[].programmata`
2. **Error handling** — API 403, campi null, JSON parse failure, network timeout
3. **State machine idempotenza** — KV eventual consistency può causare race condition su doppia notifica
4. **Train identification** — scoperta runtime dei treni SFM2 attivi; nessun hardcoding dei numeri treno

---

## Starter Template

**Dominio:** Serverless scheduled job (nessuna UI, nessun framework frontend)

**Inizializzazione:**
```bash
npm create cloudflare@latest pl-passaggio-a-livello -- --type=scheduled
```

**Decisioni fornite dallo starter:**
- Runtime: V8 isolates (no `fs`, no `child_process`)
- Linguaggio: TypeScript out-of-box
- `wrangler.toml` per cron schedule, KV bindings, variabili ambiente
- Deploy: `wrangler deploy` → Cloudflare edge
- Testing: non incluso — Vitest + `@cloudflare/vitest-pool-workers` da aggiungere se necessario


