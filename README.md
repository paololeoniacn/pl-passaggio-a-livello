# Passaggio a Livello Monitor

Cloudflare Worker che rileva treni SFM2 in avvicinamento al passaggio a livello di Via Dega, Vinovo (linea Torino–Pinerolo) e invia notifiche Telegram ⚠️/✅ prima che le sbarre si chiudano.

- **Autonomo** — nessun reporter umano, nessun intervento manuale
- **Predittivo** — avviso 1–2 minuti prima della chiusura
- **Zero costi** — Cloudflare Workers free tier + Telegram Bot API
- **Replicabile** — fork + 3 variabili = nuovo passaggio a livello monitorato

## Come funziona

Il worker si attiva ogni 60 secondi (cron trigger). Interroga l'API ViaggiaTreno: se un treno ha superato Nichelino (`fermate[Nichelino].effettiva != null`) ma non ancora Candiolo (`fermate[Candiolo].effettiva == null`), il passaggio a livello sta per chiudersi. Lo stato è persistito su Cloudflare KV per evitare notifiche duplicate.

Attivo solo nelle ore 07:00–21:00 Europe/Rome.

## Setup (≤ 30 minuti)

### Pre-requisiti

- Account Cloudflare (gratuito — [dash.cloudflare.com](https://dash.cloudflare.com))
- Node.js ≥ 18 installato
- `wrangler` CLI autenticato: `npx wrangler login`

### 1. Clone e dipendenze

```bash
git clone https://github.com/your-username/pl-passaggio-a-livello.git
cd pl-passaggio-a-livello
npm install
```

### 2. Crea il KV namespace

```bash
npx wrangler kv namespace create PL_STATE
```

Copia l'`id` restituito e incollalo in `wrangler.toml`:

```toml
[[kv_namespaces]]
binding = "PL_STATE"
id = "abc123..."   # ← sostituisci con il tuo ID
```

### 3. Scopri i codici stazione

```bash
curl "http://www.viaggiatreno.it/infomobilita/resteasy/viaggiatreno/autocompletaStazione/nichelino"
# → NICHELINO|S01700

curl "http://www.viaggiatreno.it/infomobilita/resteasy/viaggiatreno/autocompletaStazione/candiolo"
# → CANDIOLO|S01750
```

### 4. Configura le variabili in `wrangler.toml`

```toml
[vars]
TELEGRAM_CHAT_ID = "-1001234567890"   # vedi sezione "Canale Telegram" sotto
NICHELINO_CODE   = "S01700"           # codice dalla risposta autocompletaStazione
CANDIOLO_CODE    = "S01750"
ACTIVE_HOURS_START = "7"              # ora inizio attività (Europe/Rome)
ACTIVE_HOURS_END   = "21"             # ora fine attività (Europe/Rome)
TRAIN_CATEGORIES   = "REG,RV"         # categorie SFM2
```

### 5. Configura i secrets

```bash
# Token del bot Telegram (da @BotFather)
npx wrangler secret put TELEGRAM_TOKEN

# Il tuo chat ID personale (da @userinfobot) — riceve gli alert di errore
npx wrangler secret put ADMIN_CHAT_ID
```

### 6. Configura lo sviluppo locale (opzionale)

```bash
cp .dev.vars.example .dev.vars
# Modifica .dev.vars con i valori reali
```

### 7. Deploy

```bash
npm run type-check   # verifica TypeScript
npm test             # verifica test
npx wrangler deploy  # deploy su Cloudflare
```

Il worker è ora attivo. Verifica su [dash.cloudflare.com](https://dash.cloudflare.com) → Workers → il tuo worker → Triggers.

## Canale Telegram

Per ricevere le notifiche, gli utenti devono iscriversi al canale Telegram del tuo passaggio a livello.

**Creare un canale:**
1. Apri Telegram → Nuovo canale → scegli un nome (es. "PL Via Dega Vinovo")
2. Tipo: Pubblico (per condividerlo) o Privato
3. Aggiungi il tuo bot come amministratore con permesso "Invia messaggi"

**Ottenere il `TELEGRAM_CHAT_ID` del canale:**
- Aggiungi `@userinfobot` al canale come amministratore temporaneo
- Invia un messaggio nel canale — il bot risponde con l'ID (formato: `-100xxxxxxxxxx`)
- Rimuovi `@userinfobot` dal canale dopo aver copiato l'ID

**Ottenere il tuo `ADMIN_CHAT_ID` personale:**
- Avvia una chat privata con `@userinfobot`
- Invia qualsiasi messaggio — risponde con il tuo ID personale

## CI/CD con GitHub Actions

Il repository include `.github/workflows/deploy.yml` che deploya automaticamente ad ogni push su `main`.

Aggiungi il secret `CF_API_TOKEN` nelle impostazioni del repository GitHub:
- Settings → Secrets and variables → Actions → New repository secret
- Nome: `CF_API_TOKEN`
- Valore: API token Cloudflare con permesso "Edit Cloudflare Workers" ([crea qui](https://dash.cloudflare.com/profile/api-tokens))

## Fork per altro passaggio a livello

Vuoi monitorare un altro PL in Italia? Clona questo repo e cambia solo 3 variabili in `wrangler.toml`:

```toml
NICHELINO_CODE = "SXXXXX"   # stazione immediatamente a nord del tuo PL
CANDIOLO_CODE  = "SYYYYY"   # stazione immediatamente a sud del tuo PL
TELEGRAM_CHAT_ID = "-100..."  # il tuo canale Telegram
```

Scopri i codici stazione con `autocompletaStazione/{nome-stazione}` come mostrato al passo 3.

> **Nota:** Il sistema è sperimentale. La finestra predittiva dipende dalla distanza tra le stazioni checkpoint e dalla latenza dell'API ViaggiaTreno (checkpoint-based, non GPS). Valida empiricamente dopo il primo deploy.
