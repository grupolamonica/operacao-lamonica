---
phase: 01-ui-shell-design-system
plan: "02"
subsystem: frontend-shell
tags:
  - layout
  - design-system
  - routing
  - shadcn
  - tanstack-table
  - chartjs
  - zustand
dependency_graph:
  requires:
    - "01-01: project setup (Vite + React + shadcn + Tailwind v4)"
  provides:
    - "AppLayout (SidebarProvider + dark Sidebar + Topbar + Outlet)"
    - "React Router v6 with 8 routes"
    - "useUIStore Zustand store"
    - "12 domain components"
    - "7 date/number formatters"
  affects:
    - "01-03: types/mock-data (will import domain component types)"
    - "01-04: dashboard/torre-de-controle (will replace page stubs)"
    - "01-05: viagens/motoristas (will replace page stubs)"
    - "01-06: alertas/stubs (will replace page stubs)"
tech_stack:
  added:
    - "react-router-dom@6.30.3 (RouterProvider, createBrowserRouter)"
    - "zustand@5.0.12 (useUIStore)"
    - "chart.js@4.5.1 + react-chartjs-2@5.3.1 (SparklineChart)"
    - "@tanstack/react-table@8.21.3 (DataTable)"
    - "date-fns@4.1.0 (formatters)"
  patterns:
    - "CSS Grid split panel (minmax(0,1fr) for table+panel)"
    - "shadcn SidebarProvider at layout root"
    - "Chart.js explicit module registration (tree-shaking)"
    - "TanStack Table getRowId for stable row identity"
    - "useEffect selection reset when data changes"
key_files:
  created:
    - torre-de-controle/src/app/layout/AppLayout.tsx
    - torre-de-controle/src/app/layout/AppSidebar.tsx
    - torre-de-controle/src/app/layout/Topbar.tsx
    - torre-de-controle/src/app/router.tsx
    - torre-de-controle/src/stores/useUIStore.ts
    - torre-de-controle/src/lib/formatters.ts
    - torre-de-controle/src/components/domain/StatusBadge.tsx
    - torre-de-controle/src/components/domain/SeverityBadge.tsx
    - torre-de-controle/src/components/domain/KPICard.tsx
    - torre-de-controle/src/components/domain/SparklineChart.tsx
    - torre-de-controle/src/components/domain/ProgressBar.tsx
    - torre-de-controle/src/components/domain/DriverAvatar.tsx
    - torre-de-controle/src/components/domain/MapPlaceholder.tsx
    - torre-de-controle/src/components/domain/DataTable.tsx
    - torre-de-controle/src/components/domain/SidePanelLayout.tsx
    - torre-de-controle/src/components/domain/TableWithSidePanel.tsx
    - torre-de-controle/src/components/domain/AlertItem.tsx
    - torre-de-controle/src/components/domain/TripTimeline.tsx
    - torre-de-controle/src/app/pages/dashboard/DashboardPage.tsx
    - torre-de-controle/src/app/pages/torre-de-controle/TorreDeControlePage.tsx
    - torre-de-controle/src/app/pages/viagens/ViagensPage.tsx
    - torre-de-controle/src/app/pages/motoristas/MotoristasPage.tsx
    - torre-de-controle/src/app/pages/geofences/GeofencesPage.tsx
    - torre-de-controle/src/app/pages/alertas/AlertasPage.tsx
    - torre-de-controle/src/app/pages/insights/InsightsPage.tsx
    - torre-de-controle/src/app/pages/configuracoes/ConfiguracoesPage.tsx
  modified:
    - torre-de-controle/src/main.tsx
    - torre-de-controle/src/App.tsx
decisions:
  - "useUIStore does NOT contain isSidebarCollapsed — shadcn SidebarProvider owns sidebar state to avoid dual source of truth"
  - "TableWithSidePanel uses minmax(0,1fr) not 1fr to prevent table overflow when side panel opens"
  - "SidebarMenuButton uses asChild pattern with NavLink for React Router integration"
  - "Chart.js registers CategoryScale+LinearScale+PointElement+LineElement+Filler explicitly for tree-shaking"
  - "DataTable uses getRowId:(row)=>row.id for stable row identity across pagination/filter changes"
metrics:
  duration: "5m 31s"
  completed: "2026-04-28"
  tasks_completed: 3
  tasks_total: 3
  files_created: 26
  files_modified: 2
---

# Phase 1 Plan 02: Layout + Design System Summary

**One-liner:** React Router v6 shell with dark shadcn Sidebar (#1a1a2e), 8 routes, Zustand UIStore, and 12 domain components (badges/KPI/sparkline/table/panel) using CSS Grid split panel pattern.

## Objective Achieved

Full frontend shell established: navigable SPA with dark sidebar, white topbar, 8 routes, Zustand store for selected entity IDs, and a complete domain component library for Wave 2 pages to consume.

## Tasks Completed

| # | Task | Commit | Status |
|---|------|--------|--------|
| 1 | AppLayout + Router + Page Stubs + UIStore | 048ec7e | Done |
| 2 | Badges + KPI + Sparkline + Progress + Avatar + Formatters | f434e7e | Done |
| 3 | DataTable + SidePanelLayout + TableWithSidePanel + AlertItem + TripTimeline | a4c6bd6 | Done |

## Router Routes (8)

```
/ → redirect → /dashboard
/dashboard → DashboardPage
/torre-de-controle → TorreDeControlePage
/viagens → ViagensPage
/motoristas → MotoristasPage
/geofences → GeofencesPage
/alertas → AlertasPage
/insights → InsightsPage
/configuracoes → ConfiguracoesPage
```

## Zustand useUIStore (5 states)

| State | Type | Default |
|-------|------|---------|
| selectedTripId | string \| null | null |
| selectedDriverId | string \| null | null |
| selectedAlertId | string \| null | null |
| activeTripsTab | TripsTab | 'em_andamento' |
| (+ setters for each) | | |

Note: `isSidebarCollapsed` intentionally absent — shadcn SidebarProvider owns sidebar state.

## 12 Domain Components

| Component | Purpose | Key Props |
|-----------|---------|-----------|
| StatusBadge | SLA status badge (4 variants) | status: no_prazo\|em_risco\|atrasado\|sem_sinal |
| SeverityBadge | Alert severity badge (3 variants) | severity: critico\|medio\|baixo |
| KPICard | KPI card with sparkline + progress | title, value, sparklineData, progressValue, color |
| SparklineChart | Mini Chart.js line chart (no axes) | data, color, height, fill |
| ProgressBar | 0-100 progress bar | value, color, height, showLabel |
| DriverAvatar | Avatar with status dot | name, photoUrl, status, size |
| MapPlaceholder | Dark map container (Phase 3 stub) | height, showLegend |
| DataTable | TanStack Table wrapper | data, columns, onRowClick, selectedId, pageSize |
| SidePanelLayout | Detail panel layout | title, subtitle, onClose, children, footer |
| TableWithSidePanel | CSS Grid table+panel | data, columns, selectedItem, onSelect, renderPanel |
| AlertItem | Alert row (queue/list variants) | alert, onAssume, onCall, onClick, variant |
| TripTimeline | Vertical event timeline | events: TimelineEvent[] |

## Formatters (7 functions)

`formatDate`, `formatTime`, `formatDuration`, `formatRelative`, `formatPercent`, `formatKm`, `minutesBetween` — all using date-fns + ptBR locale.

## Build Verification

```
npm run build: ✓ built in 2.38s
npx tsc --noEmit: PASSED
grep dangerouslySetInnerHTML src/: 0 occurrences
```

Bundle: 329.47 kB JS (106.79 kB gzipped) + 62.78 kB CSS (10.95 kB gzipped)

## Deviations from Plan

None — plan executed exactly as written.

The only pre-existing deviation (from Plan 01) is `@vitejs/plugin-react@4.3.4` instead of the plan-specced 6.0.1. This has no effect on Plan 02.

## Known Stubs

All 8 page components are intentional stubs with placeholder content. Plans 04/05/06 will replace their content with real mock data + components. This is by design — Phase 1 establishes the shell, Wave 2 fills it.

| Component | File | Note |
|-----------|------|------|
| DashboardPage | src/app/pages/dashboard/DashboardPage.tsx | Stub for Plan 04 |
| TorreDeControlePage | src/app/pages/torre-de-controle/TorreDeControlePage.tsx | Stub for Plan 04 |
| ViagensPage | src/app/pages/viagens/ViagensPage.tsx | Stub for Plan 05 |
| MotoristasPage | src/app/pages/motoristas/MotoristasPage.tsx | Stub for Plan 05 |
| GeofencesPage | src/app/pages/geofences/GeofencesPage.tsx | Stub (no dedicated plan) |
| AlertasPage | src/app/pages/alertas/AlertasPage.tsx | Stub for Plan 06 |
| InsightsPage | src/app/pages/insights/InsightsPage.tsx | Stub (no dedicated plan) |
| ConfiguracoesPage | src/app/pages/configuracoes/ConfiguracoesPage.tsx | Stub (no dedicated plan) |

MapPlaceholder is an intentional stub — Mapbox GL JS integration is Phase 3.

## Self-Check: PASSED

All files exist, commits verified:
- `048ec7e` — Task 1 (AppLayout, router, stubs, UIStore)
- `f434e7e` — Task 2 (badges, KPI, sparkline, progress, avatar, formatters)
- `a4c6bd6` — Task 3 (DataTable, SidePanelLayout, TableWithSidePanel, AlertItem, TripTimeline)
