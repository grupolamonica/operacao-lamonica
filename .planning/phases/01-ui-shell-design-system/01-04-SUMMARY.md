---
phase: 01-ui-shell-design-system
plan: "04"
subsystem: ui
tags: [react, typescript, tanstack-table, tailwind, dashboard, torre-de-controle]

requires:
  - phase: 01-ui-shell-design-system (plan 02)
    provides: KPICard, StatusBadge, DataTable, AlertItem, DriverAvatar, ProgressBar, MapPlaceholder domain components
  - phase: 01-ui-shell-design-system (plan 03)
    provides: useTrips, useAlerts, useDashboardKPIs, useTorreKPIs hooks and mock data

provides:
  - DashboardPage completa com 5 KPIs, layout 70/30, mapa placeholder, tabela de viagens em andamento, painel de exceções e resumo operacional
  - TorreDeControlePage completa com 5 KPIs, layout 70/30, mapa placeholder, tabela viagens em risco, fila operacional com Assumir/Ligar, fila de operadores

affects: [01-05-viagens-motoristas, 01-06-alertas-stubs, phase-02-backend]

tech-stack:
  added: []
  patterns:
    - "Page layout: header + KPIRow + grid 70/30 (lg:col-span-7 / lg:col-span-3)"
    - "DataTable columns definidas fora do componente para evitar re-render"
    - "OperationalQueue usa variant=queue do AlertItem para obter Assumir/Ligar"
    - "Filtro de viagens em risco por slaStatus no cliente (em_risco | atrasado | sem_sinal)"

key-files:
  created:
    - torre-de-controle/src/app/pages/dashboard/components/DashboardKPIRow.tsx
    - torre-de-controle/src/app/pages/dashboard/components/TripsInProgressTable.tsx
    - torre-de-controle/src/app/pages/dashboard/components/ExceptionsAlertsPanel.tsx
    - torre-de-controle/src/app/pages/dashboard/components/OperationalSummary.tsx
    - torre-de-controle/src/app/pages/torre-de-controle/components/TorreKPIRow.tsx
    - torre-de-controle/src/app/pages/torre-de-controle/components/AtRiskTripsTable.tsx
    - torre-de-controle/src/app/pages/torre-de-controle/components/OperationalQueue.tsx
    - torre-de-controle/src/app/pages/torre-de-controle/components/OperatorsQueue.tsx
  modified:
    - torre-de-controle/src/app/pages/dashboard/DashboardPage.tsx
    - torre-de-controle/src/app/pages/torre-de-controle/TorreDeControlePage.tsx

key-decisions:
  - "OperatorsQueue usa dados estáticos (mock local) — operadores reais vêm na Phase 2 com backend"
  - "AtRiskTripsTable filtra no cliente via slaStatus — sem endpoint dedicado necessário nesta fase"
  - "ExceptionsAlertsPanel mostra top 5 alertas ordenados por severidade crítico→médio→baixo"

patterns-established:
  - "Página padrão: <header> + <KPIRow> + <grid lg:col-span-7/3>"
  - "Colunas TanStack Table definidas como const fora do componente"
  - "AlertItem variant=queue para filas operacionais com ações"

requirements-completed: [PHASE1-PAGE-DASHBOARD, PHASE1-PAGE-TORRE]

duration: 15min
completed: 2026-04-28
---

# Phase 1 Plan 04: Dashboard e Torre de Controle Summary

**DashboardPage e TorreDeControlePage implementadas com layout 70/30, 5 KPIs cada, mapa placeholder, tabelas populadas via hooks e fila operacional com botões Assumir/Ligar**

## Performance

- **Duration:** 15 min
- **Started:** 2026-04-28T00:00:00Z
- **Completed:** 2026-04-28T00:15:00Z
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments

- DashboardPage: 5 KPI cards exatos (Entregas no prazo, % SLA, Motoristas em risco, Atrasos críticos, Paradas não planejadas) + grid 70/30 com MapPlaceholder, TripsInProgressTable (9 colunas), ExceptionsAlertsPanel e OperationalSummary
- TorreDeControlePage: 5 KPI cards (Viagens ativas, Em risco, Atrasos críticos, Sem sinal, Ocorrências abertas) + grid 70/30 com MapPlaceholder, AtRiskTripsTable com Desvio ETA, OperationalQueue com Assumir/Ligar e OperatorsQueue com status dots
- Build `npm run build` passou sem erros de TypeScript

## Task Commits

1. **Task 1: DashboardPage — KPIs + grid 70/30** - `f5b42e0` (feat)
2. **Task 2: TorreDeControlePage — KPIs + fila operacional** - `d860e17` (feat)

## Files Created/Modified

- `src/app/pages/dashboard/DashboardPage.tsx` - Layout principal com grid 70/30 e imports de sub-componentes
- `src/app/pages/dashboard/components/DashboardKPIRow.tsx` - 5 KPI cards via useDashboardKPIs
- `src/app/pages/dashboard/components/TripsInProgressTable.tsx` - DataTable com 9 colunas via useTrips({status:'in_progress'})
- `src/app/pages/dashboard/components/ExceptionsAlertsPanel.tsx` - Top 5 alertas via useAlerts({status:'aberto'})
- `src/app/pages/dashboard/components/OperationalSummary.tsx` - Contagens de viagens e KPIs críticos
- `src/app/pages/torre-de-controle/TorreDeControlePage.tsx` - Layout principal Torre de Controle
- `src/app/pages/torre-de-controle/components/TorreKPIRow.tsx` - 5 KPI cards via useTorreKPIs
- `src/app/pages/torre-de-controle/components/AtRiskTripsTable.tsx` - Viagens filtradas por em_risco/atrasado/sem_sinal com coluna Desvio ETA
- `src/app/pages/torre-de-controle/components/OperationalQueue.tsx` - Fila priorizada com AlertItem variant=queue
- `src/app/pages/torre-de-controle/components/OperatorsQueue.tsx` - Lista estática de operadores com status dot

## Decisions Made

- OperatorsQueue usa dados mock locais estáticos (Phase 2 conecta a backend real de usuários/operadores)
- AtRiskTripsTable filtra no cliente por `slaStatus` — adequado para mock data, fase backend adicionará filtro server-side
- ExceptionsAlertsPanel ordena por severidade e limita a 5 itens para não sobrecarregar o painel lateral

## Deviations from Plan

None - plano executado exatamente como especificado.

## Known Stubs

- `OperatorsQueue.tsx` — operadores hardcoded (5 registros estáticos). Intenional nesta fase; Phase 2 conecta a API de usuários com roles de operador. Não impede o objetivo do plano (layout e interações visuais).

## Issues Encountered

None.

## Next Phase Readiness

- `/dashboard` e `/torre-de-controle` prontas e funcionais com dados mock
- Padrão de layout 70/30 estabelecido para reuso nos próximos planos (Viagens, Motoristas)
- Pronto para Plan 05: páginas Viagens e Motoristas

---
*Phase: 01-ui-shell-design-system*
*Completed: 2026-04-28*
