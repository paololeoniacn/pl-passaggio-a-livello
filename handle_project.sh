#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log()  { echo -e "${BLUE}[$(date '+%H:%M:%S')]${NC} $*"; }
ok()   { echo -e "${GREEN}[$(date '+%H:%M:%S')] ✓${NC} $*"; }
warn() { echo -e "${YELLOW}[$(date '+%H:%M:%S')] ⚠${NC} $*"; }
fail() { echo -e "${RED}[$(date '+%H:%M:%S')] ✗${NC} $*"; exit 1; }
step() { echo -e "\n${BLUE}━━━ $* ━━━${NC}\n"; }

# SSH host is per-account: ssh-{username}.alwaysdata.net
alwaysdata_ssh_host() { echo "ssh-${1}.alwaysdata.net"; }

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

# Reads a key from .dev.vars
get_dev_var() {
  local key="$1"
  if [[ -f "$SCRIPT_DIR/.dev.vars" ]]; then
    grep "^${key}=" "$SCRIPT_DIR/.dev.vars" 2>/dev/null | cut -d= -f2- || true
  fi
}

# Writes or updates a KEY=VALUE line in .dev.vars (gitignored)
set_dev_var() {
  local key="$1" value="$2"
  touch "$SCRIPT_DIR/.dev.vars"
  if grep -q "^${key}=" "$SCRIPT_DIR/.dev.vars"; then
    sed -i '' "s|^${key}=.*|${key}=${value}|" "$SCRIPT_DIR/.dev.vars"
  else
    echo "${key}=${value}" >> "$SCRIPT_DIR/.dev.vars"
  fi
}

# Returns the Alwaysdata username, reading from .dev.vars or prompting once
get_alwaysdata_user() {
  local user
  user="$(get_dev_var ALWAYSDATA_USER)"
  if [[ -z "$user" ]]; then
    echo -n "  → Username Alwaysdata (es. mario): " >&2
    read -r user
    [[ -z "$user" ]] && { echo "Username obbligatorio" >&2; exit 1; }
    set_dev_var "ALWAYSDATA_USER" "$user"
  fi
  echo "$user"
}

# Alwaysdata web root per l'account
alwaysdata_www() {
  local user="$1"
  echo "/home/${user}/www"
}

# Deploya proxy.php e .htaccess (con PROXY_SECRET) via SCP
deploy_proxy_files() {
  local user="$1" secret="$2"
  local www ssh_host
  www="$(alwaysdata_www "$user")"
  ssh_host="$(alwaysdata_ssh_host "$user")"

  # Genera .htaccess temporaneo con il secret — mai committato
  local tmp_htaccess
  tmp_htaccess=$(mktemp)
  cat > "$tmp_htaccess" << EOF
SetEnv PROXY_SECRET "${secret}"
EOF

  log "Upload proxy.php → ${user}@${ssh_host}:${www}/"
  scp -q "$SCRIPT_DIR/proxy/proxy.php" "${user}@${ssh_host}:${www}/proxy.php"

  log "Upload .htaccess (con PROXY_SECRET) → ${www}/"
  scp -q "$tmp_htaccess" "${user}@${ssh_host}:${www}/.htaccess"

  rm -f "$tmp_htaccess"
}

# Patches PROXY_URL in wrangler.toml
set_toml_proxy_url() {
  local url="$1"
  sed -i '' "s|^PROXY_URL = \".*\"|PROXY_URL = \"${url}\"|" "$SCRIPT_DIR/wrangler.toml"
}

# Patches DEPLOY_VERSION in wrangler.toml with current git short hash
set_toml_deploy_version() {
  local ver
  ver=$(git -C "$SCRIPT_DIR" rev-parse --short HEAD 2>/dev/null || echo "unknown")
  sed -i '' "s|^DEPLOY_VERSION = \".*\"|DEPLOY_VERSION = \"${ver}\"|" "$SCRIPT_DIR/wrangler.toml"
  echo "$ver"
}

# Calls /startup on the deployed worker given its workers.dev URL
notify_startup() {
  local workers_url="$1"
  log "Notifica avvio → ${workers_url}/startup"
  local http_status
  http_status=$(curl -s -o /dev/null -w "%{http_code}" -X GET "${workers_url}/startup" 2>/dev/null || echo "000")
  if [[ "$http_status" == "200" ]]; then
    ok "Notifica Telegram inviata (startup)"
  else
    warn "Startup notify: HTTP $http_status (controlla ADMIN_CHAT_ID e TELEGRAM_TOKEN)"
  fi
}

# Reads current PROXY_URL from wrangler.toml
get_toml_proxy_url() {
  grep '^PROXY_URL' "$SCRIPT_DIR/wrangler.toml" | grep -v '^#' | sed 's/.*= *"\(.*\)".*/\1/'
}

# Returns the workers.dev base URL for the current worker.
# Cached in .dev.vars as WORKER_URL after the first successful deploy.
get_worker_url() {
  local cached
  cached=$(get_dev_var WORKER_URL)
  if [[ -n "$cached" ]]; then
    echo "$cached"
    return
  fi
  fail "WORKER_URL non trovato in .dev.vars. Esegui prima: ./handle_project.sh deploy"
}

# Ensures wrangler is authenticated
ensure_wrangler_auth() {
  if ! npx wrangler whoami &>/dev/null 2>&1; then
    log "Non autenticato su Cloudflare — avvio login (si apre il browser)..."
    npx wrangler login
  fi
}

# ---------------------------------------------------------------------------
# Usage
# ---------------------------------------------------------------------------

usage() {
  echo ""
  echo "Passaggio a Livello Monitor — project helper"
  echo ""
  echo "Usage: ./handle_project.sh <command>"
  echo ""
  echo "  setup              ★ primo avvio: installa tutto, deploya proxy e worker"
  echo ""
  echo "  install            npm ci — installa le dipendenze"
  echo "  test               esegui la test suite completa"
  echo "  typecheck          verifica TypeScript senza compilare"
  echo "  dev                avvia il worker in locale (premi 't' per triggerare il cron)"
  echo "  deploy             type-check + test + deploy Worker su Cloudflare"
  echo "  logs               stream dei log del worker in produzione"
  echo "  secret <KEY>       imposta un secret Cloudflare manualmente"
  echo "  stations           scopri i codici stazione via autocompletaStazione"
  echo ""
  echo "  proxy-deploy       re-deploy proxy.php su Alwaysdata dopo modifiche"
  echo "  proxy-rotate       genera nuovo PROXY_SECRET e lo sincronizza ovunque"
  echo "  proxy-test         verifica che il proxy risponda correttamente"
  echo ""
  echo "  telegram-webhook-setup   attiva il webhook (bot risponde ai comandi Telegram)"
  echo "  telegram-setup-commands  registra il menu / comandi nel bot Telegram"
  echo "  telegram-test      testa bot (admin) e canale con un messaggio di prova"
  echo "  pause              sospende il monitoring (senza undeploy)"
  echo "  resume             riprende il monitoring"
  echo "  status             invia report stato attuale via Telegram"
  echo ""
}

cmd="${1:-}"

case "$cmd" in

  # ---------------------------------------------------------------------------
  # setup: primo avvio completo — tutto automatico salvo login browser e password SSH
  # ---------------------------------------------------------------------------

  setup)
    step "SETUP COMPLETO — Passaggio a Livello Monitor"

    # ── FASE 0: guida prerequisiti manuali ─────────────────────────────────
    echo ""
    echo -e "${YELLOW}  Questo script fa tutto il possibile in automatico."
    echo -e "  Ci sono 2 passi manuali che richiedono il browser — fatti una volta sola.${NC}"
    echo ""
    echo -e "  ${BLUE}PASSO MANUALE 1 — Crea account Alwaysdata (gratis, no carta di credito):${NC}"
    echo "    1. Vai su https://www.alwaysdata.com/en/register/"
    echo "    2. Scegli un username (es. 'mariorossi') — sarà anche il tuo dominio:"
    echo "       https://mariorossi.alwaysdata.net"
    echo "    3. Completa la registrazione e verifica l'email"
    echo "    4. Il sito e la cartella /www sono già pronti — non serve configurare nulla"
    echo ""
    echo -n "  → Hai creato l'account Alwaysdata? [s/N] "
    read -r CONFIRM
    [[ "$CONFIRM" != "s" && "$CONFIRM" != "S" ]] && {
      echo "  Crea prima l'account su https://www.alwaysdata.com/en/register/ poi riesegui setup."
      exit 0
    }
    echo ""

    echo -e "  ${BLUE}PASSO MANUALE 2 — Abilita SSH su Alwaysdata:${NC}"
    echo "    SSH è disabilitato di default — va attivato dal pannello:"
    echo "    1. Vai su https://admin.alwaysdata.com"
    echo "    2. Menu laterale → 'SSH' (sotto Remote access)"
    echo "    3. Clicca su 'Enable' accanto al tuo account"
    echo "    4. Imposta una password SSH (può essere diversa dalla password account)"
    echo "    5. Salva — attendi 30 secondi che si propaghi"
    echo ""
    echo -n "  → Hai abilitato SSH e impostato la password? [s/N] "
    read -r CONFIRM2
    [[ "$CONFIRM2" != "s" && "$CONFIRM2" != "S" ]] && {
      echo "  Abilita SSH dal pannello Alwaysdata poi riesegui setup."
      exit 0
    }
    echo ""

    echo -e "  ${BLUE}PASSO MANUALE 3 — SSH key (elimina la password ad ogni deploy):${NC}"
    if [[ ! -f "$HOME/.ssh/id_ed25519" && ! -f "$HOME/.ssh/id_rsa" ]]; then
      echo "    Nessuna SSH key trovata — ne creo una ora..."
      ssh-keygen -t ed25519 -f "$HOME/.ssh/id_ed25519" -N "" -C "pl-passaggio-a-livello"
      ok "SSH key creata: ~/.ssh/id_ed25519"
    else
      ok "SSH key esistente trovata"
    fi
    echo ""
    echo -n "  → Username Alwaysdata: "
    read -r ADUSER_INPUT
    [[ -z "$ADUSER_INPUT" ]] && fail "Username obbligatorio"
    set_dev_var "ALWAYSDATA_USER" "$ADUSER_INPUT"
    echo ""

    # Verifica connettività SSH prima di procedere
    AD_SSH_HOST="$(alwaysdata_ssh_host "$ADUSER_INPUT")"
    log "Verifica connettività SSH verso ${AD_SSH_HOST}..."
    if ! nc -z -w 10 "$AD_SSH_HOST" 22 2>/dev/null; then
      fail "Impossibile raggiungere ${AD_SSH_HOST}:22 — SSH non ancora attivo. Attendi 60 secondi e riprova."
    fi
    ok "SSH raggiungibile"

    echo "    Copio la SSH key su Alwaysdata (inserisci la password SSH quando richiesta — ultima volta)..."
    ssh-copy-id "${ADUSER_INPUT}@${AD_SSH_HOST}"
    ok "SSH key installata — i prossimi SCP non chiederanno password"
    echo ""

    step "1/7 — Dipendenze npm"
    npm ci
    ok "npm ci completato"

    step "2/7 — Autenticazione Cloudflare"
    ensure_wrangler_auth
    ok "Cloudflare autenticato"

    step "3/7 — Generazione PROXY_SECRET"
    ADUSER="$(get_alwaysdata_user)"
    NEW_SECRET=$(openssl rand -hex 24)
    set_dev_var "PROXY_SECRET" "$NEW_SECRET"
    ok "Secret generato e salvato in .dev.vars"

    step "4/7 — Deploy proxy.php su Alwaysdata"
    deploy_proxy_files "$ADUSER" "$NEW_SECRET"
    ok "proxy.php e .htaccess caricati"

    step "5/7 — Configurazione wrangler.toml + secret CF"
    PROXY_URL="https://${ADUSER}.alwaysdata.net/proxy.php"
    set_toml_proxy_url "$PROXY_URL"
    ok "PROXY_URL impostata: $PROXY_URL"
    echo "$NEW_SECRET" | npx wrangler secret put PROXY_SECRET
    ok "PROXY_SECRET impostato su CF Worker"

    step "6/7 — Telegram secrets"
    echo ""
    echo -e "  ${BLUE}Serve il token del bot Telegram e il tuo chat ID personale.${NC}"
    echo ""
    echo "  TELEGRAM_TOKEN → token del bot (da @BotFather, formato: 123456:ABC-DEF...)"
    echo -n "  → Incolla il TELEGRAM_TOKEN: "
    read -r -s TG_TOKEN
    echo ""
    [[ -z "$TG_TOKEN" ]] && fail "TELEGRAM_TOKEN obbligatorio"
    echo "$TG_TOKEN" | npx wrangler secret put TELEGRAM_TOKEN
    ok "TELEGRAM_TOKEN impostato"

    echo ""
    echo "  ADMIN_CHAT_ID → il tuo chat ID personale (da @userinfobot su Telegram)"
    echo -e "  ${YELLOW}⚠ IMPORTANTE: prima di proseguire, apri Telegram e manda /start al tuo bot,"
    echo -e "  altrimenti il bot non può scriverti messaggi privati.${NC}"
    echo -n "  → Incolla l'ADMIN_CHAT_ID: "
    read -r ADMIN_ID
    echo ""
    [[ -z "$ADMIN_ID" ]] && fail "ADMIN_CHAT_ID obbligatorio"
    echo "$ADMIN_ID" | npx wrangler secret put ADMIN_CHAT_ID
    ok "ADMIN_CHAT_ID impostato"

    step "7/7 — Typecheck + test + deploy Worker"
    log "TypeScript..."
    npx tsc --noEmit
    ok "TypeScript OK"

    log "Test..."
    npx vitest run
    ok "Test OK"

    log "Deploy Worker su Cloudflare..."
    VER=$(set_toml_deploy_version)
    DEPLOY_OUT=$(npx wrangler deploy 2>&1)
    echo "$DEPLOY_OUT"
    WORKER_URL=$(echo "$DEPLOY_OUT" | grep -oE 'https://[a-z0-9-]+\.[a-z0-9]+\.workers\.dev' | head -1 || true)
    ok "Worker deployato (v${VER})"

    if [[ -n "$WORKER_URL" ]]; then
      set_dev_var "WORKER_URL" "$WORKER_URL"
      sleep 3
      notify_startup "$WORKER_URL"
    fi

    echo ""
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${GREEN}  SETUP COMPLETATO${NC}"
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo "  Proxy:  $PROXY_URL"
    echo "  Worker: attivo su Cloudflare (cron ogni minuto, ore 7–21)"
    echo ""
    echo "  Prossimi comandi utili:"
    echo "    ./handle_project.sh proxy-test     # verifica proxy → ViaggiaTreno"
    echo "    ./handle_project.sh logs            # log Worker in produzione"
    echo ""
    ;;

  # ---------------------------------------------------------------------------
  # Worker commands
  # ---------------------------------------------------------------------------

  install)
    log "Installazione dipendenze..."
    npm ci
    ok "Dipendenze installate"
    ;;

  test)
    log "Esecuzione test suite..."
    npx vitest run --reporter=verbose
    ok "Test completati"
    ;;

  typecheck)
    log "Verifica TypeScript..."
    npx tsc --noEmit
    ok "Nessun errore TypeScript"
    ;;

  dev)
    log "Avvio worker in locale..."
    warn "Premi 't' per triggerare il cron manualmente"
    warn "Assicurati che .dev.vars esista (copia da .dev.vars.example)"
    npx wrangler dev
    ;;

  deploy)
    log "Avvio pipeline deploy Worker..."

    log "1/3 — TypeScript..."
    npx tsc --noEmit
    ok "TypeScript OK"

    log "2/3 — Test..."
    npx vitest run
    ok "Test OK"

    log "3/3 — Deploy su Cloudflare..."
    VER=$(set_toml_deploy_version)
    log "Versione: $VER"
    DEPLOY_OUT=$(npx wrangler deploy 2>&1)
    echo "$DEPLOY_OUT"
    WORKER_URL=$(echo "$DEPLOY_OUT" | grep -oE 'https://[a-z0-9-]+\.[a-z0-9]+\.workers\.dev' | head -1 || true)
    ok "Deploy completato (v${VER})"

    if [[ -n "$WORKER_URL" ]]; then
      set_dev_var "WORKER_URL" "$WORKER_URL"
      sleep 3
      notify_startup "$WORKER_URL"
    else
      warn "URL worker non trovato nell'output — skip notifica startup"
    fi
    ;;

  logs)
    log "Streaming log Worker in produzione (Ctrl+C per uscire)..."
    npx wrangler tail
    ;;

  secret)
    KEY="${2:-}"
    if [[ -z "$KEY" ]]; then
      fail "Specifica il nome del secret. Es: ./handle_project.sh secret TELEGRAM_TOKEN"
    fi
    log "Imposta secret: $KEY"
    npx wrangler secret put "$KEY"
    ok "Secret $KEY impostato"
    ;;

  stations)
    log "Ricerca codici stazione via ViaggiaTreno..."
    echo ""
    for name in nichelino candiolo; do
      result=$(curl -sf "http://www.viaggiatreno.it/infomobilita/resteasy/viaggiatreno/autocompletaStazione/$name" || echo "ERRORE")
      echo "  $name → $result"
    done
    echo ""
    warn "Copia i codici S-code in wrangler.toml (NICHELINO_CODE / CANDIOLO_CODE)"
    ;;

  # ---------------------------------------------------------------------------
  # Telegram / operational commands
  # ---------------------------------------------------------------------------

  telegram-webhook-setup)
    TG_TOKEN=$(get_dev_var TELEGRAM_TOKEN)
    [[ -z "$TG_TOKEN" ]] && fail "TELEGRAM_TOKEN non in .dev.vars"
    WORKER_URL=$(get_worker_url)
    WEBHOOK_URL="${WORKER_URL}/webhook"
    log "Registro webhook → $WEBHOOK_URL"
    curl -s -X POST "https://api.telegram.org/bot${TG_TOKEN}/setWebhook" \
      -H "Content-Type: application/json" \
      -d "{\"url\": \"${WEBHOOK_URL}\"}" | python3 -c "
import json,sys
d = json.load(sys.stdin)
if d.get('ok'):
    print('  ✓ Webhook attivo — scrivi /start al bot su Telegram')
else:
    print(f'  ✗ Errore: {d}')
"
    ;;

  telegram-setup-commands)
    TG_TOKEN=$(get_dev_var TELEGRAM_TOKEN)
    [[ -z "$TG_TOKEN" ]] && fail "TELEGRAM_TOKEN non in .dev.vars"
    log "Registro comandi menu nel bot..."
    curl -s -X POST "https://api.telegram.org/bot${TG_TOKEN}/setMyCommands" \
      -H "Content-Type: application/json" \
      -d '{
        "commands": [
          {"command": "status",  "description": "Stato attuale PL e monitoring"},
          {"command": "pause",   "description": "Sospendi monitoring"},
          {"command": "resume",  "description": "Riprendi monitoring"},
          {"command": "start",   "description": "Avvia il bot"}
        ]
      }' | python3 -c "
import json,sys
d = json.load(sys.stdin)
if d.get('ok'):
    print('  ✓ Comandi registrati — apri il bot e premi /')
else:
    print(f'  ✗ Errore: {d}')
"
    ;;

  telegram-test)
    WORKER_URL=$(get_worker_url)

    log "Test bot (admin) → ${WORKER_URL}/test-bot"
    CODE=$(curl -s -o /dev/null -w "%{http_code}" "${WORKER_URL}/test-bot")
    [[ "$CODE" == "200" ]] && ok "Bot OK — controlla Telegram" || warn "Bot: HTTP $CODE"

    log "Test canale → ${WORKER_URL}/test-channel"
    CODE=$(curl -s -o /dev/null -w "%{http_code}" "${WORKER_URL}/test-channel")
    [[ "$CODE" == "200" ]] && ok "Canale OK — controlla Telegram" || warn "Canale: HTTP $CODE"

    TG_TOKEN=$(get_dev_var TELEGRAM_TOKEN)
    if [[ -n "$TG_TOKEN" ]]; then
      log "getUpdates — ultimi messaggi ricevuti dal bot..."
      curl -s "https://api.telegram.org/bot${TG_TOKEN}/getUpdates" | python3 -c "
import json,sys
d = json.load(sys.stdin)
results = d.get('result', [])
if not results:
    print('  Nessun messaggio recente (manda /start al bot e riprova)')
else:
    for u in results[-5:]:
        msg = u.get('message', u.get('channel_post', {}))
        chat = msg.get('chat', {})
        print(f'  chat_id={chat.get(\"id\")} type={chat.get(\"type\")} name={chat.get(\"title\") or chat.get(\"username\",\"?\")}: {msg.get(\"text\",\"\")}')
" 2>/dev/null || warn "Errore parsing getUpdates"
    else
      warn "TELEGRAM_TOKEN non in .dev.vars — skip getUpdates"
      warn "Aggiungilo con: echo 'TELEGRAM_TOKEN=...' >> .dev.vars"
    fi
    ;;

  pause)
    WORKER_URL=$(get_worker_url)
    CODE=$(curl -s -o /dev/null -w "%{http_code}" "${WORKER_URL}/pause")
    [[ "$CODE" == "200" ]] && ok "Monitoring sospeso — notifica Telegram inviata" || warn "HTTP $CODE"
    ;;

  resume)
    WORKER_URL=$(get_worker_url)
    CODE=$(curl -s -o /dev/null -w "%{http_code}" "${WORKER_URL}/resume")
    [[ "$CODE" == "200" ]] && ok "Monitoring ripreso — notifica Telegram inviata" || warn "HTTP $CODE"
    ;;

  status)
    WORKER_URL=$(get_worker_url)
    CODE=$(curl -s -o /dev/null -w "%{http_code}" "${WORKER_URL}/status")
    [[ "$CODE" == "200" ]] && ok "Status inviato via Telegram" || warn "HTTP $CODE"
    ;;

  # ---------------------------------------------------------------------------
  # Proxy commands (Alwaysdata)
  # ---------------------------------------------------------------------------

  proxy-deploy)
    log "Re-deploy proxy.php su Alwaysdata..."
    ADUSER="$(get_alwaysdata_user)"
    SECRET="$(get_dev_var PROXY_SECRET)"
    [[ -z "$SECRET" ]] && fail "PROXY_SECRET non trovato in .dev.vars. Esegui prima: ./handle_project.sh setup"
    deploy_proxy_files "$ADUSER" "$SECRET"
    ok "Proxy aggiornato"
    ;;

  proxy-rotate)
    log "Rotazione PROXY_SECRET — genera nuovo e sincronizza Alwaysdata + CF + .dev.vars..."

    ADUSER="$(get_alwaysdata_user)"
    NEW_SECRET=$(openssl rand -hex 24)

    log "1/3 — Deploy .htaccess aggiornato su Alwaysdata..."
    deploy_proxy_files "$ADUSER" "$NEW_SECRET"
    ok "Alwaysdata aggiornato"

    log "2/3 — Worker Cloudflare..."
    echo "$NEW_SECRET" | npx wrangler secret put PROXY_SECRET
    ok "CF Worker aggiornato"

    log "3/3 — .dev.vars..."
    set_dev_var "PROXY_SECRET" "$NEW_SECRET"
    ok ".dev.vars aggiornato"

    echo ""
    ok "Secret ruotato su tutti i servizi"
    ;;

  proxy-test)
    log "Test proxy in produzione..."

    PROXY_URL="$(get_toml_proxy_url)"
    if [[ -z "$PROXY_URL" ]]; then
      fail "PROXY_URL non configurata in wrangler.toml. Esegui prima: ./handle_project.sh setup"
    fi

    SECRET="$(get_dev_var PROXY_SECRET)"
    if [[ -z "$SECRET" ]]; then
      warn "PROXY_SECRET non trovato in .dev.vars. Inseriscilo manualmente:"
      read -r -s SECRET
      echo ""
      [[ -z "$SECRET" ]] && fail "PROXY_SECRET non fornito"
    fi

    VT_URL="http://www.viaggiatreno.it/infomobilita/resteasy/viaggiatreno/autocompletaStazione/nichelino"
    ENCODED=$(python3 -c "import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1],safe=''))" "$VT_URL")
    BAD_ENCODED=$(python3 -c "import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1],safe=''))" "http://evil.com/")

    log "1/3 — Senza secret (atteso 401)..."
    STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${PROXY_URL}?url=${ENCODED}")
    [[ "$STATUS" == "401" ]] && ok "401 ✓" || warn "Atteso 401, ricevuto $STATUS"

    log "2/3 — URL non consentita (atteso 403)..."
    STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
      -H "X-Proxy-Secret: $SECRET" "${PROXY_URL}?url=${BAD_ENCODED}")
    [[ "$STATUS" == "403" ]] && ok "403 ✓" || warn "Atteso 403, ricevuto $STATUS"

    log "3/3 — Proxy → ViaggiaTreno (atteso 200)..."
    HTTP_OUT=$(curl -s -w "\n%{http_code}" \
      -H "X-Proxy-Secret: $SECRET" "${PROXY_URL}?url=${ENCODED}")
    STATUS=$(echo "$HTTP_OUT" | tail -1)
    BODY=$(echo "$HTTP_OUT" | head -1)

    if [[ "$STATUS" == "200" ]]; then
      ok "200 — Proxy funzionante, ViaggiaTreno raggiungibile"
      echo "  Preview: ${BODY:0:120}..."
    elif [[ "$STATUS" == "403" ]]; then
      echo ""
      fail "VT risponde 403 — Alwaysdata è bloccato da Imperva. IP sfortunato — contatta support@alwaysdata.com per cambiare IP."
    else
      warn "Status: $STATUS — Body: ${BODY:0:120}"
    fi
    ;;

  *)
    usage
    exit 1
    ;;

esac
