# Phase 6: Insights + Polish + Deploy — Context

**Gathered:** 2026-05-28
**Status:** Ready for planning

<domain>
## Phase Boundary

Última fase do MVP. Entrega a aplicação em produção com analytics histórico (Insights), exportação CSV de dados operacionais, notificações Web Push para alertas críticos, página de Configurações (usuários + thresholds + integrações GPS), responsividade mobile mínima (tablet+), performance (Lighthouse > 80, LCP < 3s), deploy automatizado (Railway backend + Cloudflare Pages frontend) com CI/CD GitHub Actions, observabilidade via Sentry, e documentação de deploy.

**O que está dentro:**
- Página Insights: 4 cards com Chart.js (SLA histórico, ranking motoristas, rotas problemáticas, distribuição alertas) com drill-down/cross-filter
- API endpoints `/api/insights/*` agregados sobre trips/alerts/treatments
- Botões "Exportar CSV" em Viagens / Alertas / Tratativas / Motoristas
- Endpoints `/api/exports/*.csv` com streaming UTF-8 BOM + delim `;`
- Web Push subscription flow (VAPID), Service Worker, opt-in em Configurações
- Backend trigger de push em alertas conforme `notification_preferences` do usuário
- Página Configurações: CRUD usuários (admin only) + thresholds alerta + GPS providers (stubs) + preferências de notificação
- Mobile responsividade: tablet+ (sidebar collapse, scroll horizontal em tabelas, mapa preservado)
- Performance audit + otimizações (code-splitting, lazy load mapa, virtualização opcional)
- Dockerfile/railway.toml + Cloudflare Pages config + .env contracts para produção
- `.github/workflows/ci.yml` (PR: lint+build+typecheck) + `deploy.yml` (main: drizzle-kit push → deploy)
- Sentry SDK frontend + backend com beforeSend scrubbing (cookies, JWT, lat/lng, email/phone), free tier
- README com seção `## Deploy` documentando env vars e processo
- Documentação de variáveis de ambiente em produção

**O que está fora (deferred):**
- Drill-down avançado em Insights (filtros aplicados nos outros 3 cards) é entrega Phase 6, mas extensões cross-filter sobre histórico granular ficam pós-MVP
- Integração GPS real com providers (Phase 6 cria UI stub apenas — config_only)
- Notificações por email/SMS (só Web Push nessa fase)
- Quiet hours / configuração de horário operacional (sempre 24/7)
- Particionamento mensal de vehicle_positions (Risk Register: 3 meses pós-deploy)
- Mapbox Directions API para ETA preciso (deferred Risk Register)
- Tradução i18n (pt-BR hardcoded)
- Phone-first mobile (<1024px)

</domain>

<decisions>
## Implementation Decisions

### Insights (Página Analytics)
- **D-01: 4 métricas em cards lado a lado** — SLA histórico (line chart), Ranking motoristas (bar chart top/bottom 10), Rotas problemáticas (table com mais alertas), Distribuição alertas por tipo (donut chart). Todos no grid responsivo.
- **D-02: Range padrão últimos 30 dias** — date range picker com presets `7d / 30d (default) / 90d / custom`. Persistir seleção em URL query string (`?range=30d`).
- **D-03: Chart.js** — reuso da lib já instalada pelo SparklineChart (Phase 1b). Theme tokens via `key={isDark}` para forçar re-mount em troca de tema (pattern existente).
- **D-04: Drill-down / cross-filter** — clicar num ponto SLA hist filtra os outros 3 cards para aquele dia/range. Estado local com `useState` no `InsightsPage`, passa filtro para cada card. **Trade-off aceito:** mais complexidade vs. valor analítico (operador clica no dia ruim, vê motoristas/rotas/tipos de alerta daquele dia).
- **D-05: Click em motorista no Ranking navega para `/motoristas/:id`** ; click em rota navega para `/viagens?route=X`. Cross-page drill-down.

### CSV Export
- **D-06: 4 entidades exportáveis** — Viagens, Alertas, Tratativas, Motoristas. Endpoint `GET /api/exports/{entity}.csv?...filters`.
- **D-07: Aplicar filtros atuais da página** — botão "Exportar" em cada página passa os mesmos query params dos filtros aplicados. UX esperada pelo operador (exporta o que ele está vendo).
- **D-08: UTF-8 BOM + delim `;`** — encoding `﻿` + headers `Content-Type: text/csv; charset=utf-8` + `Content-Disposition: attachment`. Abre direto no Excel BR sem corromper acentos.
- **D-09: Síncrono streaming via Elysia** — usa `set.headers` + `ReadableStream` (Bun stdlib) para enviar linhas conforme query roda. Limite prático ~50k linhas. Sem BullMQ na Phase 6 (deferred para futuro se justificar).
- **D-10: Filename pattern** — `{entity}_{YYYY-MM-DD}_{HHmm}.csv`, ex: `viagens_2026-05-28_1430.csv`.

### Web Push Notifications
- **D-11: VAPID self-hosted** — lib `web-push` (Node) no backend, gera VAPID keys em runtime se ausentes (persiste em DB ou env). Frontend usa Web Push API padrão (`navigator.serviceWorker` + `PushManager.subscribe`). Zero vendor lock.
- **D-12: Service Worker em `torre-de-controle/public/sw.js`** — handlers para `push` event (mostra Notification) e `notificationclick` (foca/abre tab com URL do alerta).
- **D-13: Opt-in explícito** — botão "Ativar notificações" na página Configurações. Confirma permissão browser + envia subscription endpoint+keys para `POST /api/push/subscribe`. Tabela nova `push_subscriptions(user_id, endpoint, p256dh, auth, created_at)`.
- **D-14: Configurável por usuário** — campo `notification_preferences JSONB` em `users` (ou tabela separada). Permite escolher severidades: `{critico: true, medio: false, baixo: false}`. Default ao subscrever: `{critico: true}`.
- **D-15: Backend trigger** — quando alert é criado/atualizado (Phase 4 alert engine), checar todos os usuários com subscription ativa e prefs compatíveis. Despachar push via `web-push.sendNotification()`. **Sempre 24/7** — sem quiet hours.
- **D-16: Payload do push** — `{ title: '⚠ Atraso crítico — TRP-1234', body: 'Motorista João — 30min de atraso', url: '/alertas/{id}' }`. Operador clica → abre direto na tela do alerta.

### Configurações (Página)
- **D-17: 4 tabs** — Usuários (admin only), Alertas (thresholds), Notificações (preferências por usuário + ativar push), Integrações GPS (stubs com nome/URL/API key — não conecta nessa fase, só persiste config).
- **D-18: CRUD usuários** — criar (name+email+role+senha), editar (role, isActive), nunca deletar (soft delete via `isActive=false`). Endpoint `/api/users` com `authGuard + requireRole('admin')`. Senha redefinida gera link mágico (out of scope nessa fase → operador admin define senha manualmente).
- **D-19: Thresholds globais por enquanto** — tabela nova `alert_thresholds(type, value)` com seeds: `atraso_critico_minutes=30`, `desvio_km_threshold=2`, `stop_duration_minutes=15`, etc. Editável só por admin. Alert engine (Phase 4) lê esses valores em runtime (sem cache ou com cache curto de 60s).
- **D-20: GPS Providers stub** — formulário com `name, base_url, api_key` (campos opcionais). Salva em `gps_providers` table. Nenhum endpoint efetivamente integra na Phase 6 — UI prepara o terreno para integração futura.

### Mobile Responsividade
- **D-21: Breakpoint `lg: ≥1024px`** — mínimo tablet do ROADMAP. Não suportar phone (<1024px) nessa fase.
- **D-22: Sidebar collapsável em <1280px** — usa shadcn SidebarProvider existente, `collapsible='icon'` em tablet. Em ≥1280px sidebar fixa.
- **D-23: Tabelas mantêm scroll horizontal em tablet** — não converter para card list em mobile. Operador acostumado com formato tabular. CSS `overflow-x-auto` no wrapper.
- **D-24: Mapa preservado em tablet** — altura ajustável conforme container, controles permanecem.
- **D-25: Insights cards stack vertical em <1280px** — grid `lg:grid-cols-2 xl:grid-cols-4`.

### Performance
- **D-26: Code-splitting por rota via React.lazy** — Insights, Configurações, Geofences (já complexas) carregam sob demanda. Reduz initial bundle.
- **D-27: Lazy load MapLibre na primeira rota com mapa** — não no entry chunk. Dashboard só carrega mapa quando navega para lá ou Torre de Controle.
- **D-28: Lighthouse target ≥80 em Performance, Best Practices, SEO** — Acessibilidade target 100. LCP < 3s, CLS < 0.1, INP < 200ms. **Não bloquear deploy** se Lighthouse < 80 — apenas reportar e abrir issue.
- **D-29: TanStack Query staleTime 30s em insights** — evita refetch ao trocar tab. Cache vive por usuário.

### Deploy: Railway + Cloudflare Pages
- **D-30: Railway hospeda backend + PostgreSQL+PostGIS + Redis** — locked no ROADMAP. Railway suporta PostGIS nativamente (Phase 5 já confirma). Usar Railway templates ou subir manualmente.
- **D-31: Cloudflare Pages hospeda frontend** — locked no ROADMAP. Build command `npm run build` (ou bun) → publish dir `torre-de-controle/dist`. Configurar `_redirects` para SPA fallback.
- **D-32: Mono-repo, deploys separados** — Railway watch `api/**`, Cloudflare watch `torre-de-controle/**`. Cada serviço só rebuilda quando seu path muda. Configurar em `.github/workflows/deploy.yml`.
- **D-33: WebSocket no Railway** — Railway suporta WS nativamente. Frontend conecta via `wss://api.torre.{domain}/ws/positions`. CORS configurar `FRONTEND_URL` env apontando para `https://torre.{domain}.pages.dev` (ou domínio custom).

### CI/CD GitHub Actions
- **D-34: PR roda lint + build + typecheck (sem deploy)** — fast feedback. `.github/workflows/ci.yml` com jobs: `lint` (eslint), `typecheck` (tsc --noEmit), `build` (vite build + bun build api). Falha qualquer job → bloqueia merge.
- **D-35: Push em `main` faz deploy automático após CI passar** — `.github/workflows/deploy.yml` depende do `ci.yml`. Para backend: `drizzle-kit push` (D-37) → Railway deploy via CLI. Para frontend: Cloudflare Pages deploy via Wrangler ou trigger built-in.
- **D-36: Sem ambiente staging na Phase 6** — main = produção. Risk: bugs vazam direto. Mitigação: PR review obrigatório + CI checks. Staging vira Phase 7+ se necessário.
- **D-37: `drizzle-kit push` automático no deploy backend** — pipeline: `bun install` → `drizzle-kit push --config drizzle.config.ts` (env DATABASE_URL = Railway secret) → Railway deploy api. **Risk aceito:** push pode dropar coluna em mudança destrutiva. Mitigação: code review de schema changes em PR + `--dry-run` em CI antes do merge para preview do SQL.

### Sentry (Observability)
- **D-38: Sentry SDK em frontend (React) + backend (Bun)** — `@sentry/react` + `@sentry/bun` (ou `@sentry/node` se incompat). DSN em env (`VITE_SENTRY_DSN` + `SENTRY_DSN`).
- **D-39: Scrub PII / JWT / geo via beforeSend** — função beforeSend remove: `cookies`, `Authorization`, qualquer header com `Bearer`, campos `password`, `passwordHash`, `email` (substituir por `<scrubbed>`), `phone`, `lat`, `lng`, `address`. LGPD-friendly.
- **D-40: Free tier 5k errors/mês** — sample rate `tracesSampleRate: 0.1` para spans (10%) + `replaysSessionSampleRate: 0` (sem session replay). Suficiente para volume MVP.
- **D-41: Source maps backend e frontend** — upload via Sentry CLI no GitHub Actions deploy. Stack traces legíveis no Sentry dashboard.
- **D-42: Alertas Sentry** — não configurar Slack na Phase 6 (sem channel ainda). Configurar email do admin no Sentry dashboard como destino padrão.

### Documentação
- **D-43: README.md raiz ganha seção `## Deploy`** — passos: criar Railway project, conectar GitHub, set env vars (DATABASE_URL automático Railway, REDIS_URL, JWT_SECRET, VAPID_PUBLIC/PRIVATE, SENTRY_DSN, FRONTEND_URL); criar Cloudflare Pages project, conectar repo, set build cmd, set env vars (VITE_API_URL, VITE_SENTRY_DSN).
- **D-44: `.env.example` atualizado** com todas as novas envs (VAPID, SENTRY, etc.). Documentar quais geram em runtime vs. quais precisam ser providenciadas.

### Claude's Discretion (orchestrator decide)
- Layout grid exato dos 4 cards de Insights (Tailwind utility classes)
- Estrutura interna dos endpoints `/api/insights/*` (SQL agregado em uma query vs múltiplas)
- Forma exata da query string para drill-down (manter na URL ou só no state)
- Estrutura do Service Worker (lifecycle, cache strategy se houver)
- Estrutura do `.github/workflows/*.yml` (matrix, cache strategy)
- Configuração específica do `railway.toml` ou Procfile
- Configuração específica do Cloudflare Pages (functions ou static)
- Estrutura dos forms em Configurações (react-hook-form ou controlled state)
- Cache strategy para thresholds em alert engine (in-memory 60s vs Redis)
- Estrutura da tabela `push_subscriptions` (PK, indexes, FK constraints)
- Estrutura da tabela `alert_thresholds` (key-value vs columns tipadas)
- Estrutura de `notification_preferences` (JSONB vs colunas booleanas)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Arquitetura e Stack
- `.planning/PROJECT.md` — Módulos do sistema, requisitos não-funcionais (RBAC 4 perfis, ≤10s posição, 500+ veículos).
- `.planning/ARCHITECTURE.md` — Schema completo, Redis keys, WebSocket events, Alert Engine logic. **Insights endpoints agregam sobre tabelas definidas aqui** — não criar novas tabelas core, só `push_subscriptions`, `alert_thresholds`, `gps_providers` (auxiliares).
- `.planning/STACK.md` — Stack escolhas + justificativas (Bun, Elysia, Drizzle, JWT HS256, Railway, Cloudflare Pages, Sentry). LEITURA OBRIGATÓRIA para deploy decisions.
- `.planning/ROADMAP.md` §Phase 6 — Lista exata de entregas + sucesso criteria ("Sistema em produção, acessível por URL pública, com dados reais do GPS").

### Codebase Frontend / Backend (referência para reuso)
- `torre-de-controle/src/data/types.ts` — Tipos compartilhados; **estender ou criar tipos novos para Insights/Push consistentes com camelCase existente**.
- `torre-de-controle/src/components/charts/SparklineChart.tsx` — Pattern Chart.js + theme `key={isDark}` que Insights deve replicar.
- `torre-de-controle/src/hooks/` — Pattern Eden Treaty + TanStack Query (`useTrips`, `useAlerts`, etc.). Hooks novos (`useInsights`, `useExportCsv`, `usePushSubscription`) seguem mesmo formato.
- `api/src/modules/auth/` — Pattern `authGuard` + `requireRole('admin')` que Configurações usa para CRUD users.
- `api/src/modules/alerts/alerts.service.ts` — Alert engine que dispara push (D-15). Adicionar hook após persist.
- `api/src/db/schema/` — Padrão Drizzle existente; adicionar `push-subscriptions.ts`, `alert-thresholds.ts`, `gps-providers.ts` seguindo o mesmo formato.

### Phase predecessors locked (cross-phase context)
- `.planning/phases/01b-visual-refinement-argon/01b-CONTEXT.md` — Argon tokens, Chart.js pattern, theme switching, light/dark.
- `.planning/phases/02-backend-core-auth-api-foundation/02-CONTEXT.md` — Auth (HS256 cookie), Eden Treaty, CORS config, Drizzle pattern.
- `.planning/phases/04` SUMMARY — Alert engine BullMQ que dispara push.
- `.planning/phases/05` SUMMARY — PostGIS, MapLibre, geofences (mobile responsivo dessas páginas).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **SparklineChart.tsx (Phase 1b)** — Padrão Chart.js + key={isDark} para theme switching. Replicar para `SlaHistoricoChart`, `MotoristasRankingChart`, `RotasProblematicasTable`, `AlertasDistribuicaoChart`.
- **TableWithSidePanel** — usado em Viagens/Motoristas. Insights "Rotas problemáticas" pode reusar para drill-down.
- **DataTable** — padrão Tabela + busca + paginação para Configurações > Usuários.
- **Eden Treaty fetcher wrapper (Phase 2/3)** — `fetcher(api.trips.index.get(...))` extrai `data` ou lança erro. Hooks de Insights seguem mesmo padrão.
- **Pino logger backend (Phase 2)** — usar nos novos módulos (`insights`, `exports`, `push`, `users`, `thresholds`).
- **authGuard + requireRole middleware (Phase 2)** — proteger `/api/users`, `/api/alert-thresholds`, `/api/gps-providers` com `requireRole('admin')`.
- **shadcn Tabs** — Configurações tem 4 tabs, usar `<Tabs defaultValue="users">` existente.

### Established Patterns
- **Argon oklch tokens** — Charts usam `var(--success)` (verde SLA bom), `var(--warning)` (laranja em risco), `var(--danger)` (vermelho atraso) extraídos via `getComputedStyle(document.documentElement).getPropertyValue('--success')` ou hex constants se Chart.js exigir.
- **Theme switching via key={isDark}** — força re-mount do Chart.js para atualizar cores. Pattern Phase 1b.
- **Hook contract `{ data, isLoading, isError, error, refetch }`** — todos os hooks novos.
- **Filename `feature-page.tsx`** — Insights vai em `torre-de-controle/src/app/pages/insights/InsightsPage.tsx`. Cards individuais em subpasta `insights/components/`.
- **Backend module pattern** — `api/src/modules/{feature}/{feature}.service.ts` + `{feature}.plugin.ts` (Elysia router). Replicar para `insights`, `exports`, `push`, `users`, `thresholds`, `gps-providers`.
- **Drizzle schema files** — um arquivo por tabela em `api/src/db/schema/`, exportar `SelectX` + `InsertX`. Adicionar em `relations.ts` se houver FK.

### Integration Points
- **Insights endpoints alimentam `InsightsPage`** via Eden Treaty + TanStack Query staleTime 30s.
- **Export CSV: navegar via `window.location.href = '/api/exports/viagens.csv?...'`** — browser segura cookie HttpOnly, baixa arquivo. Sem fetch JS (não dá pra disparar download de Blob bonito sem hacks).
- **Push subscription roundtrip:** SW registra → frontend chama `subscribe()` → POST `/api/push/subscribe` → backend persiste em `push_subscriptions` → quando alerta dispara, backend lê tabela + sends via `web-push`.
- **GitHub Actions secrets necessários:** `RAILWAY_TOKEN`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `SENTRY_AUTH_TOKEN`, `DATABASE_URL` (production for migrate-only step).

</code_context>

<specifics>
## Specific Ideas

### Insights — exemplo de endpoint
```
GET /api/insights/sla-history?range=30d
→ [{ date: '2026-04-29', total: 142, onTime: 128, sla: 0.9014 }, ...]

GET /api/insights/drivers-ranking?range=30d&order=desc&limit=10
→ [{ driverId, name, score, slaPercent, avgDelayMin, totalTrips }, ...]

GET /api/insights/problematic-routes?range=30d
→ [{ routeId, code, name, alerts: 23, avgDelay: 18, slaPercent: 0.78 }, ...]

GET /api/insights/alerts-distribution?range=30d
→ [{ type: 'atraso_critico', count: 45 }, { type: 'desvio', count: 23 }, ...]
```

### CSV Export — Elysia streaming
```typescript
app.get('/api/exports/viagens.csv', async ({ set, query }) => {
  set.headers['Content-Type'] = 'text/csv; charset=utf-8'
  set.headers['Content-Disposition'] = `attachment; filename="viagens_${dateStamp()}.csv"`
  return new ReadableStream({
    start(controller) {
      controller.enqueue('﻿') // BOM
      controller.enqueue('Código;Motorista;Cliente;...\n')
      for await (const row of streamTripsWithFilters(query)) {
        controller.enqueue(formatCsvRow(row) + '\n')
      }
      controller.close()
    }
  })
})
```

### Web Push payload e SW
```javascript
// public/sw.js
self.addEventListener('push', (event) => {
  const data = event.data.json()
  event.waitUntil(self.registration.showNotification(data.title, {
    body: data.body,
    icon: '/icon-192.png',
    data: { url: data.url },
  }))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(clients.openWindow(event.notification.data.url))
})
```

### CI/CD — workflow stub
```yaml
# .github/workflows/ci.yml
on: [pull_request]
jobs:
  lint: { steps: [{ run: bun install }, { run: bun run lint }] }
  typecheck: { steps: [{ run: bun install }, { run: bun --bun tsc --noEmit }] }
  build: { steps: [{ run: bun install }, { run: bun run build }] }
```

```yaml
# .github/workflows/deploy.yml
on: { push: { branches: [main] } }
jobs:
  backend:
    if: contains(paths, 'api/**')
    steps:
      - run: bun install
      - run: bun --bun drizzle-kit push  # uses DATABASE_URL secret
      - uses: railwayapp/action@v3
  frontend:
    if: contains(paths, 'torre-de-controle/**')
    steps:
      - run: bun install
      - run: bun run build
      - uses: cloudflare/pages-action@v1
```

### Sentry beforeSend (scrub LGPD-friendly)
```typescript
const SCRUB_KEYS = ['password', 'passwordHash', 'authorization', 'cookie', 'email', 'phone', 'lat', 'lng', 'address']
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 0.1,
  beforeSend(event) {
    walk(event, (key, val) => {
      if (SCRUB_KEYS.includes(key.toLowerCase())) return '<scrubbed>'
      return val
    })
    return event
  }
})
```

### Targets de performance
- Lighthouse Performance ≥ 80
- LCP < 3s (estado p95 em 3G fast)
- CLS < 0.1
- INP < 200ms
- Bundle initial < 250KB gzip (mapa lazy)
- API p95 < 300ms para `/api/insights/*` (com 30 dias de dados)

</specifics>

<deferred>
## Deferred Ideas

- **Quiet hours / silenciamento de notificações por horário** — adicionado se operadores reclamarem de push noturno (D-15 default 24/7).
- **Multi-canal de notificação (email, SMS, WhatsApp)** — só Web Push nesta fase. SaaS provider futuro.
- **Drill-down avançado em Insights** — clicar num motorista no Ranking abre histórico individual de SLA dele. Fase 7+.
- **Filtros salvos / dashboards customizados** — usuário salva combinação de filtros como "favorito". Roadmap pós-MVP.
- **Particionamento mensal de vehicle_positions** — Risk Register flagou 3 meses pós-deploy. Não Phase 6.
- **Mapbox Directions API para ETA real** — D-04 ROADMAP Risk Register, deferred.
- **Ambiente staging separado de produção** — D-36, adicionar quando time crescer ou cliente exigir.
- **Phone-first responsivo (<1024px)** — D-21 fixa tablet+. Phone vira projeto novo se demanda surgir.
- **Migrations via SQL versionado (drizzle-kit generate + migrate)** — D-37 usa push. Migrar pra migrate se schema crescer >40 tabelas ou time crescer.
- **Sentry Replay (session replay)** — D-40 free tier, sem session replay. Pago se valor justificar.
- **Sentry → Slack/Discord integration** — D-42, adicionar quando time tiver channel.
- **i18n (en, es)** — pt-BR hardcoded. Necessário se expandir para clientes não-BR.
- **Bun-native deploy alternative (Railway image base bun)** — Phase 2 já usa oven/bun:1.4 no Dockerfile.
- **A/B testing infra** — GrowthBook ou similar. Não MVP.
- **Documentação OpenAPI completa exposta publicamente** — Phase 2 já gera Swagger /docs interno. Expor externamente fora de escopo.

</deferred>

---

*Phase: 06-insights-polish-deploy*
*Context gathered: 2026-05-28*
