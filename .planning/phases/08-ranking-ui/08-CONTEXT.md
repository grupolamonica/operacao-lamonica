# Phase 8: Ranking UI (6 abas, design Torre) — Context

**Gathered:** 2026-05-30
**Status:** Ready for planning
**Milestone:** v2.0 · **Depends on:** Phase 7 (endpoints `/api/ranking/*` live)

<domain>
## Phase Boundary

Rota `/ranking` no Torre com as **6 abas** do ride-rank recriadas no **design Torre** (Argon/PanelCard/Chart.js/shadcn), consumindo `/api/ranking/*` via **Eden Treaty + TanStack Query**. **Read-only** — escrita (avaliar/bloquear/config rotas) é Phase 9.

**Dentro:**
- Item "Ranking" no sidebar Argon flutuante + rota **lazy** `/ranking` (React.lazy, padrão 06-07).
- Hooks `useRanking*()` (Eden Treaty → `/api/ranking/{drivers,trips,blocks,route-scores,stats}`, padrão `useTrips`, staleTime 30s).
- Layout: shadcn `Tabs` + `StatsCards` (4 KPIs no padrão KPICard) + filtros.
- 6 abas (display): **Ranking** (DataTable ordenável por pontuação + rank), **Viagens** (DataTable), **Qualidade** (Chart.js bar + listas), **Bloqueios** (DataTable), **Rotas** (tabela read), **Logs** (DataTable + diff JSON).
- Modais **shell** `DriverDetails` (read) + `EvaluationForm` (UI montada, submit fica pra Phase 9).
- Todos os cards via **PanelCard** (padrão v1.0). **Recharts → Chart.js**.
- Fix de display do mojibake aqui (ex: `vinculo: "â€"'"` → "—") — só apresentação, o backend mantém byte-a-byte.

**Fora:**
- Escrita: submit de avaliações, block/unblock, CRUD route_scores (Phase 9).
- Backend (Phase 7, pronto).

</domain>

<decisions>
## Decisões (travadas — milestone v2.0)

- **D-V2-03:** todas as 6 abas, design Torre. shadcn `tabs.tsx`/`dialog.tsx`/`form.tsx` já existem; `PanelCard`/`DataTable`/`KPICard` reusados; Chart.js (não Recharts).
- **Consumo:** Eden Treaty (`api.api.ranking.*`) + TanStack Query, igual aos hooks da v1 (`useTrips`). Auth = cookie do Torre (já logado).
- **Contrato (do Phase 7, fixo):**
  - `GET /api/ranking/drivers` → `RankedDriver[]`: `{ id, nome, status (ATIVO|BLOQUEADO), pontuacao, rank (1..N só ativos; bloqueado null), totalViagens, ocorrencias, etaOrigMetrics{onTime,early,delay}, etaDestMetrics{...}, vinculo, created_at }`.
  - `/trips` → `Trip[]` (só FECHADA). `/blocks` → DriverBlock[]. `/route-scores` → RouteScore[]. `/stats` → `{ activeDrivers, top3Avg, totalTrips, activeBlocks }`.
- **Read-only:** botões de escrita (Avaliar, Bloquear, Salvar rota) renderizam mas ficam disabled/TODO até Phase 9 (ou abrem o modal em modo view). Documentar a escolha.
- **Mojibake display:** corrigir só na camada de view (helper de normalização de string), sem mexer no dado do backend.

### Claude's Discretion
- Layout exato do grid das abas + StatsCards (seguir Insights/Dashboard).
- Quais filtros client-side vs server (backend hoje não filtra por dia — filtro client como no ride-rank).
- Estrutura de pastas (`src/app/pages/ranking/` + `components/`, `src/hooks/useRanking.ts`).
- Se EvaluationForm/DriverDetails entram já com shell ou stub mínimo nesta fase.

</decisions>

<canonical_refs>
## Canonical References — LER ANTES DE PLANEJAR

### Telas do ride-rank a RECRIAR (entender o comportamento; NÃO copiar estilo — caminhos absolutos)
- C:\Users\antonio.magalhaes\Documents\Projetos\produção\ride-rank-buddy\src\pages\Index.tsx (layout das tabs)
- ...\src\components\DriverRanking.tsx · TripList.tsx · QualityChart.tsx · BlocksList.tsx · RouteScores.tsx · EvaluationLogList.tsx · StatsCards.tsx
- ...\src\components\DriverDetailsDialog.tsx · EvaluationForm.tsx (modais)
- ...\src\components\DateRangeFilter.tsx · OccurrenceFilter.tsx · VinculoFilter.tsx · RouteFilter.tsx · DriverImport.tsx (filtros)

### Backend (Phase 7 — contrato a consumir)
- api/src/modules/ranking/ranking.plugin.ts (5 GET) + ranking.service.ts (shape de RankedDriver/ComposeRankingResult) + ranking.types.ts.

### Análogos no Torre a SEGUIR (design)
- torre-de-controle/src/components/domain/PanelCard.tsx (card padrão) + DataTable.tsx (tabela)
- torre-de-controle/src/app/pages/insights/* (grid de cards + Chart.js + DateRangePicker reuso) — modelo mais próximo
- torre-de-controle/src/app/pages/insights/components/MotoristasRankingChart.tsx + AlertasDistribuicaoChart.tsx (Chart.js bar/doughnut + theme key={isDark})
- torre-de-controle/src/components/ui/tabs.tsx · dialog.tsx · form.tsx (shadcn já instalados)
- torre-de-controle/src/hooks/useTrips.ts (padrão Eden Treaty + TanStack Query)
- torre-de-controle/src/lib/api.ts (treaty client) + src/types/api.ts (App type)
- torre-de-controle/src/app/router.tsx (rota lazy) + src/app/layout/AppSidebar.tsx (item de menu Argon)
- torre-de-controle/src/components/domain/KPICard (StatsCards)

### Planning
- .planning/MILESTONE-v2-ROADMAP.md (Phase 8 scope + D-V2-03)
- .planning/phases/07-ranking-backend/07-04-SUMMARY.md (contrato fixado + RankedDriver)

</canonical_refs>

<code_context>
## Existing Code Insights
- Stack idêntico → recriar UI no Torre é mapear shadcn-do-ride-rank → componentes Torre (PanelCard/DataTable/Chart.js).
- `useTrips`/`useAlerts` no Torre são o template exato dos hooks de ranking (Eden Treaty + `fetcher` wrapper).
- Insights (Phase 6) é o análogo mais próximo de layout (cards + charts + filtro de range) — reusar grid + DateRangePicker.
- `/api/ranking/*` retorna campos já computados (nome, rank, pontuacao, métricas) → UI é display, sem cálculo.
- Eden Treaty: o tipo `App` já inclui o rankingPlugin (07-04) → `api.api.ranking.drivers.get()` tipado.

</code_context>

<deferred>
## Deferred (Phase 9)
- Submit de avaliação (EvaluationForm POST), block/unblock, CRUD route_scores, escrita de logs.
- RBAC de escrita (admin|supervisor|analyst).
</deferred>

---

*Phase: 08-ranking-ui · Milestone v2.0 · Context 2026-05-30*
