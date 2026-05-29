---
phase: 06-insights-polish-deploy
plan: 08
subsystem: deploy-infra
tags: [ci-cd, github-actions, railway, cloudflare-pages, sentry, devops, infrastructure]
status: partial
completion: task-1-done, task-2-awaits-human, task-3-deferred
wave: 4
depends_on: [06-05, 06-06, 06-07]
requires:
  - GitHub Actions runners (free tier)
  - Railway account (PostgreSQL+PostGIS, Redis, API service)
  - Cloudflare Pages account
  - Sentry organization (2 projects)
provides:
  - .github/workflows/ci.yml (PR validation: paths-filter + backend + frontend)
  - .github/workflows/deploy.yml (main deploy: drizzle push + railway up + CF Pages)
  - .github/workflows/lighthouse.yml (non-blocking perf check)
  - railway.json (RAILPACK builder + Bun start)
  - torre-de-controle/public/_redirects (SPA fallback)
  - README ## Deploy section (env vars table, deploy flow, troubleshooting)
  - 06-08-DEPLOY-CHECKLIST.md (operator step-by-step manual setup)
affects:
  - .gitignore (added .env.production exclusions)
tech-stack:
  added:
    - dorny/paths-filter@v3 (workflow conditional jobs)
    - oven-sh/setup-bun@v2 (Bun runtime in CI)
    - cloudflare/wrangler-action@v3 (Pages deploy — pages-action deprecated)
    - @railway/cli (deploy)
    - @lhci/cli (Lighthouse CI 0.15.x)
  patterns:
    - Drizzle --strict --verbose (NEVER --force per Pitfall #1)
    - Path-filtered conditional jobs (cost savings on partial PRs)
    - Sentry build-time source-maps upload + post-upload deletion
    - SPA fallback via Cloudflare _redirects
key-files:
  created:
    - .github/workflows/ci.yml
    - .github/workflows/deploy.yml
    - .github/workflows/lighthouse.yml
    - railway.json
    - torre-de-controle/public/_redirects
    - .planning/phases/06-insights-polish-deploy/06-08-DEPLOY-CHECKLIST.md
  modified:
    - .gitignore (+ .env.production exclusions)
    - README.md (+ ## Deploy section)
    - torre-de-controle/.env.example (comment refinement)
decisions:
  - D-08-01: oven-sh/setup-bun@v2 (not v1) — current major version per RESEARCH
  - D-08-02: cloudflare/wrangler-action@v3 explicit over deprecated cloudflare/pages-action
  - D-08-03: --dry-run em CI (PR preview), --strict --verbose em deploy (main) — NEVER --force
  - D-08-04: Lighthouse continue-on-error: true (D-28 — warn-only para MVP)
  - D-08-05: railway.json com RAILPACK builder + healthcheckPath "/" (não /api/health — root endpoint mais simples para MVP)
  - D-08-06: Task 2 BLOCKING — human action obrigatório antes do primeiro deploy automático funcionar
metrics:
  duration: "~25 min (Task 1 + Task 3 + checklist; Task 2 awaits human)"
  completed: 2026-05-29
  tasks_completed: 2 of 3 (Task 1, Task 3, partial Task 2 documentation)
  tasks_deferred: 1 (Task 3 deploy verification — post human setup)
commits:
  - hash: 064292f
    type: feat
    msg: "CI/CD workflows + Railway + CF Pages configs"
  - hash: 58257b1
    type: docs
    msg: "README ## Deploy section + .env.example final sync"
  - hash: 8817954
    type: docs
    msg: "deploy human-action checklist (Task 2)"
---

# Phase 6 Plan 8: Deploy Infra Summary

CI/CD GitHub Actions (PR + main paths) + Railway/Cloudflare Pages/Sentry configs entregues. Workflows válidos, sem anti-patterns (`cloudflare/pages-action` ou `--force` ausentes), README documenta setup completo. Deploy automático aguarda human action checklist (Railway+CF+Sentry accounts, 11 GH Secrets, VAPID keygen, primeiro drizzle-kit push manual — D-37).

## Scope completed (Task 1 + Task 3)

### Files created

1. **`.github/workflows/ci.yml`** — PR validation
   - `dorny/paths-filter@v3` separa jobs `backend` / `frontend` (cost savings em PRs parciais)
   - Backend: `oven-sh/setup-bun@v2` (bun 1.3.13) + typecheck + `drizzle-kit push --strict --verbose --dry-run`
   - Frontend: `actions/setup-node@v4` (node 20) + `npm ci` + lint + build

2. **`.github/workflows/deploy.yml`** — Main branch deploy
   - Path-filtered: backend job só roda se `api/**` ou `railway.json` mudou
   - Backend: `drizzle-kit push --strict --verbose` (HANG-on-destructive proteção per D-37) → `railway up --detach`
   - Frontend: `npm run build` com Sentry env vars (vite plugin auto-uploads source maps + deleta `.map`) → `cloudflare/wrangler-action@v3 pages deploy`

3. **`.github/workflows/lighthouse.yml`** — Non-blocking perf check
   - `continue-on-error: true` (D-28 — warn-only)
   - Roda lhci 0.15.x sobre `/login` (não-autenticada — dashboard/insights require auth, future: Puppeteer)

4. **`railway.json`** — Railway service config
   - `RAILPACK` builder + `bun run src/index.ts` start + healthcheck `/` (30s timeout) + restart `ON_FAILURE`

5. **`torre-de-controle/public/_redirects`** — Cloudflare Pages SPA fallback
   - Single line `/* /index.html 200` — direct URL navigation hits React Router

6. **`.planning/phases/06-insights-polish-deploy/06-08-DEPLOY-CHECKLIST.md`** — Operator manual setup
   - 9 sections (A-I): Railway, CF Pages, Sentry, VAPID, GH Secrets, BLOCKING drizzle push, seed, first deploy, completion report
   - Failure modes + secret rotation policy table

### Files modified

7. **`.gitignore`** — appended `.env.production` / `.env.local` exclusions (mitigation T-06.08-03)
8. **`README.md`** — appended `## Deploy` section after social-media links
   - Initial setup steps (1-7), env vars tables (backend + frontend), deploy flow, production checklist, operational notes (VAPID rotation rule, source-maps cleanup), troubleshooting
9. **`torre-de-controle/.env.example`** — comment refines build-time secret source (GH Secrets, não CF dashboard)
10. **`api/.env.example`** — verified complete from 06-01 (VAPID + SENTRY + JWT) — no change needed

## Anti-patterns confirmed absent

Grep-validated em todos os arquivos modificados:

- `cloudflare/pages-action` → aparece SOMENTE em comentários `# DEPRECATED, do not use` (intentional documentation)
- `--force` → aparece SOMENTE em comentários `NEVER --force` / `is forbidden` (rule docs)
- Nenhum secret comitado em workflows ou docs (todos via `${{ secrets.* }}` ou `<placeholder>`)
- Sem hardcoded URLs de produção (todas via env vars)

## YAML / JSON validation

Validados via `python -c "yaml.safe_load(...)"` e `node -e "JSON.parse(...)"`:

- ✓ `.github/workflows/ci.yml` parses
- ✓ `.github/workflows/deploy.yml` parses
- ✓ `.github/workflows/lighthouse.yml` parses
- ✓ `railway.json` valid JSON

## Threat mitigations applied

Todas mitigations listed em `<threat_model>` do PLAN.md cobertas:

| Threat ID  | Mitigation                                                                                |
| ---------- | ----------------------------------------------------------------------------------------- |
| T-06.08-01 | `--strict --verbose` no deploy + `--dry-run` no CI + README docs `NEVER --force`          |
| T-06.08-02 | Source maps deletados via vite.config (06-07) + Sentry plugin condicional via `SENTRY_AUTH_TOKEN` |
| T-06.08-03 | `.gitignore` exclui `.env.production` + `.env.local` (root + api + torre-de-controle)    |
| T-06.08-04 | RAILWAY_TOKEN scoped to single project (Railway dashboard) — documented in checklist     |
| T-06.08-05 | CLOUDFLARE_API_TOKEN scope Pages:Edit + Account:Read (no DNS modify) — documented        |
| T-06.08-06 | LHCI_GITHUB_APP_TOKEN risk-accepted (PR comments only, no deploy permission)              |
| T-06.08-07 | Sentry org access requires login + 2FA recommended em onboarding (operational note)       |
| T-06.08-08 | Task 2 BLOCKING — operator visualmente confirma SQL diff antes de aplicar (checklist F)  |
| T-06.08-09 | VAPID private key only em Railway secret store + checklist documenta NEVER rotate         |
| T-06.08-10 | `tracesSampleRate=0.1` (06-01) + D-42 quota alert at 80% (checklist C-7)                  |

## Deviations from Plan

None — plan executado exatamente como especificado.

## Task 2 — Awaiting human (not deviation, by design)

Plan declarou `autonomous: false` e Task 2 type `checkpoint:human-action gate="blocking"`. Conforme execution context, executor NÃO bloqueia esperando — gerou checklist completo para operador (`06-08-DEPLOY-CHECKLIST.md`) e retornou. Human deve:

1. Completar A-G do checklist (60-90 min estimado)
2. Reportar URLs + status via template em seção I
3. Trigger Task 3 (first deploy verification)

## Task 3 — Deferred

Per plan structure, Task 3 (first production deploy verification) executa APÓS Task 2 human action completo. Não executável por executor agora — necessita:
- Railway/CF/Sentry accounts ativas (Task 2A-C)
- GH Secrets configurados (Task 2E)
- VAPID keys geradas (Task 2D)
- Primeiro drizzle push manual (Task 2F)
- Seed thresholds (Task 2G)

Após completar Task 2, operador pode trigger Task 3 manualmente via:
```bash
git commit --allow-empty -m "chore: trigger first production deploy" && git push origin main
```

GH Actions roda `deploy.yml`, checklist H valida health endpoints + Sentry test errors + SPA routing.

## Production URLs (filled post-deploy)

- Backend: _TBD após Task 2 + Task 3_
- Frontend: _TBD após Task 2 + Task 3_
- Sentry torre-api: _TBD_
- Sentry torre-frontend: _TBD_

## Threat Flags

None — surface introduzido (CI/CD workflows + Railway/CF configs) plenamente coberto pelo threat_model do plan.

## Self-Check: PASSED

**Files created (verified via `test -f`):**
- ✓ `.github/workflows/ci.yml`
- ✓ `.github/workflows/deploy.yml`
- ✓ `.github/workflows/lighthouse.yml`
- ✓ `railway.json`
- ✓ `torre-de-controle/public/_redirects`
- ✓ `.planning/phases/06-insights-polish-deploy/06-08-DEPLOY-CHECKLIST.md`

**Files modified (git diff confirmed):**
- ✓ `.gitignore` (+5 lines)
- ✓ `README.md` (+138 lines `## Deploy` section)
- ✓ `torre-de-controle/.env.example` (comment refinement)

**Commits (verified via `git log`):**
- ✓ `064292f` — feat(06-08): CI/CD workflows + Railway + CF Pages configs
- ✓ `58257b1` — docs(06-08): README ## Deploy section + .env.example final sync
- ✓ `8817954` — docs(06-08): deploy human-action checklist (Task 2)

**Acceptance criteria (Task 1):**
- ✓ dorny/paths-filter@v3, oven-sh/setup-bun@v2, cloudflare/wrangler-action@v3, actions/checkout@v4, actions/setup-node@v4 — all exact versions
- ✓ `cloudflare/pages-action` ausente exceto em comentário "DEPRECATED"
- ✓ CI usa `--dry-run`; Deploy NÃO usa `--dry-run` mas USA `--strict --verbose`
- ✓ `--force` ausente exceto em comentários proibindo
- ✓ Lighthouse `continue-on-error: true` presente
- ✓ railway.json: schema URL + RAILPACK + `bun run src/index.ts`
- ✓ _redirects single line `/* /index.html 200`
- ✓ .gitignore inclui `.env.production`

**Acceptance criteria (Task 3):**
- ✓ README `## Deploy` section após sections existentes
- ✓ Documents Railway + CF + Sentry signup, env vars tables, deploy flow, production checklist, operational notes
- ✓ `.env.example` backend tem `VAPID_*` + `SENTRY_*` (verified — populated em 06-01)
- ✓ `.env.example` frontend tem `VITE_API_URL`, `VITE_SENTRY_DSN`, `VITE_VAPID_PUBLIC_KEY`
- ✓ README NÃO instrui `--force` (somente proíbe)
- ✓ README documenta VAPID non-rotation (Pitfall #3)
