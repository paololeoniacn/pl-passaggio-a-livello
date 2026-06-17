---
title: 'Proxy Layer WAF Bypass'
type: 'feature'
created: '2026-06-17'
status: 'done'
baseline_commit: 'NO_VCS'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Imperva WAF blocca tutti gli IP hyperscaler (AWS/GCP/Azure/CF AS13335) con cui CF Workers fa fetch verso ViaggiaTreno, rendendo il sistema non funzionante in produzione.

**Approach:** Interporre un proxy HTTP leggero su Fly.io (AS396946, non in blacklist Imperva) tra il Worker e ViaggiaTreno. Il Worker chiama il proxy passando l'URL target come query param; il proxy valida, forwarda, ritorna il JSON. Fallback PHP per Alwaysdata incluso come file statico.

## Boundaries & Constraints

**Always:**
- Validare che l'URL target inizi con `http://www.viaggiatreno.it/` — nessun open proxy
- `PROXY_SECRET` mai in `wrangler.toml` — solo via `wrangler secret put`
- Se `PROXY_URL` è vuota/assente, `vtFetch` chiama ViaggiaTreno direttamente (fallback sviluppo locale)
- Il proxy è stateless — nessun caching, forward puro

**Ask First:**
- Se Fly.io risulta bloccato da Imperva in fase di test, chiedere prima di switchare all'alternativa PHP

**Never:**
- Introdurre dipendenze npm aggiuntive nel Worker (zero nuovi package in `package.json` radice)
- Modificare la logica di business (approach detection, state machine, notifiche)
- Aggiungere caching lato proxy

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Proxy configurato, VT risponde 200 | `PROXY_URL` settata, VT OK | JSON passthrough al Worker | N/A |
| `PROXY_URL` assente | env senza `PROXY_URL` | vtFetch chiama VT direttamente | N/A |
| URL target non-VT | `?url=http://evil.com/...` | proxy risponde 403 | Worker riceve errore HTTP 403 |
| Secret header mancante/errato | `X-Proxy-Secret` assente o sbagliato | proxy risponde 401 | Worker lancia Error con status 401 |
| VT risponde 403 (WAF blocca il proxy) | IP proxy in blacklist Imperva | vtFetch lancia `Error HTTP 403` | Error propagato all'error handler esistente |

</frozen-after-approval>

## Code Map

- `src/types.ts` -- aggiungere `PROXY_URL?: string` e `PROXY_SECRET?: string` a `WorkerEnv`
- `src/api/viaggiatreno.ts` -- modificare `vtFetch` e `fetchAndamentoTreno` per accettare `env` e routare via proxy
- `wrangler.toml` -- aggiungere `PROXY_URL = ""` in `[vars]` (placeholder vuoto = direct mode)
- `.dev.vars.example` -- aggiungere `PROXY_SECRET=` e `PROXY_URL=` come commento/placeholder
- `proxy/index.js` -- nuovo: HTTP server Node.js che forwarda a VT con auth e validazione URL
- `proxy/package.json` -- nuovo: minimal, solo `"type": "module"`
- `proxy/fly.toml` -- nuovo: configurazione Fly.io app
- `proxy/Dockerfile` -- nuovo: immagine Node 20 Alpine
- `proxy/proxy.php` -- nuovo: fallback PHP per Alwaysdata

## Tasks & Acceptance

**Execution:**
- [x] `src/types.ts` -- aggiungere `PROXY_URL?: string` e `PROXY_SECRET?: string` a `WorkerEnv` -- i nuovi env binding devono essere tipizzati
- [x] `src/api/viaggiatreno.ts` -- aggiungere parametro `env: WorkerEnv` a `vtFetch` e `fetchAndamentoTreno`; routare via `${env.PROXY_URL}?url=${encodeURIComponent(url)}` con header `X-Proxy-Secret` quando `env.PROXY_URL` è definita e non vuota -- bypass WAF
- [x] `wrangler.toml` -- aggiungere `PROXY_URL = ""` in `[vars]` con commento -- placeholder vuoto = modalità diretta
- [x] `.dev.vars.example` -- aggiungere `PROXY_SECRET=changeme` e commento su `PROXY_URL` -- documentare le nuove variabili
- [x] `proxy/index.js` -- nuovo server HTTP Node.js ESM: GET `/?url=<encoded>`, valida prefisso VT, valida `X-Proxy-Secret` vs `process.env.PROXY_SECRET`, forwarda con User-Agent browser, ritorna JSON -- cuore del proxy
- [x] `proxy/package.json` -- nuovo: `{"type":"module","scripts":{"start":"node index.js"}}` -- runtime ESM
- [x] `proxy/fly.toml` -- nuovo: `app = "pl-passaggio-a-livello-proxy"`, `[http_service] internal_port = 8080` -- deploy Fly.io
- [x] `proxy/Dockerfile` -- nuovo: `FROM node:20-alpine`, copia `index.js` e `package.json`, `CMD ["node","index.js"]` -- containerizzazione
- [x] `proxy/proxy.php` -- nuovo: fallback PHP Alwaysdata, valida prefisso VT, valida header secret, `file_get_contents` con User-Agent -- alternativa se Fly.io è bloccato

**Acceptance Criteria:**
- Given `PROXY_URL` vuota, when il Worker chiama `fetchPartenze`, then la chiamata va direttamente a `www.viaggiatreno.it` senza header `X-Proxy-Secret`
- Given `PROXY_URL` configurata e proxy attivo, when il Worker chiama `fetchAndamentoTreno`, then la richiesta HTTP esce dal proxy (verificabile nei log Fly.io)
- Given URL target non-VT, when il proxy riceve la richiesta, then risponde 403 senza effettuare il forward
- Given `X-Proxy-Secret` errato, when il proxy riceve la richiesta, then risponde 401
- Given `PROXY_SECRET` non settata su Fly.io, when il proxy riceve qualsiasi richiesta, then risponde 500 con messaggio di configurazione mancante
- Given `npm run typecheck` (o `tsc --noEmit`), when eseguito, then zero errori TypeScript

## Design Notes

**Firma `vtFetch` aggiornata:**
```typescript
async function vtFetch<T>(url: string, env: WorkerEnv): Promise<T> {
  const target = env.PROXY_URL
    ? `${env.PROXY_URL}?url=${encodeURIComponent(url)}`
    : url;
  const headers: Record<string, string> = { "User-Agent": "Mozilla/5.0 ..." };
  if (env.PROXY_URL && env.PROXY_SECRET) headers["X-Proxy-Secret"] = env.PROXY_SECRET;
  const res = await fetch(target, { headers });
  ...
}
```

**`fetchAndamentoTreno`** attualmente non riceve `env` — va aggiunto come parametro e aggiornati i caller in `src/index.ts`.

## Verification

**Commands:**
- `npm run typecheck` (o `npx tsc --noEmit`) -- expected: zero errori
- `npm test` -- expected: tutti i test esistenti passano (nessun test nuovo richiesto dalla spec)

**Manual checks:**
- `proxy/index.js`: chiamare `curl "http://localhost:8080/?url=http%3A%2F%2Fwww.viaggiatreno.it%2Finfomobilita%2Fresteasy%2Fviaggia" -H "X-Proxy-Secret: test"` e ricevere JSON o errore VT (non 403/401 del proxy)
- `proxy/index.js`: chiamare senza header secret → deve rispondere 401
- `proxy/index.js`: chiamare con URL non-VT → deve rispondere 403

## Spec Change Log

