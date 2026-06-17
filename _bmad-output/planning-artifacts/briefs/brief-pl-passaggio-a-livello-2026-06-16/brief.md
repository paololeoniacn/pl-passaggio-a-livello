---
title: "Passaggio a Livello Monitor — Vinovo"
status: draft
created: 2026-06-16
updated: 2026-06-16
research: technical-viaggiatreno-api-affidabilita-latenza-research-2026-06-16.md
stack: Cloudflare Workers + Cloudflare KV + Telegram + Git
---

# Product Brief: Passaggio a Livello Monitor

## Executive Summary

Il passaggio a livello di Via Dega a Vinovo (SFM2, linea Torino–Pinerolo) è un punto di congestione quotidiano che impatta centinaia di residenti. Con 30–35 treni/giorno per direzione e chiusure che raggiungono 4–6 cicli/ora nelle ore di punta, l'attesa media è 3–5 minuti con picchi di 10. L'informazione proattiva non esiste: l'unica soluzione comunitaria locale dipende da segnalazioni manuali di chi è già bloccato.

Questo progetto costruisce un sistema di monitoraggio autonomo e predittivo che avvisa i residenti 1–2 minuti prima della chiusura delle sbarre, senza dipendere da alcun reporter umano. L'infrastruttura è completamente gratuita (Cloudflare Workers + Telegram), serverless e autosufficiente. Il codice è open source su Git: chiunque può clonarlo, configurarlo e deployarlo in 30 minuti.

Il momento è adesso: il problema è quotidiano, la tecnologia è disponibile e gratuita, e nessuna soluzione autonoma esiste per questo caso d'uso in Italia.

## Il Problema

Ogni mattina, centinaia di residenti di Vinovo percorrono Via Dega. Il passaggio a livello si chiude ogni 20–30 minuti durante le ore di punta. L'attesa varia tra 3 e 10 minuti, senza che l'automobilista sappia se il treno è appena passato o sta arrivando.

La scena tipica: ore 8:05, figlio a scuola entro le 8:10, sbarre già abbassate. Nessuna informazione disponibile. La strada alternativa aggiunge 8 minuti. La decisione — aspettare o deviare — si prende alla cieca, quasi sempre troppo tardi.

Il comportamento esistente è indicativo della gravità: chi abita nelle vicinanze ha già modificato i propri percorsi abituali per evitare il passaggio, rinunciando a itinerari più diretti. Non è un fastidio minore — è un vincolo strutturale che altera le abitudini di mobilità quotidiana.

L'unica soluzione comunitaria esistente è un'app web su hosting gratuito Google che raccoglie segnalazioni manuali. Funziona solo se qualcuno è già bloccato, ha il telefono in mano e segnala. È reattiva, dipendente dall'umano presente, non predittiva.

## La Soluzione

Un Cloudflare Worker esegue ogni 60 secondi (cron trigger) e interroga l'API ViaggiaTreno sullo stato dei treni SFM2 nelle stazioni di Nichelino e Candiolo — le stazioni immediatamente a nord e sud di Vinovo. Quando un treno ha superato Nichelino ma non ancora Vinovo (rilevato via endpoint `andamentoTreno`), il sistema invia una notifica al canale Telegram del paese prima che le sbarre scendano.

Due tipi di notifica:
- ⚠️ **PL in chiusura** — treno in avvicinamento; scegli il percorso alternativo prima di partire
- ✅ **PL libero** — treno transitato; puoi procedere

Attivo solo nelle ore 07:00–21:00. Lo stato (aperto/chiuso) è persisto su Cloudflare KV per eliminare notifiche duplicate. Il codice è versionato su Git (repository pubblico): deploy tramite `wrangler` CLI. Nessun hardware, nessun server da gestire, nessuna app da installare: gli utenti si iscrivono al canale Telegram e ricevono notifiche push native.

## Cosa Lo Rende Diverso

**Autonomo vs. reattivo.** L'unica alternativa locale richiede un reporter umano già bloccato in coda. Questo sistema non dipende da nessuno.

**Predittivo vs. descrittivo.** L'avviso arriva prima della chiusura. La finestra di 1–2 minuti (validata empiricamente: tracking checkpoint-based, non GPS) è sufficiente per una decisione di percorso da casa o prima di imboccare la strada.

**Zero infrastruttura.** Nessun server da mantenere, nessun costo fisso, nessuna app da pubblicare. Cloudflare Workers free tier: 100.000 richieste/giorno (utilizzo previsto: ~1.440/giorno). Cloudflare KV free tier: 100.000 letture/giorno, 1.000 scritture/giorno — abbondantemente sufficiente.

**Replicabile per design.** Repository Git pubblico: `git clone`, configura 4 variabili in `wrangler.toml`, esegui `wrangler deploy`. Chiunque conosca Git e abbia un account Cloudflare (gratuito) può deployare la propria istanza in 30 minuti.

## Chi Serve

**Utenti primari — residenti di Vinovo:** Chiunque percorra Via Dega regolarmente, in particolare nelle fasce 07:00–09:00 e 17:00–19:00. Non richiedono competenze tecniche: bastano Telegram e l'iscrizione al canale. Il valore è immediato: eliminare la paralisi decisionale al passaggio a livello.

**Utenti secondari — deployer:** Sviluppatori con familiarità con Git e Cloudflare Workers che vivono vicino a un altro passaggio a livello in Italia. Il contratto è esplicito: `git clone`, README con istruzioni passo-passo, 4 variabili in `wrangler.toml`, `wrangler deploy`, 30 minuti di setup, nessun supporto garantito dal maintainer.

## Criteri di Successo

| Criterio | Soglia minima | Target |
|---|---|---|
| Falsi positivi | ≤ 2/settimana | < 1/settimana |
| Falsi negativi 07:00–09:00 | 0 per 2+ settimane consecutive | 0 permanente |
| Retention dopo 1 mese | Iscritto e attivo | Non discritto |
| Impatto comportamentale | ≥ 1 decisione di percorso cambiata | Uso abituale del canale per pianificare gli spostamenti |

I falsi negativi mattutini sono la soglia critica: 2 mancati avvisi consecutivi nelle ore di punta rendono il sistema inutile per il caso d'uso principale.

## Scope v1

**In scope:**
- Script singolo per un singolo passaggio a livello
- Cloudflare Worker con cron trigger ogni 60 secondi
- Polling ViaggiaTreno API (endpoint `andamentoTreno`, rilevazione checkpoint Nichelino→Candiolo)
- Notifiche Telegram (⚠️ chiusura + ✅ apertura)
- Gestione stato via Cloudflare KV (anti-spam)
- Filtro orario configurabile (default 07:00–21:00)
- Repository Git pubblico + README con setup in 4 variabili (`wrangler.toml`)

**Fuori scope v1:**
- App mobile (iOS/Android)
- Mappa o visualizzazione grafica
- Storico passaggi e analytics
- Notifiche WhatsApp o altri canali
- Gestione multi-passaggio a livello in un singolo script
- Sistema di supporto, issue tracking, o community di maintainer

**Assunzione critica parzialmente validata (ricerca tecnica 2026-06-16):** L'API ViaggiaTreno è non documentata e soggetta a breaking changes storici (breaking confermato 2022: cambio base path). Il tracking è checkpoint-based, non GPS: la finestra predittiva reale è 1–2 minuti (non 2–3), determinata dalla distanza Nichelino–Vinovo (~3 km) meno la latenza di polling. L'endpoint corretto per la rilevazione è `andamentoTreno` (non `partenze`). Nessuna alternativa esiste per i treni SFM2 Trenitalia. La v1 resta sperimentale finché la latenza effettiva non è misurata sul campo.

## Vision

Un'infrastruttura civica distribuita: ogni passaggio a livello problematico in Italia ha il suo script deployato autonomamente da un residente locale. Nessuna azienda proprietaria, nessun server centrale, nessun costo ricorrente. GitHub come unico punto di coordinamento. La rete cresce per clonazione diretta, non per crescita organizzativa.
