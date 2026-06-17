---
stepsCompleted: [1, 2, 3]
inputDocuments:
  - _bmad-output/planning-artifacts/briefs/brief-pl-passaggio-a-livello-2026-06-16/brief.md
  - _bmad-output/planning-artifacts/architecture.md
note: 'PRD skipped — brief usato come fonte FR/NFR per decisione esplicita'
---

# pl-passaggio-a-livello - Epic Breakdown

## Overview

Questo documento scompone i requisiti del sistema Passaggio a Livello Monitor (Vinovo) in epics e stories implementabili, basandosi su brief + architecture. Stack: Cloudflare Workers + TypeScript + KV + Telegram + Git.

## Requirements Inventory

### Functional Requirements

FR1: Il worker si esegue ogni 60 secondi tramite cron trigger Cloudflare
FR2: Il sistema rileva un treno in avvicinamento a Vinovo verificando che il checkpoint Nichelino sia superato (`fermate[Nichelino].effettiva != null`) e il checkpoint Candiolo non ancora raggiunto (`fermate[Candiolo].effettiva == null`), usando l'endpoint `andamentoTreno`
FR3: Il sistema invia una notifica ⚠️ al canale Telegram quando un treno SFM2 è in avvicinamento e lo stato KV è OPEN
FR4: Il sistema invia una notifica ✅ al canale Telegram quando il treno ha transitato e lo stato KV era CLOSED
FR5: Il sistema è attivo solo nelle ore 07:00–21:00 timezone Europe/Rome; fuori da questa finestra il cron handler esce senza effettuare chiamate API
FR6: Lo stato aperto/chiuso del passaggio a livello è persistito su Cloudflare KV (`pl_state`); nessuna notifica duplicata viene inviata grazie a read-before-write idempotente
FR7: Il sistema è configurabile con 4 variabili in `wrangler.toml`: `TELEGRAM_CHAT_ID`, `NICHELINO_CODE`, `CANDIOLO_CODE`, `ACTIVE_HOURS_START`/`ACTIVE_HOURS_END`; i secrets (`TELEGRAM_TOKEN`, `ADMIN_CHAT_ID`) sono gestiti via `wrangler secret put`

### NonFunctional Requirements

NFR1: Costo fisso 0€ — Cloudflare Workers free tier (100k req/day), Telegram Bot API gratuita
NFR2: Autonomia totale — zero intervento manuale dopo il deploy; il sistema si auto-gestisce
NFR3: Fault tolerance — errori API (403, timeout, JSON parse failure, campi null) non crashano il worker; vengono loggati e conteggiati
NFR4: Latenza notifica entro la finestra predittiva di 1–2 minuti dall'effettivo avvicinamento del treno
NFR5: Tasso di falsi positivi ≤ 2 per settimana
NFR6: Zero falsi negativi nelle ore 07:00–09:00 per 2+ settimane consecutive
NFR7: Replicabilità — un deployer con familiarità Git + Cloudflare completa il setup in ≤ 30 minuti con `git clone`, 4 variabili, `wrangler deploy`

### Additional Requirements

- **Starter template**: `npm create cloudflare@latest pl-passaggio-a-livello -- --type=scheduled` (Cloudflare Workers scheduled worker, TypeScript)
- **URL API ViaggiaTreno corretto**: base path `/infomobilita/resteasy/viaggiatreno/` (il vecchio path `/viaggiatrenonew/` è rotto dal 2022)
- **Codici stazione**: Nichelino e Candiolo da scoprire via `autocompletaStazione/{prefix}` prima del deploy
- **KV namespace**: da creare via Cloudflare dashboard o `wrangler kv namespace create`; ID da inserire in `wrangler.toml`
- **GitHub Actions CI/CD**: workflow `.github/workflows/deploy.yml` con `cloudflare/wrangler-action@v3` su push a `main`
- **`.dev.vars.example`**: file template secrets per lo sviluppo locale (gitignored il `.dev.vars` effettivo)
- **DST handling**: `getRomeMidnightMs()` deve gestire il cambio ora Europe/Rome (UTC+1/UTC+2)
- **Filtro categoria treni SFM2**: filtrare per `categoria === "REG" || "RV"` da `partenze`; escludere IC, FR, EC
- **Error self-notification**: dopo 3 errori consecutivi inviare alert a `ADMIN_CHAT_ID`; KV key `error_count` con TTL 3600s
- **Modularità**: struttura src/ con moduli separati per api/, detector/, notifier/, state/, utils/

### UX Design Requirements

N/A — sistema headless, nessuna UI.

### FR Coverage Map

FR1: Epic 1 — cron trigger scheduled handler
FR2: Epic 1 — approach detection checkpoint Nichelino→Candiolo via `andamentoTreno`
FR3: Epic 1 — notifica ⚠️ Telegram treno in avvicinamento
FR4: Epic 1 — notifica ✅ Telegram treno transitato
FR5: Epic 2 — filtro orario 07:00–21:00 Europe/Rome
FR6: Epic 1 — state machine KV idempotente anti-spam
FR7: Epic 3 — 4 variabili configurabili `wrangler.toml` + secrets

## Epic List

### Epic 1: Sistema di rilevamento funzionante
Un Cloudflare Worker che rileva treni SFM2 in avvicinamento a Vinovo e invia notifiche Telegram ⚠️/✅ con state machine KV anti-spam. Dopo questo epic: il sistema gira con `wrangler dev` e invia notifiche reali.
**FRs covered:** FR1, FR2, FR3, FR4, FR6

### Epic 2: Deploy autonomo e resilienza
Il sistema è deployato su Cloudflare, attivo solo nelle ore configurate, e si auto-segnala in caso di malfunzionamenti prolungati. Dopo questo epic: sistema live, autonomo, monitorato.
**FRs covered:** FR5
**Additional:** GitHub Actions CI/CD, error self-notification (≥3 errori), KV namespace setup

### Epic 3: Replicabilità open source
Un deployer con familiarità Git + Cloudflare completa il setup in ≤30 minuti clonando il repo. Dopo questo epic: repo GitHub pubblico pronto per fork.
**FRs covered:** FR7
**Additional:** README deployer, `.dev.vars.example`, `TRAIN_CATEGORIES` configurabile

---

## Epic 1: Sistema di rilevamento funzionante

Un Cloudflare Worker che rileva treni SFM2 in avvicinamento a Vinovo e invia notifiche Telegram ⚠️/✅ con state machine KV anti-spam. Dopo questo epic: il sistema gira con `wrangler dev` e invia notifiche reali.

### Story 1.1: Project initialization & types

As a developer,
I want a Cloudflare Workers project initialized with TypeScript and all shared type definitions,
So that every subsequent module has a typed contract to implement against.

**Acceptance Criteria:**

**Given** la CLI `npm` disponibile e un account Cloudflare
**When** eseguo `npm create cloudflare@latest pl-passaggio-a-livello -- --type=scheduled`
**Then** il progetto è creato con `wrangler.toml`, `tsconfig.json`, `src/index.ts` con handler `scheduled`
**And** `src/types.ts` definisce `WorkerEnv` (con tutti i binding KV e variabili), `TrainStop`, `PlState ("OPEN"|"CLOSED")`, `VTPartenza`, `VTAndamento`
**And** `wrangler.toml` contiene `[triggers] crons = ["*/1 * * * *"]` e il binding `[[kv_namespaces]] binding = "PL_STATE"`

### Story 1.2: Timezone utilities

As a developer,
I want utility functions che gestiscono la timezone Europe/Rome,
So that tutte le comparazioni orarie nel sistema usino un'unica fonte di verità DST-aware.

**Acceptance Criteria:**

**Given** `src/utils/timezone.ts` esiste
**When** chiamo `getRomeMidnightMs()`
**Then** restituisce l'epoch ms della mezzanotte del giorno corrente in Europe/Rome (non UTC)
**And** il valore cambia correttamente al passaggio DST (UTC+1/UTC+2)
**When** chiamo `isActiveHour(env)` alle 06:59 Europe/Rome
**Then** restituisce `false`
**When** chiamo `isActiveHour(env)` alle 07:00 Europe/Rome
**Then** restituisce `true`
**When** chiamo `isActiveHour(env)` alle 21:00 Europe/Rome
**Then** restituisce `false`

### Story 1.3: ViaggiaTreno API client

As a developer,
I want un client typed per l'API ViaggiaTreno con null safety,
So that il sistema possa interrogare partenze e posizione treni senza crash su campi nullable.

**Acceptance Criteria:**

**Given** `src/api/viaggiatreno.ts` con base URL `http://www.viaggiatreno.it/infomobilita/resteasy/viaggiatreno/`
**When** chiamo `fetchPartenze(stationCode, env)`
**Then** restituisce `VTPartenza[]` filtrati per categoria `REG`/`RV` (valore di `env.TRAIN_CATEGORIES`)
**And** se la risposta è 403 o non-JSON lancia un `Error` tipizzato invece di crashare silenziosamente
**When** chiamo `fetchAndamentoTreno(originCode, trainNumber, departureDateMs)`
**Then** restituisce `VTAndamento` con `fermate[]` dove ogni `fermate[n].effettiva` è tipizzato `number | null`
**And** `subTitle` è tipizzato `string | null` e non causa TypeError se null

### Story 1.4: Train approach detector

As a developer,
I want una funzione che determina se un treno SFM2 è in avvicinamento a Vinovo,
So that il sistema possa distinguere tra "treno in avvicinamento" e "treno già passato".

**Acceptance Criteria:**

**Given** `src/detector/approach.ts` con `isApproaching(andamento: VTAndamento, env: WorkerEnv): boolean`
**When** `fermate[Nichelino].effettiva != null` AND `fermate[Candiolo].effettiva == null`
**Then** `isApproaching` restituisce `true`
**When** `fermate[Nichelino].effettiva != null` AND `fermate[Candiolo].effettiva != null`
**Then** `isApproaching` restituisce `false` (treno già passato)
**When** `fermate[Nichelino].effettiva == null`
**Then** `isApproaching` restituisce `false` (treno non ancora a Nichelino)
**And** la funzione non lancia eccezioni se `fermate` è vuoto o la stazione target non è trovata

### Story 1.5: KV state machine

As a developer,
I want una state machine idempotente persistita su Cloudflare KV,
So that il sistema non invii notifiche duplicate anche in caso di eventual consistency KV.

**Acceptance Criteria:**

**Given** `src/state/pl-state.ts` con `readState(env)` e `writeState(env, state, ttl)`
**When** chiamo `readState(env)`
**Then** restituisce `"OPEN"` | `"CLOSED"` | `null` (null = primo avvio, nessuno stato salvato)
**When** chiamo `writeState(env, "CLOSED", 900)`
**Then** scrive su KV key `"pl_state"` con TTL 900 secondi
**And** una lettura successiva entro TTL restituisce `"CLOSED"`
**And** dopo 900 secondi senza aggiornamenti KV restituisce `null` (auto-reset safety)

### Story 1.6: Telegram notifier

As a developer,
I want una funzione per inviare messaggi Telegram a un canale o chat specifica,
So that il sistema possa notificare sia il canale pubblico che l'admin in caso di errori.

**Acceptance Criteria:**

**Given** `src/notifier/telegram.ts` con `sendTelegram(env, text, chatId?)`
**When** chiamo `sendTelegram(env, "⚠️ Treno in avvicinamento")` senza `chatId`
**Then** invia il messaggio a `env.TELEGRAM_CHAT_ID` via `https://api.telegram.org/bot{TOKEN}/sendMessage`
**When** chiamo `sendTelegram(env, "🔴 Errore", env.ADMIN_CHAT_ID)` con `chatId` esplicito
**Then** invia il messaggio alla chat admin
**When** la chiamata Telegram restituisce HTTP non-2xx
**Then** lancia `Error` con il codice HTTP nel messaggio

### Story 1.7: Scheduled handler orchestration

As a system operator,
I want un handler `scheduled()` che orchestra tutti i moduli nel ciclo di monitoraggio,
So that ogni minuto il sistema controlli i treni e invii le notifiche corrette senza intervento manuale.

**Acceptance Criteria:**

**Given** `src/index.ts` con `export default { scheduled(event, env, ctx) }`
**When** il cron si attiva
**Then** per ogni treno da `fetchPartenze(NICHELINO_CODE)`: chiama `fetchAndamentoTreno`, valuta `isApproaching`
**And** se `isApproaching` è `true` e `readState` è `"OPEN"` (o `null`): chiama `writeState("CLOSED", 900)` poi `sendTelegram("⚠️...")`
**And** se `isApproaching` è `false` e `readState` è `"CLOSED"`: chiama `writeState("OPEN", 900)` poi `sendTelegram("✅...")`
**And** se nessuna transizione di stato: nessuna chiamata Telegram
**And** `wrangler dev` si avvia senza errori TypeScript

---

## Epic 2: Deploy autonomo e resilienza

Il sistema è deployato su Cloudflare, attivo solo nelle ore configurate, e si auto-segnala in caso di malfunzionamenti prolungati. Dopo questo epic: sistema live, autonomo, monitorato.

### Story 2.1: Active hours gate

As a system operator,
I want che il worker non effettui chiamate API fuori dall'orario configurato,
So that il sistema non consumi risorse inutilmente di notte e non generi notifiche indesiderate.

**Acceptance Criteria:**

**Given** `src/index.ts` con il guard `isActiveHour(env)` all'inizio di `scheduled()`
**When** il cron si attiva alle 06:59 Europe/Rome
**Then** il handler esce immediatamente senza chiamare `fetchPartenze` né `fetchAndamentoTreno`
**When** il cron si attiva alle 07:00 Europe/Rome
**Then** il handler procede normalmente con il ciclo di monitoraggio
**When** il cron si attiva alle 21:00 Europe/Rome
**Then** il handler esce immediatamente (21:00 è fuori dalla finestra `[07:00, 21:00)`)
**And** `ACTIVE_HOURS_START` e `ACTIVE_HOURS_END` in `wrangler.toml` sono rispettivamente `"7"` e `"21"` come default

### Story 2.2: Error self-notification

As a system operator,
I want che il worker mi notifichi su Telegram se accumula 3+ errori consecutivi,
So that posso rilevare rapidamente rotture dell'API ViaggiaTreno senza monitoraggio manuale.

**Acceptance Criteria:**

**Given** `src/state/pl-state.ts` esteso con `incrementErrorCount(env): Promise<number>` e `resetErrorCount(env): Promise<void>`
**When** chiamo `incrementErrorCount(env)`
**Then** incrementa il valore della KV key `"error_count"` (default 0) con TTL 3600 secondi e restituisce il nuovo conteggio
**When** chiamo `resetErrorCount(env)`
**Then** scrive `"0"` sulla KV key `"error_count"` con TTL 3600 secondi
**Given** il catch block in `src/index.ts` attorno al ciclo principale
**When** una chiamata API lancia un'eccezione
**Then** chiama `incrementErrorCount(env)`
**And** se il valore restituito è ≥ 3: chiama `sendTelegram(env, "🔴 Errore consecutivo #N — controlla il worker", env.ADMIN_CHAT_ID)`
**When** un ciclo completa senza errori
**Then** chiama `resetErrorCount(env)` per azzerare il contatore
**And** TTL 3600s garantisce auto-reset se il worker smette di girare completamente

### Story 2.3: GitHub Actions CI/CD deploy

As a developer,
I want un workflow GitHub Actions che deploya automaticamente su Cloudflare ad ogni push su `main`,
So that il sistema è sempre aggiornato senza richiedere comandi manuali.

**Acceptance Criteria:**

**Given** `.github/workflows/deploy.yml` nel repository
**When** viene eseguito un push sul branch `main`
**Then** il workflow esegue `cloudflare/wrangler-action@v3` con `command: deploy`
**And** usa il secret GitHub `CF_API_TOKEN` come `apiToken`
**And** usa `secrets.CLOUDFLARE_ACCOUNT_ID` come `accountId` (opzionale, riduce ambiguità)
**And** il workflow fallisce esplicitamente se `CF_API_TOKEN` non è configurato
**And** il deploy è idempotente: push successivi sullo stesso codice non causano errori
**And** il file `.github/workflows/deploy.yml` contiene commenti che spiegano come configurare i secret GitHub necessari

---

## Epic 3: Replicabilità open source

Un deployer con familiarità Git + Cloudflare completa il setup in ≤30 minuti clonando il repo. Dopo questo epic: repo GitHub pubblico pronto per fork.

### Story 3.1: Configuration template e secrets scaffold

As a deployer,
I want un template di configurazione completo con tutti i valori da personalizzare,
So that posso configurare il sistema senza dover leggere il codice sorgente.

**Acceptance Criteria:**

**Given** `wrangler.toml` con tutte le variabili configurabili
**When** apro `wrangler.toml`
**Then** trovo `TELEGRAM_CHAT_ID`, `NICHELINO_CODE`, `CANDIOLO_CODE`, `ACTIVE_HOURS_START`, `ACTIVE_HOURS_END`, `TRAIN_CATEGORIES` con valori placeholder o default documentati
**And** `[[kv_namespaces]]` con `binding = "PL_STATE"` e `id = "REPLACE_WITH_YOUR_KV_NAMESPACE_ID"` come placeholder esplicito
**And** `[triggers] crons = ["*/1 * * * *"]` già configurato
**Given** `.dev.vars.example` nella root del progetto
**When** il deployer lo legge
**Then** trova la struttura dei secrets (`TELEGRAM_TOKEN=your_bot_token_here`, `ADMIN_CHAT_ID=your_chat_id_here`) con commenti che spiegano come ottenerli
**And** `.dev.vars` è in `.gitignore` per prevenire commit accidentali di secrets
**And** `.dev.vars.example` è committato nel repository

### Story 3.2: README deployer

As a deployer,
I want un README che mi guidi dal clone al primo deploy in ≤30 minuti,
So that posso deployare il mio sistema senza supporto del maintainer.

**Acceptance Criteria:**

**Given** `README.md` nella root del progetto
**When** un deployer con familiarità Git + Cloudflare lo segue
**Then** completano il setup in ≤30 minuti con le istruzioni:
  1. Pre-requisiti: account Cloudflare (gratuito), Node.js installato, `wrangler login`
  2. `git clone` + `npm install`
  3. Creare KV namespace via dashboard o `wrangler kv namespace create PL_STATE` e copiare l'ID in `wrangler.toml`
  4. Scoprire i codici stazione Nichelino/Candiolo via `autocompletaStazione` (curl di esempio incluso)
  5. Configurare le 4 variabili in `wrangler.toml`
  6. `wrangler secret put TELEGRAM_TOKEN` e `wrangler secret put ADMIN_CHAT_ID`
  7. `wrangler deploy`
**And** il README include una sezione "Canale Telegram" con istruzioni per ottenere `TELEGRAM_CHAT_ID` via `@userinfobot`
**And** il README include una sezione "Fork per altro passaggio a livello" con le sole 3 variabili da cambiare (codici stazione + chat ID)
**And** il README non include istruzioni per non-tecnici né promesse di supporto
