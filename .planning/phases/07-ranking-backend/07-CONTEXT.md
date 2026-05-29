# Phase 7: Ranking Backend (Elysia Data Layer) — Context

**Gathered:** 2026-05-29 (via discovery + discussion; ride-rank source read directly)
**Status:** Ready for planning
**Milestone:** v2.0 (ver `.planning/MILESTONE-v2-ROADMAP.md`)

<domain>
## Phase Boundary

Cria o módulo backend `ranking` na API Elysia do Torre que expõe `/api/ranking/*` (somente leitura nesta fase), lendo dados do **Supabase EXTERNO do ride-rank** (`vrlhfgfyjvkzfnafibnc`) + de um **CSV público do Google Sheets**, com o algoritmo de scoring **portado do ride-rank pro servidor**. Sem UI (Phase 8) e sem escrita (Phase 9).

**Dentro:**
- Módulo `api/src/modules/ranking/` (service + plugin Elysia).
- Client `@supabase/supabase-js` server-side apontando pro projeto ride-rank com `service_role` (env, nunca no browser).
- Porte dos serviços TS do ride-rank: scoring (`dataAdapter`), reads (`supabaseService`), rotas (`routeScoreService`), Sheets CSV (`sheetsService`), tipos.
- Endpoints GET: `/api/ranking/drivers` (ranqueado + métricas), `/trips`, `/blocks`, `/route-scores`, `/stats` — atrás do `authGuard` do Torre.
- Cache Redis curto (~60s) no fetch do Sheets (evita rebuscar CSV a cada request).
- Tipos exportados via Eden Treaty (`App`) pro front da Phase 8.

**Fora:**
- UI / telas (Phase 8).
- Endpoints de escrita: avaliações, bloqueios, route-scores CRUD (Phase 9).
- Qualquer migração de dados pro DB do Torre (o dado fica externo no ride-rank).
- Feature do mapa/planilha (Phases 10-11).

</domain>

<decisions>
## Implementation Decisions (travadas na discussão)

- **D-V2-01 (PROXY):** acesso ao ride-rank é via **proxy Elysia**, não direto no browser. `service_role` key fica server-side (`RANK_SUPABASE_SERVICE_KEY`). Front consome `/api/ranking/*` via Eden Treaty usando o **auth-cookie do Torre** (sem 2º login). O dado **continua externo** no Supabase do ride-rank — Torre só lê/repassa; nada migra pro `torre-controle-prod`.
- **D-V2-04 (scoring reusado):** portar a lógica client-side do ride-rank **sem reescrever o algoritmo**:
  - `calculateTripScore(trip, basePoints)` = base + pontos ETA origem + pontos ETA destino (ON TIME/EARLY = +1, DELAY = -3; destino EARLY = -1).
  - `deriveDrivers(trips)` = agrega por `driver_id`, soma scores, calcula métricas (onTime/early/delay %), aplica `ajuste_manual`.
  - Ranking = ordena por `pontuacao` desc, filtra `status === 'ATIVO'` (exclui bloqueados sem manual_override).
- **Sheets sem credencial:** `sheetsService` busca CSV público gviz — sheet ID `1MWTiaXU3HXW_iVn-n70WSk3o8rcHTRrQP2ac07W9cCU`, tab `DBLHHISTORICO`. Só portar o fetch+parse CSV. Filtra trips `status_agrupado === 'FECHADA'` (+ NO SHOW separado).
- **Tabelas lidas no Supabase ride-rank:** `evaluations`, `driver_blocks`, `evaluation_logs`, `route_scores`, `drivers`. (RLS exige role autenticado/service — por isso service_role.)
- **Auth/cache:** endpoints atrás do `authGuard` do Torre (mesmo dos outros módulos). Cache Redis no Sheets (TTL ~60s).

### Claude's Discretion
- Estrutura interna do módulo (1 service vs vários; nomes de arquivos).
- Se o scoring roda 100% no servidor (recomendado) ou se algum cálculo leve fica no client.
- Forma exata dos contratos de resposta (mas devem casar com os tipos do ride-rank pra a UI da Phase 8).
- Estratégia de cache (Redis key naming, TTL).

</decisions>

<canonical_refs>
## Canonical References — LER ANTES DE PLANEJAR

### Código-fonte do ride-rank (PORTAR de — caminhos absolutos no disco)
- `C:\Users\antonio.magalhaes\Documents\Projetos\produção\ride-rank-buddy\src\services\dataAdapter.ts` — **scoring** (`calculateTripScore` ~L94-99, `transformTrips` ~L120-197, `transformSheetNoShowTrips` ~L199-238, `deriveDrivers` ~L257-292). Núcleo do ranking.
- `...\src\services\supabaseService.ts` — reads: `fetchEvaluations`, `fetchDriverBlocks`, `fetchDrivers` (paginado), `fetchRouteScores`.
- `...\src\services\routeScoreService.ts` — `getRouteBasePoints(routeScores, origin, dest, date)`.
- `...\src\services\sheetsService.ts` — fetch CSV público gviz + parse (colunas `SheetTrip`).
- `...\src\services\vinculoService.ts` — vínculos de motorista (filtro).
- `...\src\contexts\DataContext.tsx` — orquestração + regras de bloqueio (NO_SHOW auto-block ~L220-285) + aplicação do ajuste manual (~L178-180).
- `...\src\data\mockData.ts` — definições de tipos (`Trip`, `Driver`, `Block`, etc.) — portar SÓ os tipos.
- `...\src\integrations\supabase\types.ts` — tipos gerados do schema Supabase ride-rank.
- `...\supabase\migrations\*.sql` — schema das 4 tabelas (evaluations, driver_blocks, evaluation_logs, route_scores).

### Codebase Torre (análogos a SEGUIR)
- `api/src/modules/dashboard/dashboard.service.ts` + `dashboard.plugin.ts` — análogo de **service+plugin com cache Redis + agregação**.
- `api/src/modules/trips/trips.plugin.ts` — padrão de endpoint Elysia + `authGuard`.
- `api/src/lib/redis` / uso de `redis` em `dashboard` — padrão de cache (key + TTL).
- `api/src/index.ts` — onde registrar o `rankingPlugin` (.use, antes do wsPlugin) + exportar `App` (Eden Treaty).
- `api/src/db/client.ts` — NÃO usar pro ranking (ranking usa o client Supabase EXTERNO, não o Drizzle/Postgres do Torre).
- `api/.env.example` — adicionar `RANK_SUPABASE_URL`, `RANK_SUPABASE_SERVICE_KEY`.

### Planning
- `.planning/MILESTONE-v2-ROADMAP.md` — roadmap + decisões D-V2-*.
- Inventário completo do ride-rank na sessão (telas/backend) — resumido acima.

</canonical_refs>

<code_context>
## Existing Code Insights

- **Stack idêntico** (React/Vite/TS/Supabase/TanStack) → porte da lógica TS é quase 1:1; o trabalho é adaptar pra rodar no Bun/Elysia (server) em vez do browser.
- Ride-rank **não tem edge functions nem triggers** — toda a lógica é TS client-side em `src/services/*`. Portável direto pro Elysia.
- `@supabase/supabase-js` precisa ser adicionado ao `api/package.json` (o backend Torre hoje usa Drizzle/postgres.js pro DB próprio; o ranking usa o SDK Supabase pro DB externo).
- Sheets CSV é fetch HTTP simples (sem auth) — roda igual no servidor.
- O scoring é **puro** (sem I/O) — fácil de testar com paridade.

</code_context>

<specifics>
## Specific Ideas

### Endpoints (read) propostos
```
GET /api/ranking/drivers        → [{ driverId, driverName, pontuacao, rank, totalViagens, ocorrencias, etaOrigMetrics, etaDestMetrics, status }]
GET /api/ranking/trips?filters  → [Trip ranqueado]
GET /api/ranking/blocks         → [DriverBlock ativo]
GET /api/ranking/route-scores   → [RouteScore]
GET /api/ranking/stats          → { activeDrivers, top3Avg, totalTrips, activeBlocks }
```

### Env novas (api/.env.example + VPS /opt/apps/torre/.env)
```
RANK_SUPABASE_URL=https://vrlhfgfyjvkzfnafibnc.supabase.co
RANK_SUPABASE_SERVICE_KEY=<service_role do ride-rank — server-side only>
RANK_SHEET_ID=1MWTiaXU3HXW_iVn-n70WSk3o8rcHTRrQP2ac07W9cCU
RANK_SHEET_TAB=DBLHHISTORICO
```

### Cache Redis
- `ranking:sheets:trips` (TTL 60s) — CSV parseado.
- Opcional: `ranking:drivers` derivado (TTL 60s).

</specifics>

<deferred>
## Deferred (próximas fases)
- UI das 6 abas (Phase 8).
- Escrita: avaliações, bloqueios, route-scores (Phase 9).
- Import planilha + mapa (Phases 10-11).
</deferred>

---

*Phase: 07-ranking-backend · Milestone v2.0 · Context 2026-05-29*
