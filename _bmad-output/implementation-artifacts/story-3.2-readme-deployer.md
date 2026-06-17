---
baseline_commit: NO_VCS
status: review
---

# Story 3.2: README deployer

## Story

As a deployer,
I want un README che mi guidi dal clone al primo deploy in ≤30 minuti,
So that posso deployare il mio sistema senza supporto del maintainer.

## Acceptance Criteria

- AC1: 7 passi dal clone al deploy (pre-requisiti, clone, KV, codici stazione, variabili, secrets, deploy)
- AC2: curl di esempio per `autocompletaStazione`
- AC3: sezione "Canale Telegram" con istruzioni per TELEGRAM_CHAT_ID via @userinfobot
- AC4: sezione "Fork per altro passaggio a livello" con le 3 variabili da cambiare
- AC5: no tutorial per non-tecnici, no promesse di supporto

## Tasks/Subtasks

- [x] Task 1: Creare `README.md` con i 7 passi e le sezioni richieste
- [x] Task 2: Verificare full test suite ancora verde

## Dev Agent Record

### Completion Notes

79/79 test passati. README con 7 passi (pre-requisiti → clone → KV → codici stazione con curl → wrangler.toml → secrets → deploy), sezione Telegram con istruzioni @userinfobot e @BotFather, sezione CI/CD GitHub Actions, sezione Fork con le 3 variabili. Nessun tutorial per non-tecnici, nessuna promessa di supporto. Nota sperimentale in fondo.

## File List

- `README.md`

## Change Log

- 2026-06-16: Story 3.2 completata — README deployer, full suite 79/79
