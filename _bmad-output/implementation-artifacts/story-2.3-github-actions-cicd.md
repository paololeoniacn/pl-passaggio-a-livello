---
baseline_commit: NO_VCS
status: review
---

# Story 2.3: GitHub Actions CI/CD deploy

## Story

As a developer,
I want un workflow GitHub Actions che deploya automaticamente su Cloudflare ad ogni push su `main`,
So that il sistema è sempre aggiornato senza richiedere comandi manuali.

## Acceptance Criteria

- AC1: `.github/workflows/deploy.yml` esiste nel repository
- AC2: trigger su push a `main`
- AC3: usa `cloudflare/wrangler-action@v3` con `command: deploy`
- AC4: usa secret GitHub `CF_API_TOKEN` come `apiToken`
- AC5: il file contiene commenti che spiegano come configurare i secret necessari
- AC6: il workflow esegue anche `npm run test` e `npm run type-check` prima del deploy

## Tasks/Subtasks

- [x] Task 1: Creare `.github/workflows/deploy.yml`
- [x] Task 2: Verificare sintassi YAML valida

## Dev Notes

### Struttura workflow

```yaml
on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm run type-check
      - run: npm test
      - uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CF_API_TOKEN }}
          command: deploy
```

Nessun `accountId` esplicito — wrangler lo ricava dal token. Aggiungere commenti per i secret richiesti.

## Dev Agent Record

### Implementation Plan

File YAML puro, nessun test automatizzato possibile localmente. Verifico sintassi con `npx js-yaml` o manualmente.

### Debug Log

### Completion Notes

YAML valido (npx js-yaml). Workflow: checkout → setup-node@v4 con cache npm → npm ci → type-check → test → wrangler-action@v3 deploy. I test e il type-check prima del deploy garantiscono che nulla di rotto arrivi in produzione. Commenti nel file spiegano dove creare CF_API_TOKEN e come configurare i secret Wrangler post-deploy.

## File List

- `.github/workflows/deploy.yml`

## Change Log

- 2026-06-16: Story 2.3 completata — GitHub Actions CI/CD con type-check + test + deploy
