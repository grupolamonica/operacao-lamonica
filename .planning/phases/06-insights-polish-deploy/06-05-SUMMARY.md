---
phase: 06-insights-polish-deploy
plan: 05
subsystem: frontend
tags: [insights, chartjs, react-chartjs-2, drill-down, cross-filter, tanstack-query, eden-treaty, theme-switching, url-state]

# Dependency graph
requires:
  - phase: 06-02
    provides: "GET /api/insights/sla-history|drivers-ranking|problematic-routes|alerts-distribution (TypeBox-validated range presets, Redis-cached 30s TTL)"
  - phase: 06-04
    provides: "insightsPlugin wired in api/src/index.ts (Eden Treaty type inference via App)"
  - phase: 0
    provides: "chart.js@4.x + react-chartjs-2 (Wave 0 deps)"
provides:
  - "Página /insights operacional com 4 cards Chart.js + cross-filter visual + drill-down navigation"
  - "Hook composto useInsights (4 sub-hooks com staleTime 30s matching backend Redis TTL)"
  - "Padrão URL-state shareable: ?range=30d via useSearchParams + isValidRange whitelist"
  - "Cross-filter MVP: dateFilter local state + banner visual (cards mantêm range, banner indica filtro ativo)"
  - "Drill-down navegação: click motorista → /motoristas/:id, click rota → /viagens?route=CODE"
affects: [06-07, 06-08]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Eden Treaty bracket-notation para endpoints com hífen: `(api.api.insights as any)['sla-history'].get({ query })` — TS dot-notation disallow `-` (mesmo cast as any do useGeofences)"
    - "Chart.js theme switching: `key={`${isDark}-${chartName}`}` força re-mount em troca de tema (Phase 1b SparklineChart analog)"
    - "Hex puro para Chart.js (não CSS vars) — fallback constants alinhados com oklch tokens Argon: #2dce89 success, #5e72e4 primary, #f5365c danger, #fb6340 warning"
    - "URL state with isValidRange whitelist (`Range` literal union) — bloqueia tampering (T-06.05-01)"
    - "DataTable<RouteRow> com mapeamento `routeId → id` no useMemo (DataTable exige `{ id: string }` contract)"
    - "ctx.parsed.x/y null-safe via `?? 0` em tooltip callbacks (TS strict + Chart.js 4.x typing)"

key-files:
  created:
    - "torre-de-controle/src/hooks/useInsights.ts"
    - "torre-de-controle/src/app/pages/insights/components/DateRangePicker.tsx"
    - "torre-de-controle/src/app/pages/insights/components/SlaHistoricoChart.tsx"
    - "torre-de-controle/src/app/pages/insights/components/MotoristasRankingChart.tsx"
    - "torre-de-controle/src/app/pages/insights/components/RotasProblematicasTable.tsx"
    - "torre-de-controle/src/app/pages/insights/components/AlertasDistribuicaoChart.tsx"
    - ".planning/phases/06-insights-polish-deploy/deferred-items.md"
  modified:
    - "torre-de-controle/src/app/pages/insights/InsightsPage.tsx"

key-decisions:
  - "Eden Treaty bracket-notation `(api.api.insights as any)['sla-history']` — TS dot-notation não aceita hífen; cast `as any` é o padrão estabelecido (useGeofences usa o mesmo)"
  - "queryKey namespace ['insights', endpoint, range] — selective invalidation, evita conflitos com outros queries"
  - "staleTime: 30_000 em todos os 4 hooks — match exato com backend Redis TTL (CONTEXT D-29) reduz round-trips desnecessários"
  - "Cross-filter MVP: dateFilter é state visual + banner. Backend não aceita ?date= dia (RESEARCH lines 1085-1087 — complexidade vs valor). Cards mantêm dados do range; banner mostra 'Filtrado por: YYYY-MM-DD [×]'"
  - "Chart.js theme switching via key prop (não re-config) — re-mount completo do componente é mais robusto que update API (Phase 1b convention)"
  - "Hex puro nos charts (não CSS vars) — Chart.js 4.x não resolve `var(--success)` no canvas; mantém alinhamento visual via constants Argon palette"
  - "DataTable<RouteRow = ProblematicRoute & { id: string }> via useMemo — workaround do contract `{ id: string }` sem alterar DataTable signature"
  - "Default range '30d' fora do URL — UX padrão sem precisar de query string (D-02)"
  - "isValidRange whitelist no parse de searchParams.get('range') — rejeita tampering (T-06.05-01)"
  - "MotoristasRankingChart horizontal bar (indexAxis: 'y') — melhor leitura de nomes longos vs vertical"
  - "AlertasDistribuicaoChart com TYPE_LABELS map pt-BR — 'parada_longa' → 'Parada longa', 'desvio_rota' → 'Desvio de rota' (UX legibilidade)"

patterns-established:
  - "Phase 6 Wave 3 frontend: 4-card analytics layout (lg:grid-cols-2 xl:grid-cols-4) + URL-state + cross-filter banner"
  - "Chart.js + react-chartjs-2 component contract: { data, isLoading?, onPointClick?/dateFilter? } com Loading + Empty states + theme key"
  - "Cross-filter visual-only MVP: state local + banner [×], cards mantêm range — refinamento futuro para filtro real backend opcional"

requirements-completed: [PHASE6-INSIGHTS-PAGE, PHASE6-INSIGHTS-CHARTS, PHASE6-INSIGHTS-DRILL-DOWN]

# Metrics
duration: 35min
completed: 2026-05-29
---

# Phase 6 Plan 05: Insights Page — 4 Chart.js Cards + Cross-Filter + Drill-Down Summary

**Página /insights operacional: 4 cards Chart.js (Line SLA histórico, Bar Ranking motoristas, Table Rotas problemáticas, Doughnut Distribuição alertas) com DateRangePicker URL-persisted, cross-filter via dateFilter banner, drill-down nav para /motoristas/:id e /viagens?route=CODE — substitui stub Construction.**

## Performance

- **Duration:** ~35 min
- **Started:** 2026-05-29T11:15Z
- **Completed:** 2026-05-29T11:50Z
- **Tasks:** 2
- **Files created:** 6 (hook + 5 page components)
- **Files modified:** 1 (InsightsPage.tsx full replacement do stub)

## Accomplishments

- `torre-de-controle/src/hooks/useInsights.ts` — composite hook com 4 sub-hooks (useSlaHistory, useDriversRanking, useProblematicRoutes, useAlertsDistribution) todos com:
  - queryKey `['insights', endpoint, range, ...extras]` para selective invalidation
  - staleTime 30s matching backend Redis TTL (D-29)
  - Hook contract padrão `{ data, isLoading, isError, error, refetch }`
  - Default `[]` quando data ausente (safe rendering)
  - Eden Treaty bracket-notation cast para endpoints hyphenated
- `DateRangePicker.tsx` — shadcn Select com 3 presets (7d/30d/90d), default 30d, controlado via prop (parent gerencia URL ?range=)
- `SlaHistoricoChart.tsx` — Chart.js Line com:
  - SLA % no eixo Y (0..100, custom tick callback "%")
  - `onPointClick` prop dispara cross-filter (D-04)
  - Theme via `key={`${isDark}-sla`}` + tickColor/gridColor dinâmicos
  - Tooltip custom "${y}% no prazo" com null-safety
  - Loading + Empty states
- `MotoristasRankingChart.tsx` — Chart.js horizontal Bar com:
  - `indexAxis: 'y'` (melhor leitura de nomes longos)
  - Click em barra → `navigate('/motoristas/:driverId')` (D-05)
  - Tooltip mostra `${slaPercent}% (${totalTrips} viagens)`
- `RotasProblematicasTable.tsx` — DataTable wrapper com:
  - 4 colunas: Rota (code+name), Alertas, Atraso médio (min), SLA %
  - `RouteRow` map `routeId → id` via useMemo (DataTable contract)
  - Click em row → `navigate('/viagens?route=CODE')` (D-05)
  - pageSize 10, title + subtitle, emptyMessage pt-BR
- `AlertasDistribuicaoChart.tsx` — Chart.js Doughnut com:
  - Paleta Argon multi-color (8 cores hex fallback)
  - `TYPE_LABELS` pt-BR (parada_longa → "Parada longa", etc.)
  - Legend bottom, tooltip mostra `${type}: ${count} (${pct}%)`
  - Theme via `key={`${isDark}-dist`}`
- `InsightsPage.tsx` — REPLACE FULL do stub Construction:
  - Header com title + DateRangePicker (`ml-auto`)
  - URL-persisted range via useSearchParams + isValidRange whitelist
  - dateFilter banner condicional: "Filtrado por: YYYY-MM-DD [×]" com botão Limpar
  - Grid responsivo `lg:grid-cols-2 xl:grid-cols-4`
  - 4 cards instanciados com data + isLoading + onPointClick/dateFilter props

## Task Commits

| # | Task                                                    | Commit  | Files                                                      |
|---|---------------------------------------------------------|---------|------------------------------------------------------------|
| 1 | useInsights hooks + DateRangePicker                     | 201aeb2 | torre-de-controle/src/hooks/useInsights.ts, torre-de-controle/src/app/pages/insights/components/DateRangePicker.tsx |
| 2 | InsightsPage replace + 4 chart/table components         | b5ce8db | torre-de-controle/src/app/pages/insights/InsightsPage.tsx + 4 components/ files |

**NOTE on Task 2 commit hash**: O commit `b5ce8db` foi rotulado `feat(06-06)` por outro agente Wave 3 que rodava concorrentemente. O agente 06-06 chamou `git commit` enquanto meus arquivos estavam staged (Task 2 já tinha rodado `git add`); o git incluiu meus arquivos staged junto com os do 06-06 em um único commit. O conteúdo dos meus 5 arquivos (`InsightsPage.tsx` + 4 charts) é exatamente o que escrevi — verificado via `git show b5ce8db -- torre-de-controle/src/app/pages/insights/`. Sem perda de trabalho, sem retrabalho necessário, mas o hash está sob label "06-06" em vez de "06-05". Deviation documentada abaixo.

## Verification

- `npm run build` — Vite build attempt:
  - Erros TS apenas em files de waves paralelas (configuracoes/tabs/AlertThresholdsTab, NotificationsTab, viagens/components/ViagensTable) — OUT OF SCOPE
  - **Zero erros em files 06-05** — confirmado via `npm run build 2>&1 | grep -E "InsightsPage|insights/components|hooks/useInsights"` retorna empty
  - Lista completa de erros out-of-scope em `.planning/phases/06-insights-polish-deploy/deferred-items.md`
- `git log` confirma todos os 7 arquivos commitados (1 modified + 6 created):
  - 201aeb2: useInsights.ts + DateRangePicker.tsx
  - b5ce8db: InsightsPage.tsx + 4 chart components (commit label "06-06" — ver Deviation 1)
- Self-check passou: hooks exportados (4), staleTime configurado (4), grid responsivo present, Construction stub removed

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Chart.js tooltip callback `ctx.parsed.x/y` é possibly null em TS strict**

- **Found during:** Task 2 build verification
- **Issue:** TS2 errors `TS18047: 'ctx.parsed.y' is possibly 'null'` em SlaHistoricoChart e `'ctx.parsed.x' is possibly 'null'` em MotoristasRankingChart
- **Fix:** Adicionado null-coalescing: `(ctx.parsed.y ?? 0).toFixed(1)` e `(ctx.parsed.x ?? 0).toFixed(1)`
- **Files modified:** torre-de-controle/src/app/pages/insights/components/SlaHistoricoChart.tsx (linha 84), torre-de-controle/src/app/pages/insights/components/MotoristasRankingChart.tsx (linha 77)
- **Commit:** b5ce8db (incluído junto com Task 2 commit)

**2. [Process] Race condition — Task 2 files commitados sob hash `b5ce8db` (label "06-06") ao invés de hash dedicated "06-05"**

- **Found during:** Task 2 git commit
- **Issue:** Quando rodei `git commit` após `git add` dos 5 arquivos Task 2, o exit code retornou 1 e os arquivos sumiram do `git status`. Investigação revelou que outro agente paralelo (06-06) chamou `git commit` em paralelo entre meu `git add` e meu `git commit`, capturando meus arquivos staged junto com os dele em um único commit `b5ce8db` (rotulado "feat(06-06): ConfiguracoesPage 4 tabs").
- **Root cause:** Git index é global ao repo; staging + commit não são atômicos. Agentes paralelos compartilham o staging area. Não há ownership/lock entre agentes Wave 3.
- **Fix:** Não há retrabalho necessário — conteúdo dos meus 5 arquivos é exatamente o que escrevi (verified via `git show b5ce8db -- torre-de-controle/src/app/pages/insights/`). Hash do commit é sub-ótimo (rotulado outra wave) mas o trabalho está persistido corretamente.
- **Files modified:** none (já estavam corretos)
- **Commit:** b5ce8db (conteúdo válido, label cruzada)
- **Future mitigation:** Orchestrator de Wave 3 deveria usar git worktree por agente paralelo OU enforce mutex de staging entre agentes. Reportado.

### Out-of-scope errors (Logged, NOT fixed)

Outros TS errors aparecem no `npm run build` mas pertencem a files NOT owned pelo 06-05. Documentados em `.planning/phases/06-insights-polish-deploy/deferred-items.md`:

- `torre-de-controle/src/app/pages/configuracoes/tabs/AlertThresholdsTab.tsx` (5 erros TS2322/TS2345 — RHF resolver typing) — owned by 06-06
- `torre-de-controle/src/app/pages/configuracoes/tabs/NotificationsTab.tsx` (4 erros TS6133/TS2304/TS7006 — unused imports + missing useUsers) — owned by 06-06
- `torre-de-controle/src/app/pages/viagens/components/ViagensTable.tsx` (1 erro TS2322 — TripFilters Record signature) — owned by 06-07

Não toquei nenhum desses files. Verification "isolated" — meus arquivos compilam clean.

### Architectural Decisions

- None — implementação segue plan letter-perfect. Cross-filter MVP visual-only foi pré-decidido em plan/CONTEXT D-04 (não é deviation).

## Threat Coverage

| Threat ID    | Mitigation Applied                                                                                                                    |
|--------------|---------------------------------------------------------------------------------------------------------------------------------------|
| T-06.05-01   | `isValidRange(s)` whitelist literal `'7d'|'30d'|'90d'` aplicado no `useSearchParams.get('range')` — falls back to '30d' se inválido    |
| T-06.05-02   | Chart.js default tooltips usam textContent (não innerHTML — RESEARCH confirmed). React JSX auto-escape para driver name + route name em DataTable (RotasProblematicasTable cells). |
| T-06.05-03   | useDriversRanking default `limit=10` (backend max=50 via TypeBox); pageSize=10 em RotasProblematicasTable; alerts-distribution agrega por tipo (sem unbounded rows) |
| T-06.05-04   | Accepted — todos os authenticated operators legitimamente acessam aggregates (CONTEXT — sem per-team filter no MVP)                    |

## Authentication Gates

Nenhum durante execução. Endpoint contracts já mitigados por authGuard em backend (06-04 wiring); frontend só consome via Eden Treaty + credentials: 'include' cookie (estabelecido em 03-03 Phase 3).

## Known Stubs

- None — todos os 4 cards consomem hooks reais (`useSlaHistory/useDriversRanking/useProblematicRoutes/useAlertsDistribution`) que batem em `/api/insights/*` (endpoints 06-02/06-04). Hooks retornam `[]` default em ausência de data — empty state apropriado, não stub.
- Cross-filter: `dateFilter` é state visual MVP (CONTEXT D-04 trade-off documented). Cards mantêm range; banner indica filtro ativo. **NOT stub** — é decisão arquitetural pré-acordada no planejamento. Refinamento futuro (filtro real backend) deferido.

## Known Limitations / Deferred

- **Cross-filter sem efeito real nos dados (MVP visual)**: clicar num ponto SLA seta `dateFilter` mas backend `/api/insights/*` não aceita `?date=` por dia. Banner mostra filtro ativo; cards continuam exibindo dados do range. Refinamento futuro: passar `dateFilter` para hooks como query opcional + backend support `?date=YYYY-MM-DD`.
- **Drivers ranking limit hardcoded em 10**: Hook usa default `limit=10`. UI sem controle para mudar limit (CONTEXT D-25 — 4 cards equal-sized). Operador pode acessar limite maior via URL manualmente (`?limit=50` máximo backend).
- **Sem filtro por base/equipe**: aggregates são globais (CONTEXT D-04 — per-team filter fora do MVP scope, CONTEXT D-06 RBAC todos os operators veem tudo).
- **AlertasDistribuicaoChart TYPE_LABELS é hardcoded**: 7 tipos pre-conhecidos. Tipos novos aparecem com chave bruta (e.g., `custom_alert_type` em vez de pretty). Não bloqueia — fallback `return TYPE_LABELS[t] ?? t`. Maintainer adiciona mapping conforme novos tipos.
- **Chart.js bundle size**: build warning "chunks larger than 500 kB" — já pré-existente, não introduzido por 06-05. Plan 06-07 trata code-splitting (lazy routes).

## Self-Check: PASSED

- `torre-de-controle/src/hooks/useInsights.ts` — FOUND, exports 4 hooks (useSlaHistory, useDriversRanking, useProblematicRoutes, useAlertsDistribution), staleTime 30_000 em todos
- `torre-de-controle/src/app/pages/insights/components/DateRangePicker.tsx` — FOUND, exports DateRangePicker com Select preset
- `torre-de-controle/src/app/pages/insights/components/SlaHistoricoChart.tsx` — FOUND
- `torre-de-controle/src/app/pages/insights/components/MotoristasRankingChart.tsx` — FOUND
- `torre-de-controle/src/app/pages/insights/components/RotasProblematicasTable.tsx` — FOUND
- `torre-de-controle/src/app/pages/insights/components/AlertasDistribuicaoChart.tsx` — FOUND
- `torre-de-controle/src/app/pages/insights/InsightsPage.tsx` — MODIFIED, Construction stub removed, lg:grid-cols-2 xl:grid-cols-4 present, useSearchParams + dateFilter state present
- Commit `201aeb2` FOUND in git log (Task 1)
- Commit `b5ce8db` FOUND in git log (Task 2 — sob label "06-06" devido a race condition — ver Deviation 2)
- `npm run build` no errors em 06-05 files (filtered out via grep — out-of-scope errors em waves paralelas documented em deferred-items.md)
