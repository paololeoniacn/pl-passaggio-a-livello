# Passaggio a Livello Monitor — Claude context

Cloudflare Worker che monitora i treni SFM2 (Nichelino→Candiolo) e notifica via Telegram quando un treno si avvicina al passaggio a livello di Via Dega.

## Stack

- **Runtime**: Cloudflare Workers (TypeScript)
- **State**: Cloudflare KV (`PL_STATE`)
- **Notifiche**: Telegram Bot API (canale pubblico + admin privato)
- **Proxy**: PHP su Alwaysdata (bypass WAF ViaggiaTreno)
- **API treni**: ViaggiaTreno (viaggiatreno.it)

## Struttura

```
src/
  index.ts              # entry point: fetch handler (HTTP + webhook) + scheduled cron
  types.ts              # WorkerEnv, PlState, VTPartenza, VTAndamento, TrainStop
  api/viaggiatreno.ts   # fetchPartenze, fetchAndamentoTreno
  detector/approach.ts  # isApproaching (Nichelino passato, Candiolo non ancora)
  state/pl-state.ts     # KV helpers: stato PL, pausa, errori, lastSuccess, config runtime
  notifier/telegram.ts  # sendTelegram
  utils/timezone.ts     # getRomeMidnightMs, getRomeHour, isActiveHour
proxy/
  proxy.php             # proxy PHP su Alwaysdata, richiede X-Proxy-Secret
wrangler.toml           # cron */1 * * * *, vars, KV binding
```

## Comandi — usa sempre handle_project.sh

```bash
./handle_project.sh deploy                  # typecheck + test + deploy su Cloudflare
./handle_project.sh dev                     # worker locale (premi 't' per triggerare cron)
./handle_project.sh test                    # vitest run
./handle_project.sh typecheck               # tsc --noEmit
./handle_project.sh logs                    # wrangler tail (log produzione)

./handle_project.sh status                  # invia /status via Telegram
./handle_project.sh pause                   # sospendi monitoring (HTTP)
./handle_project.sh resume                  # riprendi monitoring (HTTP)

./handle_project.sh telegram-setup-commands # aggiorna menu / comandi nel bot
./handle_project.sh telegram-webhook-setup  # (ri)registra webhook Telegram
./handle_project.sh telegram-test           # test bot admin + canale

./handle_project.sh proxy-deploy            # re-upload proxy.php su Alwaysdata
./handle_project.sh proxy-rotate            # ruota PROXY_SECRET ovunque
./handle_project.sh proxy-test              # verifica proxy → ViaggiaTreno

./handle_project.sh secret <KEY>            # imposta wrangler secret
./handle_project.sh setup                   # primo avvio completo
```

Dopo ogni modifica al codice: `./handle_project.sh deploy`
Dopo modifiche ai comandi del bot: `./handle_project.sh deploy && ./handle_project.sh telegram-setup-commands`

## Comandi bot Telegram (dal proprio chat admin)

| Comando | Effetto |
|---|---|
| `/status` | stato PL, monitoring, ultima chiamata VT, write_interval |
| `/stop` | sospende monitoring |
| `/riavvia` | riprende monitoring |
| `/set write_interval <N>` | scrive lastSuccess ogni N minuti (default 5, min 1) |
| `/start` | lista comandi |

## Limiti KV Cloudflare free

- 100.000 read/giorno, **1.000 write/giorno**
- Il cron gira ogni minuto (840 cicli attivi/giorno, ore 7–21)
- `resetErrorCount` scrive solo se il contatore è > 0
- `writeLastSuccess` scrive solo quando `minuti % write_interval == 0`
- Per ridurre le write: `/set write_interval 10` dal bot

## Segreti (wrangler secrets, non in repo)

- `TELEGRAM_TOKEN` — token bot
- `ADMIN_CHAT_ID` — chat ID admin (messaggi privati)
- `PROXY_SECRET` — header auth per proxy.php

## Config runtime (KV, modificabile via bot /set)

| Chiave | Default | Descrizione |
|---|---|---|
| `write_interval` | 5 | ogni quanti minuti scrivere lastSuccess in KV |
