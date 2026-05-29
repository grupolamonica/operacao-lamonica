# 06-08 — Deploy Manual Checklist (Task 2)

**Status:** Awaits human action — workflows + configs estão prontos no repo, mas o deploy automático não inicia até este checklist completar.

**Owner:** Operador humano (não automatizável — requer credenciais de contas externas).

**Estimativa:** 60-90 min (primeira vez).

**Risco crítico:** D-37 — primeiro `drizzle-kit push` em produção. Sempre revisar SQL diff antes de confirmar.

---

## Pré-requisitos

- [ ] Acesso à conta GitHub do repositório (admin para configurar Secrets)
- [ ] Cartão de crédito (Railway exige para evitar quota anti-abuse; CF Pages e Sentry free funcionam sem)
- [ ] Email para receber alertas Sentry quota
- [ ] Bun OU Docker (para gerar VAPID keys e rodar primeira migration)

---

## A) Railway setup

- [ ] Visit https://railway.app e sign up/log in
- [ ] **New Project** → **Empty Project** → nome `torre-de-controle`
- [ ] **New** → **Database** → **Add PostgreSQL**
  - [ ] Após provisioning, abrir PostgreSQL service → **Data** ou **Query** tab → executar:
    ```sql
    CREATE EXTENSION IF NOT EXISTS postgis;
    ```
- [ ] **New** → **Database** → **Add Redis**
- [ ] **New** → **GitHub Repo** → selecionar este repo
  - Railway detecta `railway.json` automaticamente (RAILPACK builder + Bun start)
- [ ] Em API service → **Variables** tab, setar ALL backend env vars:
  - `JWT_SECRET` — gerar via `openssl rand -hex 32` (32-byte hex)
  - `JWT_EXPIRES_IN=24h`
  - `NODE_ENV=production`
  - `PORT` — Railway injeta automaticamente (não setar)
  - `FRONTEND_URL=https://torre-de-controle.pages.dev` (ajustar para custom domain depois)
  - `LOG_LEVEL=info`
  - `TELEMETRY_API_KEY` — rotacionar do dev key (random string)
  - `VAPID_PUBLIC_KEY` — preencher após passo D
  - `VAPID_PRIVATE_KEY` — preencher após passo D
  - `VAPID_SUBJECT=mailto:admin@torredecontrole.com`
  - `SENTRY_DSN` — preencher após passo C
  - `SENTRY_ENVIRONMENT=production`
  - **NÃO setar manualmente:** `DATABASE_URL`, `REDIS_URL`, `PORT` (Railway auto-injeta)
- [ ] Copiar Railway → GH Secrets:
  - [ ] **Service ID** (Service → Settings → Service ID) → GH Secret `RAILWAY_SERVICE_ID`
  - [ ] **Project token** (Account → Tokens → Create new) → GH Secret `RAILWAY_TOKEN`
  - [ ] **DATABASE_URL** (PostgreSQL → Variables → DATABASE_URL → copy) → GH Secret `DATABASE_URL_PROD`

## B) Cloudflare Pages setup

- [ ] Visit https://dash.cloudflare.com
- [ ] **Workers & Pages** → **Create application** → **Pages** → **Connect to Git**
- [ ] Repository: este repo. Project name: `torre-de-controle`
- [ ] Build settings:
  - Framework preset: **None**
  - Build command: `cd torre-de-controle && npm ci && npm run build`
  - Build output: `torre-de-controle/dist`
  - Root directory: `/` (deixar em branco)
- [ ] Skip env vars no CF dashboard (GH Actions injeta `VITE_*` em build time)
- [ ] First deploy provavelmente falha (build sem secrets) — OK, próximos pushes via GH Actions corrigem
- [ ] Copiar para GH Secrets:
  - [ ] **Account ID** (sidebar direita) → GH Secret `CLOUDFLARE_ACCOUNT_ID`
  - [ ] **API Token** (My Profile → API Tokens → Create Token → permissions: Account → Cloudflare Pages: Edit + Account Settings: Read) → GH Secret `CLOUDFLARE_API_TOKEN`

## C) Sentry setup

- [ ] Visit https://sentry.io e sign up/log in
- [ ] Criar organização (ou usar existente). Anotar **org slug** (aparece na URL)
- [ ] Criar 2 projects:
  - [ ] Project 1: nome `torre-api`, platform **Node.js**
  - [ ] Project 2: nome `torre-frontend`, platform **React**
- [ ] Para cada project → **Settings** → **Client Keys (DSN)** → copiar DSN
- [ ] **Settings** → **Account** → **API** → **Auth Tokens** → **Create New Token**
  - Scopes mínimos: `project:releases`, `project:write`
  - [ ] Salvar como GH Secret `SENTRY_AUTH_TOKEN`
- [ ] Persistir:
  - [ ] DSN do `torre-api` → Railway env var `SENTRY_DSN` (passo A)
  - [ ] DSN do `torre-frontend` → GH Secret `VITE_SENTRY_DSN`
  - [ ] Org slug → GH Secret `SENTRY_ORG`
- [ ] **Settings** → **Subscription** → **Quota** → setar alerta em **80%** (D-42)

## D) Gerar VAPID keys (ONCE — NÃO regenerar nunca per Pitfall #3)

Rodar localmente:

```bash
# Via Docker (recomendado, não precisa Bun instalado)
docker compose exec api bunx web-push generate-vapid-keys --json

# OU via Bun local (se 1.3.13 instalado)
cd api && bunx web-push generate-vapid-keys --json
```

Output exemplo: `{ "publicKey": "BL...", "privateKey": "..." }`

- [ ] `publicKey` → Railway env `VAPID_PUBLIC_KEY` + GH Secret `VITE_VAPID_PUBLIC_KEY`
- [ ] `privateKey` → Railway env `VAPID_PRIVATE_KEY` (NUNCA expor client-side)
- [ ] `VAPID_SUBJECT` → Railway env (`mailto:admin@torredecontrole.com`)
- [ ] **Backup das chaves** em password manager (perdê-las invalida TODOS push subscriptions)

## E) GH Secrets — checklist final

Visit GitHub repo → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**.

- [ ] `DATABASE_URL_PROD` (Railway PostgreSQL DATABASE_URL)
- [ ] `RAILWAY_TOKEN` (Railway account token)
- [ ] `RAILWAY_SERVICE_ID` (Railway API service ID)
- [ ] `CLOUDFLARE_API_TOKEN` (CF Pages edit token)
- [ ] `CLOUDFLARE_ACCOUNT_ID` (CF account ID)
- [ ] `SENTRY_AUTH_TOKEN` (Sentry auth token)
- [ ] `SENTRY_ORG` (Sentry org slug)
- [ ] `VITE_API_URL` (ex: `https://torre-de-controle-production.up.railway.app`)
- [ ] `VITE_SENTRY_DSN` (torre-frontend Sentry DSN)
- [ ] `VITE_VAPID_PUBLIC_KEY` (VAPID public)
- [ ] (opcional) `LHCI_GITHUB_APP_TOKEN` — Lighthouse CI GitHub App for PR comments

## F) BLOCKING — Primeiro schema push (manual, contra prod) [D-37]

**Crítico:** primeira execução cria 3 tabelas novas (`push_subscriptions`, `alert_thresholds`, `gps_providers`) + coluna `notification_preferences` JSONB na tabela `users`.

```bash
cd api

# Set DATABASE_URL temporariamente (Railway PostgreSQL connection string)
# NÃO commitar este valor — use só no shell session
DATABASE_URL='postgres://...railway-connection-string...' bunx drizzle-kit push --strict --verbose
```

**Esperado:** `--strict --verbose` imprime SQL diff. Confirmar que mostra APENAS:

- `CREATE TABLE push_subscriptions (...)`
- `CREATE TABLE alert_thresholds (...)`
- `CREATE TABLE gps_providers (...)`
- `ALTER TABLE users ADD COLUMN notification_preferences JSONB ...`
- **ZERO operações destrutivas:** nenhum `DROP TABLE`, `DROP COLUMN`, `ALTER COLUMN ... TYPE`, `RENAME`

- [ ] SQL preview revisado, somente operações aditivas
- [ ] Se destrutivo: **ABORTAR**, investigar schema diff, redesenhar migration aditiva
- [ ] Confirmar com `y` / Enter quando solicitado
- [ ] Push completou sem erro

## G) Seed produção (thresholds defaults + admin user)

Idempotente via `onConflictDoNothing` — safe re-run.

```bash
# Full seed (cria admin user default — TROCAR SENHA imediatamente após primeiro login)
cd api
DATABASE_URL='postgres://...' bun run src/db/seed/index.ts
```

OU somente thresholds (sem criar users):

```bash
DATABASE_URL='postgres://...' bun -e "import { db } from './src/db/client'; import { alertThresholds } from './src/db/schema/alert-thresholds'; await db.insert(alertThresholds).values([{ type: 'atraso_critico_minutes', value: 30 }, { type: 'desvio_km_threshold', value: 2 }, { type: 'stop_duration_minutes', value: 15 }]).onConflictDoNothing(); console.log('done');"
```

- [ ] Seed executou sem erro
- [ ] Verificar `alert_thresholds` populado (3 linhas) via Railway PostgreSQL Query tab:
  ```sql
  SELECT * FROM alert_thresholds;
  ```
- [ ] Se admin criado: **trocar senha IMEDIATAMENTE** após primeiro login

## H) Task 3 — First production deploy verification

**Pré-condição:** A-G completos.

- [ ] Merge um PR (ou push commit vazio) para `main`
  - Exemplo: `git commit --allow-empty -m "chore: trigger first deploy" && git push origin main`
- [ ] GH Actions roda `deploy.yml`:
  - [ ] Backend job: drizzle push (no-op se A-F completos) + `railway up`
  - [ ] Frontend job: build com Sentry source maps + `wrangler-action pages deploy`
- [ ] Verificar:
  - [ ] Backend health: `curl https://<railway-url>/` → 200
  - [ ] Frontend: visit `https://torre-de-controle.pages.dev/login` → carrega login page
  - [ ] Sentry torre-api: trigger erro test (manual API call) → evento aparece em Sentry dashboard
  - [ ] Sentry torre-frontend: throw `throw new Error('test')` em console → evento aparece
  - [ ] Source maps: stack trace Sentry mostra código fonte legível (não minified)
  - [ ] Login funcional, redirect para `/dashboard`
  - [ ] `_redirects` SPA fallback: visit `/insights` direto → carrega (sem 404)

## I) Reportar deploy completion

Preencher e enviar ao operador GSD:

```
Backend URL:               https://_________________.up.railway.app
Frontend URL:              https://_________________.pages.dev
Sentry torre-api:          https://sentry.io/organizations/<org>/projects/torre-api/
Sentry torre-frontend:     https://sentry.io/organizations/<org>/projects/torre-frontend/
GH Secrets configurados:   [ ] yes  [ ] no
Drizzle first push:        [ ] success  [ ] aborted-destructive  [ ] error: _______
Seed thresholds:           [ ] populated  [ ] error: _______
Health checks:             [ ] all green  [ ] failures: _______
```

---

## Failure modes / Rollback

- **Drizzle hangs em CI:** D-37 protection — operação destrutiva detectada. Investigar via local `--dry-run`, redesign migration aditiva.
- **CF Pages 404 em URL direta:** `_redirects` não deployado. Verificar `torre-de-controle/dist/_redirects` está no output do build.
- **Sentry não recebe eventos:** verificar `VITE_SENTRY_DSN` (frontend GH Secret) e `SENTRY_DSN` (backend Railway env) corretos + rebuild.
- **Railway healthcheck failing:** confirmar que `/` retorna 200; ajustar `healthcheckPath` em `railway.json` se necessário.
- **VAPID compromise:** **NÃO rotacionar** — invalida todos os subscriptions. Comunicar usuários para re-opt-in via UI.
- **Quota Railway/CF exceeded:** considerar Hobby plan ($5/mo Railway, $20/mo CF Pages Pro) antes de continuar.

## Secret rotation policy

| Secret                  | Frequency        | How                                  |
| ----------------------- | ---------------- | ------------------------------------ |
| `RAILWAY_TOKEN`         | Quarterly        | Railway → Account → Tokens → Rotate  |
| `CLOUDFLARE_API_TOKEN`  | Quarterly        | CF Dashboard → API Tokens            |
| `SENTRY_AUTH_TOKEN`     | Quarterly        | Sentry → Account → API → Auth Tokens |
| `JWT_SECRET`            | Quarterly        | `openssl rand -hex 32` + Railway env (invalida sessões) |
| `TELEMETRY_API_KEY`     | Quarterly        | Random string + Railway env          |
| `DATABASE_URL_PROD`     | On-incident only | Railway PostgreSQL rotate            |
| `VAPID_*`               | **NEVER**        | Rotation invalida todas subscriptions |

---

**Tracking:** quando Task 2 completo, criar follow-up PR atualizando este arquivo com URLs reais ou anotando em STATE.md / SUMMARY.md sob "Production URLs". Task 3 (first-deploy verification) executa depois deste checklist completo.
