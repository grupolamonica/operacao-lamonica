# Roadmap — Torre de Controle de Entregas

**Objetivo:** Sistema operacional de monitoramento de entregas em tempo real
**Meta MVP:** 6 semanas para versão operacional com dados reais

---

## Phase 1: UI Shell + Design System [ FOUNDATION ]
**Duração:** ~5 dias
**Goal:** Estrutura React + Vite funcionando, navegação completa, design matching as imagens

### Entregas
- [ ] Setup: React 18 + Vite + TypeScript + shadcn/ui
- [ ] Layout base: sidebar dark (Torre de Controle branding), topbar, main area
- [ ] Rotas: Dashboard, Torre de Controle, Viagens, Motoristas, Geofences, Alertas, Insights, Configurações
- [ ] Componentes base: KPICard, StatusBadge, DataTable, MapContainer placeholder
- [ ] Theme: dark sidebar #1a1a2e, cards brancos, status colors (verde/amarelo/vermelho/cinza)
- [ ] Mock data layer: hooks que retornam dados estáticos matching as imagens
- [ ] Página Dashboard (mock): KPIs + mapa placeholder + lista viagens + alertas lateral
- [ ] Página Motoristas (mock): lista + painel lateral + documentos
- [ ] Página Viagens (mock): tabs + filtros + lista + painel lateral detalhes
- [ ] Página Torre de Controle (mock): fila operacional + mapa + viagens em risco
- [ ] Página Alertas (mock): lista agrupada + painel lateral ações

**Success criteria:** Todas as telas das imagens reproduzidas com dados mock. Navegação funcional.

---

## Phase 2: Backend Core + Auth [ API FOUNDATION ]
**Duração:** ~5 dias
**Goal:** Backend Elysia/Bun com auth, CRUD das entidades principais, banco configurado

### Entregas
- [ ] Setup: Bun + Elysia + Drizzle + PostgreSQL + Redis
- [ ] Schema DB: todas as tabelas (drivers, vehicles, trips, alerts, users, clients, routes)
- [ ] Migrations com Drizzle Kit
- [ ] Auth module: login, JWT, refresh, RBAC middleware
- [ ] Trips module: CRUD + filtros + KPIs
- [ ] Drivers module: CRUD + documentos + stats
- [ ] Alerts module: CRUD + assign + tratativas
- [ ] Seed data: 50+ viagens fictícias, 20+ motoristas, clientes, rotas
- [ ] Docker Compose: PostgreSQL + Redis + API
- [ ] Swagger/OpenAPI gerado pelo Elysia

**Success criteria:** `GET /api/trips` retorna dados reais. Auth funcional. Swagger acessível.

**Plans:** 6 plans

Plans:
- [ ] 02-01-PLAN.md — api/ workspace skeleton + Bun install + Docker Compose (postgres + redis + api) + Pino logger
- [ ] 02-02-PLAN.md — Drizzle schema for 9 entities (users, clients, routes, drivers, vehicles, driver_documents, trips, alerts, treatments) + relations + barrel export
- [ ] 02-03-PLAN.md — DB client + Redis client + drizzle-kit push (BLOCKING) + brazilian seed data (50+ trips, 22 drivers, 5 clients, 10 routes, 18 alerts; D-06/D-07/D-08)
- [ ] 02-04-PLAN.md — Auth module: HS256 HttpOnly Cookie JWT + Redis blacklist + login/logout/me/refresh + RBAC (authGuard + requireRole) + login rate limit
- [ ] 02-05-PLAN.md — CRUD modules: trips/drivers/alerts/vehicles/dashboard with filter contracts matching frontend hooks + Redis 30s KPI cache
- [ ] 02-06-PLAN.md — App composition: CORS + Swagger + plugin wiring + Eden Treaty type App export + smoke test + human checkpoint

---

## Phase 3: Map + Real-time [ CORE FEATURE ]
**Duração:** ~7 dias
**Goal:** Mapa Mapbox com veículos em tempo real via WebSocket

### Entregas
- [ ] Mapbox GL JS integrado no frontend
- [ ] Vehicle layer: ícones customizados por status (no prazo/em risco/atrasado/sem sinal)
- [ ] Clustering em zoom baixo
- [ ] Click em veículo: popup com info básica + link para viagem
- [ ] Geofence layer: polígonos coloridos no mapa
- [ ] Rota planejada: linha azul no mapa (detalhe da viagem)
- [ ] Telemetry ingest endpoint: `POST /api/telemetry/ingest`
- [ ] Redis PubSub: publicar posições recebidas
- [ ] WebSocket server (Elysia WS): broadcast de posições para clientes conectados
- [ ] Frontend WebSocket client: atualizar posição dos ícones no mapa sem re-render completo
- [ ] GPS Simulator: script que envia posições fictícias de 20 veículos em movimento
- [ ] Legenda do mapa matching imagens
- [ ] Modo satélite / modo mapa toggle

**Success criteria:** 20 veículos simulados movendo no mapa em tempo real. Latência < 3s.

---

## Phase 4: Alert Engine + Operational Features [ OPERATIONS ]
**Duração:** ~7 dias
**Goal:** Engine de alertas automáticos, fila operacional, tratativas

### Entregas
- [ ] BullMQ worker: processa cada posição recebida
- [ ] Detecção: atraso crítico (ETA vs window)
- [ ] Detecção: parada não planejada (velocidade < 2km/h, > 5min, fora de geofence)
- [ ] Detecção: desvio de rota (distância da rota planejada > threshold)
- [ ] Detecção: perda de sinal (last_update > threshold)
- [ ] Alert WS broadcast: `alert:new` para todos os clientes conectados
- [ ] Frontend: badge de alertas no menu (número em tempo real)
- [ ] Torre de Controle: fila operacional funcional com dados reais
- [ ] "Assumir alerta" funcional: associa operador + muda status
- [ ] "Registrar tratativa": form rápido + salva em DB
- [ ] "Marcar resolvido": fecha alerta
- [ ] Exceções e alertas no Dashboard: painel lateral real-time
- [ ] Trip timeline: eventos cronológicos da viagem
- [ ] KPIs do Dashboard: dados reais do DB (com cache Redis 30s)

**Success criteria:** Alert engine detecta e cria alertas. Operador consegue tratar em < 3 cliques.

---

## Phase 5: Geofences + Advanced Map [ GEOSPATIAL ]
**Duração:** ~5 dias
**Goal:** Gestão de geofences, histórico de eventos, PostGIS

### Entregas
- [ ] PostGIS extension no PostgreSQL
- [ ] Geofence CRUD: criar/editar/deletar zonas
- [ ] Draw no mapa: MapboxDraw para criar polígonos/círculos
- [ ] Detecção automática de entrada/saída via PostGIS
- [ ] Geofence events registrados na DB
- [ ] Alert: entrada em zona restrita
- [ ] Página Geofences: lista + mapa + histórico de eventos
- [ ] Filtro de viagens por geofence
- [ ] Geofence overlay no mapa principal com cores por tipo

**Success criteria:** Criar geofence no mapa, veículo entra e alerta é gerado automaticamente.

---

## Phase 6: Insights + Polish + Deploy [ PRODUCTION ]
**Duração:** ~5 dias
**Goal:** Analytics, performance final, deploy em produção

### Entregas
- [ ] Página Insights: gráficos de SLA histórico, ranking motoristas, rotas problemáticas
- [ ] Exportação CSV: viagens, alertas, tratativas
- [ ] Notificações browser (Web Push API)
- [ ] Configurações: usuários, thresholds de alerta, integrações GPS
- [ ] Responsividade mobile (mínimo tablet)
- [ ] Performance: Lighthouse > 80, LCP < 3s
- [ ] Deploy: Railway (backend + PostgreSQL + Redis) + Cloudflare Pages (frontend)
- [ ] CI/CD: GitHub Actions → deploy automático em push na main
- [ ] Sentry: error tracking em produção
- [ ] Documentação: README de deploy + variáveis de ambiente

**Success criteria:** Sistema em produção, acessível por URL pública, com dados reais do GPS.

**Plans:** 8 plans

Plans:
- [x] 06-01-PLAN.md — Wave 0: deps install (web-push, sentry, RHF, zod, shadcn form) + 3 Drizzle schemas (push_subscriptions, alert_thresholds, gps_providers) + users notification_preferences JSONB + scrub/sentry/vapid libs + .env.example sync — **DONE** (8e77a06, de732d0)
- [ ] 06-02-PLAN.md — Wave 1: backend modules insights (4 aggregation endpoints + Redis cache) + exports (4 CSV streaming endpoints with UTF-8 BOM + ; delim + 50k cap)
- [ ] 06-03-PLAN.md — Wave 1: backend modules users (admin CRUD + soft delete + self-update prefs) + thresholds (in-memory cache 60s + admin write) + gps-providers (admin CRUD stubs)
- [x] 06-04-PLAN.md — Wave 2: backend push module (subscribe/unsubscribe/dispatcher) + alert engine hook (alert-inline.ts → dispatchAlertPush) + wire 6 plugins in index.ts + Sentry side-effect init — **DONE** (899f008, 351c1d2)
- [ ] 06-05-PLAN.md — Wave 3: frontend Insights page (4 Chart.js cards: SLA line, motoristas bar, rotas table, alertas donut) + cross-filter + drill-down + URL range persist
- [ ] 06-06-PLAN.md — Wave 3: frontend Configurações 4 tabs (Users/Thresholds/Notifications/GpsProviders) + Service Worker + usePushSubscription + RHF+Zod forms
- [x] 06-07-PLAN.md — Wave 3: frontend layout refactor SidebarProvider + React.lazy code-splitting + ExportButton wiring (3 pages) + vite.config sentryVitePlugin + manualChunks — **DONE** (59c2fc9, aaa9bda, e2cd362)
- [ ] 06-08-PLAN.md — Wave 4: deploy infra (NÃO autônomo) — .github/workflows ci/deploy/lighthouse + railway.json + _redirects + README ## Deploy + .gitignore + BLOCKING first manual drizzle-kit push

---

## Risk Register

| Risco | Probabilidade | Impacto | Mitigação |
|-------|--------------|---------|-----------|
| Integração GPS complexa | Alta | Alto | Phase 3 inicia com simulador; integração real em paralelo |
| Performance 500+ veículos | Média | Alto | Mapbox source/layer (não React), delta updates, cluster |
| PostGIS setup difícil | Baixa | Médio | Railway suporta PostGIS nativamente |
| Cálculo de ETA impreciso | Média | Alto | Começar com estimativa linear; integrar Mapbox Directions API |
| WebSocket escala | Baixa MVP | Alto prod | Redis PubSub permite múltiplas instâncias futuras |
| LGPD dados de localização | Média | Alto | Retenção configurável, sem PII no Redis (apenas IDs) |
| Custo Mapbox | Média | Médio | Free tier: 50k map loads/mês; monitorar e otimizar |

## Technical Risks — Critical Review

### O que esta arquitetura NÃO resolve bem ainda:
1. **ETA calculation:** Estimativa linear não considera tráfego. Solução futura: Mapbox Directions API ou OSRM self-hosted
2. **GPS provider integration:** Cada provider tem formato diferente. Precisará adapter pattern na ingestão
3. **Offline resilience:** Se Redis cai, posições param. Considerar fallback para polling DB
4. **Historical queries:** `vehicle_positions` vai crescer rápido. Particionamento mensal necessário em 3 meses
5. **Alert false positives:** Engine simples vai gerar falsos alertas. Precisará tuning de thresholds por rota/cliente

## Test Strategy

### Unit tests (Vitest)
- Alert engine: `calcSlaStatus`, `detectUnplannedStop`, `detectRouteDeviation`
- KPI calculations
- Date/window comparison logic

### Integration tests
- API endpoints com banco de test
- Auth flow completo
- Telemetry ingest → Redis → WebSocket

### E2E tests (Playwright)
- Login → Dashboard → ver viagem em risco
- Operador assume alerta → registra tratativa → resolve
- Dashboard KPIs atualizam em tempo real

### Load tests (k6)
- 500 veículos enviando posição a cada 10s
- 50 clientes WS conectados recebendo updates
- Dashboard com 100 usuários simultâneos

---

# Milestone v2.0 — Ranking de Motoristas + Importação de Frota

> Detalhes completos + decisões travadas em `.planning/MILESTONE-v2-ROADMAP.md`.
> Porta a feature de ranking do projeto `ride-rank-buddy` para o Torre (proxy via API Elysia,
> dado externo no Supabase do ride-rank) + importa posições de frota da planilha Viagens.xlsx pro DB do Torre.

## Phase 7: Ranking Backend [ DATA LAYER ]
**Goal:** API Elysia expõe `/api/ranking/*` lendo do Supabase do ride-rank (service_role server-side) + CSV público do Google Sheets, com o scoring portado pro servidor.
**Depends on:** service_role key do ride-rank (`vrlhfgfyjvkzfnafibnc`).
**Success criteria:** `GET /api/ranking/drivers` retorna ranking computado com paridade ao app original; tsc + smoke test ok.

**Plans:** 4 plans

Plans:
- [ ] 07-01-PLAN.md — Wave 1: setup módulo ranking (dep @supabase/supabase-js + client Supabase ride-rank service_role server-side + envs RANK_*)
- [ ] 07-02-PLAN.md — Wave 1 (TDD): portar tipos + scoring puro do ride-rank (dataAdapter) + teste de paridade
- [ ] 07-03-PLAN.md — Wave 2: reads Supabase ride-rank (5 tabelas) + Sheets CSV gviz + cache Redis 60s + getRouteBasePoints
- [ ] 07-04-PLAN.md — Wave 3: service de composição (paridade DataContext) + plugin Elysia 5 GET atrás de authGuard + registro index.ts + Eden Treaty App + smoke

## Phase 8: Ranking — UI 6 abas (design Torre) [ FRONTEND ]
**Goal:** rota `/ranking` no Torre com 6 abas (Ranking, Viagens, Qualidade, Bloqueios, Rotas, Logs) + StatsCards + filtros, consumindo `/api/ranking/*` via Eden Treaty, no padrão Argon/PanelCard.
**Depends on:** Phase 7.
**Success criteria:** 6 abas renderizam dados reais no design Torre; filtros funcionam; zero erros.

## Phase 9: Ranking — Escrita + Auditoria [ WRITE FLOWS ]
**Goal:** avaliações, bloqueios (auto NO_SHOW + manual), config de rotas e aba Logs via `/api/ranking/*` (writes proxyados pro Supabase ride-rank), RBAC admin|supervisor|analyst.
**Depends on:** Phase 8.
**Success criteria:** fluxo avaliar→pontuar→bloquear→desbloquear end-to-end; auditoria registra antes/depois.

## Phase 10: Importação Viagens.xlsx → DB Torre [ INGESTION ]
**Goal:** endpoint de upload do .xlsx que parseia posição+campos, geocoda (cidade/UF) e salva no DB do Torre (idempotente). Planilha é só fonte de import; futuro consulta de outra forma.
**Depends on:** —
**Success criteria:** upload grava ~125 posições geocodadas; re-upload idempotente.

## Phase 11: Mapa — Frota importada [ GEOSPATIAL ]
**Goal:** camada "frota importada" no LiveMap lendo do DB do Torre, marcadores por status + popup.
**Depends on:** Phase 10.
**Success criteria:** mapa mostra os motoristas da planilha geocodados com popup; alterna camadas.
