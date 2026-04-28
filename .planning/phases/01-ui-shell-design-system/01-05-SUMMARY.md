---
phase: 01-ui-shell-design-system
plan: "05"
subsystem: frontend-pages
tags: [viagens, motoristas, table-side-panel, tabs, filters, trip-timeline]
dependency_graph:
  requires: [01-01, 01-02, 01-03]
  provides: [PHASE1-PAGE-VIAGENS, PHASE1-PAGE-MOTORISTAS]
  affects: [01-06]
tech_stack:
  added: []
  patterns:
    - TableWithSidePanel (tabela + painel lateral ao selecionar linha)
    - Zustand activeTripsTab + selectedTripId/selectedDriverId
    - TripTimeline (eventos cronológicos no painel de viagem)
    - Local filter state in page (not global store)
key_files:
  created:
    - torre-de-controle/src/app/pages/viagens/ViagensPage.tsx
    - torre-de-controle/src/app/pages/viagens/components/ViagensKPIRow.tsx
    - torre-de-controle/src/app/pages/viagens/components/ViagensTabs.tsx
    - torre-de-controle/src/app/pages/viagens/components/ViagensFiltersPanel.tsx
    - torre-de-controle/src/app/pages/viagens/components/ViagensTable.tsx
    - torre-de-controle/src/app/pages/viagens/components/TripDetailPanel.tsx
    - torre-de-controle/src/app/pages/motoristas/components/MotoristasKPIRow.tsx
    - torre-de-controle/src/app/pages/motoristas/components/MotoristasTable.tsx
    - torre-de-controle/src/app/pages/motoristas/components/DriverDetailPanel.tsx
  modified:
    - torre-de-controle/src/app/pages/viagens/ViagensPage.tsx (replaced stub)
    - torre-de-controle/src/app/pages/motoristas/MotoristasPage.tsx (replaced stub)
decisions:
  - "ViagensFiltersPanel filter state is local to ViagensPage (not in Zustand) — avoids unnecessary global state for UI-only filtering"
  - "operationName filter used as passthrough (not in TripFilters type) to avoid schema change — filtered client-side via spread"
  - "ViagensTabs counts derived from full unfiltered useTrips() to show total counts per status"
metrics:
  duration: "~15 min"
  completed: "2026-04-28"
  tasks_completed: 2
  tasks_total: 2
  files_created: 9
  files_modified: 2
---

# Phase 1 Plan 05: Viagens e Motoristas — Summary

**One-liner:** TableWithSidePanel pattern validated across Viagens (4-tab + lateral filters) and Motoristas (search/status/base header + doc compliance panel).

## Pages Implemented

### /viagens — ViagensPage

**Sub-components:**
- `ViagensKPIRow` — 5 KPIs from `useViagensKPIs()`: Total viagens, No prazo (%), Em risco (%), Atrasadas (%), Progresso médio (progress bar)
- `ViagensTabs` — 4 tabs (Em andamento, Planejadas, Concluídas, Atrasadas) with real counts from `useTrips()`, synced to `useUIStore.activeTripsTab`
- `ViagensFiltersPanel` — Sidebar filters: Motorista (search), Cliente (select), Operação (select), Rota (select), Prioridade (select), SLA/Janela (select) + "Limpar filtros"
- `ViagensTable` — `TableWithSidePanel` with 11 columns: select checkbox, Código+priority dot, Cliente, Motorista (avatar+placa), Origem, Destino, Janela, ETA, Status badge, Progresso (bar), Actions menu
- `TripDetailPanel` — Painel lateral: StatusBadge, MapPlaceholder (160px), metrics grid (8 fields), TripTimeline events, footer with Ver detalhes/Editar/Reagendar buttons

### /motoristas — MotoristasPage

**Sub-components:**
- `MotoristasKPIRow` — 5 KPIs from `useMotoristasKPIs()`: Motoristas ativos (total), Disponíveis, Em rota, Com atraso, Documentos vencendo
- `MotoristasTable` — Header filters (Search input, Status select, Base select, Ordenar/Filtros/Exportar buttons) + `TableWithSidePanel` with 8 columns: Motorista (avatar+plate+vehicle), Disponibilidade (badge), Entregas hoje, Atraso médio (color-coded), Score (badge), Documentos (icons), Localização, Actions
- `DriverDetailPanel` — Painel lateral: DriverAvatar (lg), status badge, score, quick actions (Ligar/Mensagem/E-mail), Conformidade e documentos (list with icons + expiry dates), Localização atual (MapPlaceholder 140px + coordinates), Últimas viagens (5 most recent from useTrips filtered by driverId)

## Patterns Used

| Pattern | Usage |
|---------|-------|
| `TableWithSidePanel` | Both /viagens and /motoristas — tabela + painel lateral ao clicar linha |
| `TripTimeline` | TripDetailPanel — exibe eventos cronológicos da viagem |
| `MapPlaceholder` | TripDetailPanel (160px) e DriverDetailPanel (140px) |
| `SidePanelLayout` | Base para TripDetailPanel e DriverDetailPanel |
| Zustand UIStore | `activeTripsTab`, `selectedTripId`, `selectedDriverId` |
| Local filter state | `ViagensFiltersPanel` state owned by `ViagensPage` via `useState` |

## Build Verification

```
npm run build — EXIT 0
npx tsc --noEmit — EXIT 0 (no type errors)
```

Build output: 685.85 kB (gzip: 211.20 kB) — chunk size warning is pre-existing, not introduced by this plan.

## Deviations from Plan

None — plan executed exactly as written. The `operationName` filter uses a passthrough cast in `ViagensFiltersPanel` since `TripFilters` type does not include `operationName`; this is a display-only filter that passes through to the component without breaking type safety.

## Known Stubs

None — all data wired from hooks (useTrips, useDrivers, useViagensKPIs, useMotoristasKPIs, useTripTimeline). No hardcoded placeholders in rendered output.

## Threat Flags

None — no new network endpoints, auth paths, or trust boundary crossings introduced. Filtered inputs are React controlled state only (no eval/innerHTML). Consistent with T-01-10 accepted disposition.

## Self-Check: PASSED

Files exist:
- torre-de-controle/src/app/pages/viagens/ViagensPage.tsx — FOUND
- torre-de-controle/src/app/pages/viagens/components/ViagensKPIRow.tsx — FOUND
- torre-de-controle/src/app/pages/viagens/components/ViagensTabs.tsx — FOUND
- torre-de-controle/src/app/pages/viagens/components/ViagensFiltersPanel.tsx — FOUND
- torre-de-controle/src/app/pages/viagens/components/ViagensTable.tsx — FOUND
- torre-de-controle/src/app/pages/viagens/components/TripDetailPanel.tsx — FOUND
- torre-de-controle/src/app/pages/motoristas/MotoristasPage.tsx — FOUND
- torre-de-controle/src/app/pages/motoristas/components/MotoristasKPIRow.tsx — FOUND
- torre-de-controle/src/app/pages/motoristas/components/MotoristasTable.tsx — FOUND
- torre-de-controle/src/app/pages/motoristas/components/DriverDetailPanel.tsx — FOUND

Commits:
- 6973903 feat(01-05): Viagens page — FOUND
- 0d3eeda feat(01-05): Motoristas page — FOUND
