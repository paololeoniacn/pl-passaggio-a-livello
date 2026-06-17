---
stepsCompleted: [1, 2]
inputDocuments:
  - _bmad-output/planning-artifacts/briefs/brief-pl-passaggio-a-livello-2026-06-16/brief.md
workflowType: 'research'
lastStep: 1
research_type: 'technical'
research_topic: 'ViaggiaTreno API — affidabilità, latenza e robustezza per sistema di monitoraggio passaggi a livello'
research_goals: 'Validare se la latenza API è ≤2 minuti per garantire il vantaggio predittivo; identificare rischi di breaking changes e strategie di mitigazione; valutare alternative se l API risulta inaffidabile'
user_name: 'Paolo.leoni'
date: '2026-06-16'
web_research_enabled: true
source_verification: true
---

# Research Report: Technical

**Date:** 2026-06-16
**Author:** Paolo.leoni
**Research Type:** technical

---

## Research Overview

Ricerca tecnica sull'API ViaggiaTreno finalizzata a validare l'assunzione critica del brief: la finestra predittiva di 2–3 minuti prima della chiusura del passaggio a livello di Via Dega (Vinovo) dipende dalla latenza reale dell'API. Due agenti di ricerca paralleli hanno esaminato (1) gli endpoint ViaggiaTreno e la loro affidabilità, (2) le alternative regionali/nazionali per i treni SFM2 Trenitalia.

**Fonti principali:** dltmtt/viaggiatreno-api (GitHub, Jan 2026), bluviolin/TrainMonitor wiki (archiviato Mar 2025), monga/viaggiatreno_ha, MarcoBuster/railway-opendata, dati aperti GTT/Regione Piemonte, Transitland.

---

## Scope Confermato

- **Topic:** ViaggiaTreno API — affidabilità, latenza e robustezza per sistema di monitoraggio passaggi a livello
- **Obiettivi:** Validare latenza ≤2 minuti; identificare rischi breaking changes; valutare alternative
- **Scope Confirmed:** 2026-06-16

---

## 🚨 Finding Critico: Bug nell'URL del Codice Originale

**Confidence: HIGH**

Il codice presentato nel piano iniziale usa il path:
```
http://www.viaggiatreno.it/viaggiatrenonew/...
```

Questo path è **deprecato dal 2022** e restituisce un redirect alla homepage invece dei dati JSON. Il path corretto dal 2022 è:
```
http://www.viaggiatreno.it/infomobilita/resteasy/viaggiatreno/
```

Tutto il codice va aggiornato prima del deploy. Questo è il breaking change più documentato nella storia dell'API.

_Fonte: bluviolin/TrainMonitor issue #10 (episodio confermato May–Nov 2022); dltmtt/viaggiatreno-api README_

---

## Endpoint Stack Analysis

### Endpoint Raccomandato: `andamentoTreno` (non `partenze`)

**Confidence: HIGH**

Per rilevare l'avvicinamento di un treno a Vinovo, l'endpoint ottimale è `andamentoTreno`, non `partenze`.

```
GET /andamentoTreno/{originStationCode}/{trainNumber}/{departureDateMs}
```

**Perché è superiore a `partenze`:**
- `partenze` mostra treni in partenza da una stazione — utile per sapere cosa parte da Nichelino, ma non dice dove si trova il treno adesso
- `andamentoTreno` restituisce `fermate[]`, array di tutte le fermate con `effettiva` (timestamp reale) o `null` se non ancora raggiunta — permette di sapere esattamente se il treno ha superato Nichelino ma non ancora Candiolo/Vinovo

**Logica di rilevamento:**
```
Per ogni treno SFM2 attivo:
  → fermate[Nichelino].effettiva != null   → treno ha superato Nichelino
  → fermate[Vinovo/Candiolo].effettiva == null → non ancora a Vinovo
  → Stima arrivo = fermate[Vinovo].programmata + ritardo
  → Se stima_arrivo - adesso < soglia_minuti → notifica ⚠️
```

**Parametri:**
- `originStationCode`: codice `S\d{5}` della stazione di origine del treno
- `trainNumber`: numero treno (intero)
- `departureDateMs`: **mezzanotte del giorno di partenza in timezone Europe/Rome** (non l'ora di partenza)

Per ottenere `originStationCode` e `departureDateMs` da un numero treno:
```
GET /cercaNumeroTrenoTrenoAutocomplete/{trainNumber}
→ risposta: "3041 - MILANO ROGOREDO - 21/07/25|3041-S01820-1753048800000"
```

_Fonte: dltmtt/viaggiatreno-api (TypeScript schemas), monga/viaggiatreno_ha (Python, logica polling)_

### Endpoint Stazione

```
GET /autocompletaStazione/{prefix}      → text/plain, formato: NOME|SCODE
GET /cercaStazione/{prefix}             → JSON array
GET /dettaglioStazione/{code}/{region}  → JSON metadati completi
```

Codici stazione: pattern `S\d{5}`. Regione Piemonte = codice `1` (da verificare con `regione/{stationCode}`).

### Health Check

```
GET /statistiche/{anyTimestampMs}
→ {treniGiorno, treniCircolanti, ultimoAggiornamento}
```

Utile per verificare che l'API sia attiva prima di ogni ciclo di polling.

---

## Affidabilità e Latenza

### Modello di rilevamento: checkpoint, non GPS

**Confidence: HIGH**

L'API ViaggiaTreno **non è GPS-based**. Il tracking è checkpoint-based: Trenitalia rileva il treno al passaggio di ciascuna stazione (sistema SCMT/ERTMS). Conseguenze dirette:

- La latenza tra rilevamento reale e dati API dipende dalla **distanza tra stazioni**
- Nichelino e Candiolo sono le stazioni adiacenti a Vinovo: la finestra di rilevamento è esattamente quella tra due checkpoint contigui
- Se il treno ha appena superato Nichelino, `andamentoTreno` lo saprà entro ~1 minuto (aggiornamento cadenzato)
- Distanza Nichelino–Vinovo stimata: ~3 km. A 80 km/h → ~2.25 minuti di percorrenza

**Stima concreta del vantaggio predittivo:**
```
Treno passa Nichelino → rilevamento API (0–60s) → polling GAS (0–60s) → notifica Telegram
Latenza totale stima: 30–90 secondi
Finestra rimanente prima arrivo Vinovo: 2.25 min - 0.5÷1.5 min = 0.75–1.75 minuti
```

**La finestra predittiva di 2–3 minuti è ottimistica.** Il range realistico è **1–2 minuti**, con varianza alta dipendente dal timing del polling e dalla latenza API effettiva.

### Freschezza dei dati

**Confidence: MEDIUM**

- dltmtt README: i dati `partenze`/`arrivi` "cambiano ogni minuto" (non documentato ufficialmente)
- L'endpoint `statistiche` espone `ultimoAggiornamento` — monitorabile per misurare la cadenza di refresh reale
- L'API restituisce dati solo per treni del giorno corrente (timezone Europe/Rome)
- Fuori dalla finestra operativa del treno (nessuna corsa attiva) → dati vuoti o non significativi

---

## Rate Limiting

**Confidence: MEDIUM-LOW**

Nessuna policy documentata ufficialmente. Dati osservazionali:

- L'API non richiede autenticazione né User-Agent specifico
- Errori 403 si verificano (dltmtt implementa retry con backoff esponenziale fino a 120s, max 10 retry)
- La soglia di trigger per il 403 è **sconosciuta** — nessun dato numerico confermato
- Il client dltmtt usa 60 req/s max come auto-throttling difensivo (non un limite server noto)

**Per questo progetto:** polling ogni 60 secondi su 2–3 treni = ~3 richieste/minuto. Molto al di sotto di qualsiasi soglia ragionevole. Il rischio 403 è basso in uso normale.

---

## Breaking Changes — Storico

| Data | Cambiamento | Impatto |
|---|---|---|
| 2022 (May–Nov) | Base path `/viaggiatrenonew/` → `/infomobilita/` | **Critico** — tutto il codice pre-2022 smette di funzionare silenziosamente |
| 2021 (Mag) | `andamentoTreno` acquisisce parametro timestamp obbligatorio | Breaking per chiamate senza timestamp |
| Pre-2024 | Endpoint `soluzioniViaggioNew` rimosso (→ 404) | Non rilevante per questo progetto |
| Aug 2025 | Campo `subTitle` può essere `null` in `andamentoTreno` | Parse crash se non gestito |

**Pattern identificato:** breaking changes storicamente ~1/anno, non annunciati, rilevati dalla community con lag di settimane/mesi. Il progetto deve implementare error handling esplicito e logging per rilevare rotture rapidamente.

---

## Alternative a ViaggiaTreno per SFM2

**Conclusione: nessuna alternativa praticabile.** ViaggiaTreno è l'unica fonte per la posizione real-time dei treni SFM2 (Trenitalia).

| Fonte | RT per SFM2 | Note |
|---|---|---|
| ViaggiaTreno | ✅ Sì | Unica fonte, non documentata |
| iechub.rfi.it | ⚠️ Parziale | Partenze/arrivi per stazione, non posizione; endpoint non documentato |
| GTT GTFS-RT | ❌ No | Copre solo linee GTT (Torino–Ceres, Settimo–Pont) — SFM2 è Trenitalia |
| Regione Piemonte GTFS | ❌ Solo orari | Static schedule, nessun RT |
| Trenitalia API ufficiale | ❌ Non esiste | Nessun developer program |
| OpenRailwayMap | ❌ No | Solo infrastruttura ferroviaria |

**iechub.rfi.it come fallback secondario:**
```
https://iechub.rfi.it/ArriviPartenze/arrivalsdepartures/Monitor?placeId=XXXX&arrivals=True
```
Mostra partenze/arrivi per stazione con ritardi. Non documentato, scraping only, utile come crosscheck ma non come fonte primaria. Il `placeId` per Nichelino/Candiolo va scoperto empiricamente.

---

## Librerie Open Source Rilevanti

| Progetto | Linguaggio | Stato | Rilevanza |
|---|---|---|---|
| [dltmtt/viaggiatreno-api](https://github.com/dltmtt/viaggiatreno-api) | TypeScript | Attivo (Jan 2026) | Migliore documentazione endpoint + JSON schemas |
| [MarcoBuster/railway-opendata](https://github.com/MarcoBuster/railway-opendata) | Python | Attivo | Scraping completo inclusi treni regionali SFM; utile per studio del pattern |
| [monga/viaggiatreno_ha](https://github.com/monga/viaggiatreno_ha) | Python | Attivo | Esempio concreto di polling `andamentoTreno` con timezone handling |
| [bluviolin/TrainMonitor wiki](https://github.com/bluviolin/TrainMonitor/wiki/API-del-sistema-Viaggiatreno) | Python | Archiviato Mar 2025 | Miglior documentazione storica degli endpoint |

---

## Raccomandazioni per l'Implementazione

### 1. Correggere subito il base URL
```javascript
// ❌ SBAGLIATO (nel codice originale)
"http://www.viaggiatreno.it/viaggiatrenonew/..."

// ✅ CORRETTO
"http://www.viaggiatreno.it/infomobilita/resteasy/viaggiatreno/"
```

### 2. Passare da `partenze` ad `andamentoTreno`
La logica di rilevamento basata su `partenze` con `statoTreno === "IN_VIAGGIO"` è fragile. Usare `andamentoTreno` + analisi `fermate[]` per una rilevazione precisa del checkpoint Nichelino→Vinovo.

### 3. Costruire `departureDateMs` correttamente
```javascript
// Mezzanotte del giorno corrente in Europe/Rome
const now = new Date();
const romeMidnight = new Date(now.toLocaleDateString('it-IT', {timeZone: 'Europe/Rome'}) + ' 00:00:00');
// Convertire in ms epoch
```

### 4. Aggiungere health check prima del polling
Chiamare `statistiche` all'avvio e verificare `ultimoAggiornamento` recente prima di procedere con le query sui treni.

### 5. Gestire `null` su campi critici
In particolare `subTitle`, `effettiva`, `arrivoReale` in `fermate[]` — tutti nullable.

### 6. Logging degli errori 403 e dei cambiamenti strutturali
Implementare logging verso Telegram stesso (messaggio di admin) se le chiamate API iniziano a fallire, per rilevare breaking changes rapidamente.

---

## Ricalibrazione Criteri di Successo

Alla luce di questa ricerca, la soglia "zero falsi negativi 07:00–09:00" resta valida come obiettivo, ma la finestra predittiva nel brief va aggiornata:

| Parametro | Brief attuale | Stima post-ricerca |
|---|---|---|
| Vantaggio predittivo dichiarato | 2–3 minuti | **1–2 minuti** (realistico) |
| Dipendenza critica | Latenza API | Checkpoint Nichelino + polling interval |
| Rischio principale | API lag | Distanza stazione–PL + timing polling |

La v1 resta sperimentale. La validazione empirica (misurare `oraUltimoRilevamento` vs orario reale passaggio) è il passo successivo obbligatorio dopo il primo deploy.

---

_Report completato: 2026-06-16_
_Fonti verificate: dltmtt/viaggiatreno-api, bluviolin/TrainMonitor, monga/viaggiatreno_ha, MarcoBuster/railway-opendata, GTT aperTO, Transitland, RFI iechub_
