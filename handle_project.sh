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

usage() {
  echo ""
  echo "Passaggio a Livello Monitor — project helper"
  echo ""
  echo "Usage: ./handle_project.sh <command>"
  echo ""
  echo "Commands:"
  echo "  install       npm ci — installa le dipendenze"
  echo "  test          esegui la test suite completa"
  echo "  typecheck     verifica TypeScript senza compilare"
  echo "  dev           avvia il worker in locale (premi 't' per triggerare il cron)"
  echo "  deploy        type-check + test + deploy su Cloudflare"
  echo "  logs          stream dei log del worker in produzione (wrangler tail)"
  echo "  secret <KEY>  imposta un secret Cloudflare (es: secret TELEGRAM_TOKEN)"
  echo "  stations      scopri i codici stazione via autocompletaStazione"
  echo ""
}

cmd="${1:-}"

case "$cmd" in

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
    log "Avvio pipeline deploy..."

    log "1/3 — Type check..."
    npx tsc --noEmit
    ok "TypeScript OK"

    log "2/3 — Test..."
    npx vitest run
    ok "Test OK"

    log "3/3 — Deploy su Cloudflare..."
    npx wrangler deploy
    ok "Deploy completato"
    ;;

  logs)
    log "Streaming log worker in produzione (Ctrl+C per uscire)..."
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

  *)
    usage
    exit 1
    ;;

esac
