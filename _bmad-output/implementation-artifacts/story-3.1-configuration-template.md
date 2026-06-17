---
baseline_commit: NO_VCS
status: review
---

# Story 3.1: Configuration template e secrets scaffold

## Story

As a deployer,
I want un template di configurazione completo con tutti i valori da personalizzare,
So that posso configurare il sistema senza dover leggere il codice sorgente.

## Acceptance Criteria

- AC1: `wrangler.toml` contiene tutte e 6 le variabili con placeholder/default documentati ✅ (fatto in 1.1)
- AC2: `[[kv_namespaces]]` ha `id = "REPLACE_WITH_YOUR_KV_NAMESPACE_ID"` ✅ (fatto in 1.1)
- AC3: `[triggers] crons = ["*/1 * * * *"]` presente ✅ (fatto in 1.1)
- AC4: `.dev.vars.example` esiste nella root con struttura dei secrets e commenti
- AC5: `.dev.vars` è in `.gitignore` ✅ (già presente)
- AC6: `.dev.vars.example` è committabile (non in .gitignore)

## Tasks/Subtasks

- [x] Task 1: Verificare wrangler.toml completo (già fatto in 1.1)
- [x] Task 2: Verificare .dev.vars in .gitignore (già presente)
- [x] Task 3: Creare `.dev.vars.example` con secrets template e commenti
- [x] Task 4: Verificare che `.dev.vars.example` NON sia in .gitignore

## Dev Agent Record

### Implementation Plan

Solo `.dev.vars.example` da creare. Tutto il resto già fatto.

### Debug Log

### Completion Notes

`wrangler.toml` e `.gitignore` già corretti da Story 1.1. Creato `.dev.vars.example` con istruzioni per ottenere TELEGRAM_TOKEN da @BotFather e ADMIN_CHAT_ID da @userinfobot. File verificato non-gitignored.

## File List

- `.dev.vars.example` (nuovo)

## Change Log

- 2026-06-16: Story 3.1 completata — .dev.vars.example con secrets template
