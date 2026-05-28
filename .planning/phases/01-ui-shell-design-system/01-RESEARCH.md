# Phase 1: UI Shell + Design System — Research

**Pesquisado em:** 2026-04-28
**Domínio:** React 18 + Vite 5 + TypeScript + shadcn/ui + Tailwind v4 — SPA frontend
**Confiança geral:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- React 18 com TypeScript (strict mode)
- Vite 5 como build tool (NÃO Next.js — sem SSR necessário no MVP)
- React Router v6 para roteamento SPA
- shadcn/ui para componentes funcionais
- Tailwind CSS (base do shadcn) + Argon Dashboard CSS como inspiração visual
- TanStack Table v8 para tabelas com virtualização
- Chart.js 4 para gráficos (já presente no Argon Dashboard)
- date-fns para formatação de datas
- Zustand para estado global (stores de UI: sidebar collapsed, selected trip/driver/alert)

### Estrutura de Diretórios (locked)
```
src/
  app/layout/               # AppLayout, Sidebar, Topbar
  app/pages/                # Uma pasta por página
  components/ui/            # shadcn/ui base
  components/domain/        # KPICard, StatusBadge, VehicleIcon, etc.
  data/types.ts             # Todas as interfaces (Trip, Driver, Alert, etc.)
  data/mocks/               # Arquivos de dados mock
  hooks/                    # Hooks de dados mock (useTrips, useDrivers, etc.)
  lib/                      # Utilities, formatters
  stores/                   # Zustand stores
```

### Design System (locked)
- Sidebar background: `#1a1a2e` (dark navy)
- Sidebar text: `#8892b0` (idle), `#ffffff` (active)
- Active nav item: bg azul `#0f62fe` + texto branco
- KPI cards: fundo branco, sombra sutil
- Status colors: verde `#2ecc71`, amarelo `#f39c12`, vermelho `#e74c3c`, cinza `#95a5a6`
- Background geral: `#f4f6f9`
- Topbar: branco

### Deferred Ideas (OUT OF SCOPE)
- Login/auth screen — Phase 2
- WebSocket real-time — Phase 3
- Geofence draw/edit — Phase 5
- Mobile responsiveness — Phase 6
- Dark mode alternativo — Phase 6
- Internacionalização — fora do escopo MVP

</user_constraints>

---

## Summary

Phase 1 entrega o shell completo do frontend: setup de projeto do zero, 8 rotas navegáveis, 5 páginas com dados mock que reproduzem as imagens de design. Nenhum backend é conectado — todos os dados vêm de hooks mock.

O desafio central é a combinação de **sidebar dark permanente com conteúdo light** sem ativar full dark mode. shadcn/ui resolve isso via CSS variables específicas para o Sidebar component (`--sidebar`, `--sidebar-foreground`, etc.) que são independentes das variáveis globais de tema. A sidebar navega em `#1a1a2e` enquanto o conteúdo principal permanece em fundo claro — sem conflito.

O segundo desafio é o **padrão de side panel** para tabelas: ao clicar em uma linha, o painel lateral desliza e a tabela se encolhe. O padrão correto usa CSS Grid com `grid-template-columns` dinâmico (ex: `1fr 0` → `1fr 400px`), `transition`, e `overflow: hidden` no painel. Não use Modal — o contexto da tabela deve permanecer visível.

A **estratégia de mock → real API** usa uma camada de abstração via hooks: `useTrips()`, `useDrivers()`, `useAlerts()` retornam dados mock em Phase 1, e em Phase 2 o corpo é trocado por chamadas TanStack Query sem mudar nenhum consumidor.

**Recomendação primária:** Use `npm create vite@latest` com template `react-ts`, depois instale React 18 manualmente (o template padrão agora instala React 19), use Tailwind v4 com `@tailwindcss/vite`, e inicialize shadcn com `npx shadcn@latest init`.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Navegação e routing | Browser/SPA | — | React Router v6, client-side only |
| UI Shell (sidebar, topbar) | Browser/SPA | — | Layout estático, sem SSR |
| Estado de UI (seleção, collapsed) | Browser/SPA | — | Zustand stores client-only |
| Dados mock | Browser/SPA (hooks) | — | Retornam dados estáticos, Phase 1 |
| Tabelas com filtro/paginação | Browser/SPA | — | TanStack Table client-side |
| Sparklines/Charts | Browser/SPA | — | Chart.js + react-chartjs-2, render client |
| Mapa placeholder | Browser/SPA | — | Container estático, token não necessário |
| Formatação de datas | Browser/SPA | — | date-fns no client |
| Tipos TypeScript | Compartilhado | — | Definidos em `data/types.ts`, reutilizados em Phase 2+ |

---

## Standard Stack

### Core

| Library | Versão | Purpose | Why Standard |
|---------|--------|---------|--------------|
| react | 18.3.1 | UI framework | Locked. Vite template instala 19 — override manual necessário |
| react-dom | 18.3.1 | DOM renderer | Par de react |
| vite | 5.4.21 | Build tool | Locked. Vite 8 (latest) existe mas projeto usa v5 |
| @vitejs/plugin-react | 6.0.1 | JSX transform | Plugin oficial React para Vite |
| typescript | 5.x | Type checking | strict mode locked |
| tailwindcss | 4.2.4 | Utility CSS | shadcn agora usa Tailwind v4 nativamente |
| @tailwindcss/vite | 4.2.4 | Vite plugin | Substitui postcss config no Tailwind v4 |
| shadcn (CLI) | 4.5.0 | Component CLI | Novo nome — era `shadcn-ui` |
| react-router-dom | 6.30.3 | SPA routing | Locked. v7 existe mas projeto usa v6 |

[VERIFIED: npm registry — 2026-04-28]

### Supporting

| Library | Versão | Purpose | When to Use |
|---------|--------|---------|-------------|
| @tanstack/react-table | 8.21.3 | Data tables | Todas as tabelas com row selection, filtros, paginação |
| zustand | 5.0.12 | Global state | UI state: sidebar, selected items |
| chart.js | 4.5.1 | Charts | KPI sparklines, lock to v4 para compat com react-chartjs-2 |
| react-chartjs-2 | 5.3.1 | React wrapper Chart.js | Obrigatório para usar Chart.js em React |
| date-fns | 4.1.0 | Date formatting | Locked |
| lucide-react | 0.511.0 | Icons | Padrão shadcn/ui, ~1400 ícones |
| class-variance-authority | 0.7.1 | Variant CSS classes | Usado internamente por shadcn |
| clsx | 2.1.1 | Conditional classes | Utilitário padrão shadcn |
| tailwind-merge | 3.x | Merge Tailwind classes | `cn()` helper padrão shadcn |

[VERIFIED: npm registry — 2026-04-28]

### Alternativas Consideradas

| Ao invés de | Poderia usar | Tradeoff |
|-------------|--------------|----------|
| react-chartjs-2 | recharts | recharts é mais React-friendly mas Chart.js já está no Argon (consistência) |
| TanStack Table | AG Grid Community | AG Grid tem mais features mas é pesado; TanStack é headless e leve |
| Zustand | Jotai / Recoil | Zustand locked — simples e sem boilerplate |
| Tailwind v4 | Tailwind v3 | shadcn atual usa v4; v3 ainda funciona mas componentes novos assumem v4 |

### Instalação

```bash
# 1. Criar projeto (instala React 19 por padrão — override manual a seguir)
npm create vite@5 torre-de-controle -- --template react-ts
cd torre-de-controle

# 2. Override para React 18 (vite template default é React 19)
npm install react@18.3.1 react-dom@18.3.1
npm install -D @types/react@18 @types/react-dom@18

# 3. Tailwind v4 + shadcn
npm install tailwindcss @tailwindcss/vite
npm install -D @types/node

# 4. shadcn init (vai guiar configuração interativa)
npx shadcn@latest init
# Selecionar: New York style, Zinc base, CSS variables: yes

# 5. Rotas + Estado
npm install react-router-dom@6 zustand

# 6. Tabelas + Gráficos
npm install @tanstack/react-table chart.js react-chartjs-2 date-fns

# 7. Componentes shadcn necessários
npx shadcn@latest add sidebar button badge card table tabs input select
npx shadcn@latest add dropdown-menu scroll-area separator tooltip avatar
npx shadcn@latest add progress dialog sheet
```

---

## Architecture Patterns

### System Architecture Diagram

```
                    Browser (React 18 SPA)
                           │
              ┌────────────▼────────────┐
              │     React Router v6      │
              │   (SPA — client-only)    │
              └────────────┬────────────┘
                           │ matched route
              ┌────────────▼────────────────────────────┐
              │            AppLayout                     │
              │  ┌──────────┐  ┌────────────────────┐  │
              │  │ Sidebar  │  │    Page Content     │  │
              │  │ (dark)   │  │  ┌──────────────┐  │  │
              │  │          │  │  │   Topbar     │  │  │
              │  │ nav      │  │  └──────────────┘  │  │
              │  │ items    │  │  ┌──────────────┐  │  │
              │  │          │  │  │  Page (KPIs, │  │  │
              │  └──────────┘  │  │  Table,      │  │  │
              │                │  │  SidePanel)  │  │  │
              │                │  └──────────────┘  │  │
              │                └────────────────────┘  │
              └─────────────────────────────────────────┘
                           │
              ┌────────────▼────────────┐
              │      Zustand Stores      │
              │  useUIStore (sidebar,    │
              │  selected trip/driver/   │
              │  alert, panel open)      │
              └────────────┬────────────┘
                           │
              ┌────────────▼────────────┐
              │    Mock Data Hooks       │
              │  useTrips / useDrivers   │
              │  useAlerts / useKPIs     │
              │  (retornam dados mock   │
              │   estáticos de data/)    │
              └────────────┬────────────┘
                           │
              ┌────────────▼────────────┐
              │     data/mocks/          │
              │  trips.ts / drivers.ts   │
              │  alerts.ts / kpis.ts     │
              └─────────────────────────┘
```

### Estrutura de Projeto Recomendada

```
torre-de-controle/
├── src/
│   ├── app/
│   │   ├── layout/
│   │   │   ├── AppLayout.tsx         # Sidebar + Topbar + Outlet wrapper
│   │   │   ├── Sidebar.tsx           # Dark sidebar com nav items
│   │   │   └── Topbar.tsx            # Search + date picker + avatar
│   │   ├── pages/
│   │   │   ├── dashboard/
│   │   │   │   └── DashboardPage.tsx
│   │   │   ├── torre-de-controle/
│   │   │   │   └── TorreDeControlePage.tsx
│   │   │   ├── viagens/
│   │   │   │   └── ViagensPage.tsx
│   │   │   ├── motoristas/
│   │   │   │   └── MotoristasPage.tsx
│   │   │   ├── geofences/
│   │   │   │   └── GeofencesPage.tsx
│   │   │   ├── alertas/
│   │   │   │   └── AlertasPage.tsx
│   │   │   ├── insights/
│   │   │   │   └── InsightsPage.tsx
│   │   │   └── configuracoes/
│   │   │       └── ConfiguracoesPage.tsx
│   │   └── router.tsx                # createBrowserRouter com nested routes
│   ├── components/
│   │   ├── ui/                       # shadcn gerado (button, badge, etc.)
│   │   └── domain/
│   │       ├── KPICard.tsx
│   │       ├── StatusBadge.tsx
│   │       ├── SeverityBadge.tsx
│   │       ├── SparklineChart.tsx
│   │       ├── DataTable.tsx         # TanStack Table wrapper
│   │       ├── SidePanelLayout.tsx   # Layout padrão painéis laterais
│   │       ├── ProgressBar.tsx
│   │       ├── DriverAvatar.tsx
│   │       ├── AlertItem.tsx
│   │       ├── TripTimeline.tsx
│   │       └── MapPlaceholder.tsx
│   ├── data/
│   │   ├── types.ts                  # Trip, Driver, Alert, KPI interfaces
│   │   └── mocks/
│   │       ├── trips.ts
│   │       ├── drivers.ts
│   │       ├── alerts.ts
│   │       └── kpis.ts
│   ├── hooks/
│   │   ├── useTrips.ts
│   │   ├── useDrivers.ts
│   │   ├── useAlerts.ts
│   │   └── useDashboardKPIs.ts
│   ├── stores/
│   │   ├── useUIStore.ts             # sidebar collapsed, selected IDs, panel open
│   │   └── index.ts
│   ├── lib/
│   │   ├── utils.ts                  # cn() helper (tailwind-merge + clsx)
│   │   └── formatters.ts             # formatDate, formatDuration, formatPercent
│   ├── index.css                     # @import "tailwindcss" + CSS variables
│   └── main.tsx
├── components.json                    # shadcn config
├── tsconfig.json
├── tsconfig.app.json
└── vite.config.ts
```

### Pattern 1: React Router v6 Nested Layout

```tsx
// src/app/router.tsx
// Source: https://reactrouter.com/en/main/route/route#layout-routes
import { createBrowserRouter, Navigate } from 'react-router-dom'
import { AppLayout } from './layout/AppLayout'

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { index: true, element: <Navigate to="/dashboard" replace /> },
      { path: 'dashboard', element: <DashboardPage /> },
      { path: 'torre-de-controle', element: <TorreDeControlePage /> },
      { path: 'viagens', element: <ViagensPage /> },
      { path: 'motoristas', element: <MotoristasPage /> },
      { path: 'geofences', element: <GeofencesPage /> },
      { path: 'alertas', element: <AlertasPage /> },
      { path: 'insights', element: <InsightsPage /> },
      { path: 'configuracoes', element: <ConfiguracoesPage /> },
    ],
  },
])

// src/app/layout/AppLayout.tsx
import { Outlet } from 'react-router-dom'
export function AppLayout() {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex flex-col flex-1 overflow-hidden">
        <Topbar />
        <main className="flex-1 overflow-auto bg-[#f4f6f9] p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
```

[CITED: https://reactrouter.com/en/main/route/route#layout-routes]

### Pattern 2: Sidebar Dark com Conteúdo Light (sem full dark mode)

**Abordagem:** shadcn/ui Sidebar component tem CSS variables próprias (`--sidebar`, `--sidebar-foreground`, etc.) independentes das variáveis globais. Override no `:root` para aplicar dark nav sem `.dark` class no `<html>`.

```css
/* src/index.css */
@import "tailwindcss";

/* Variáveis globais shadcn (conteúdo light) */
:root {
  --background: oklch(1 0 0);
  --foreground: oklch(0.145 0 0);
  --card: oklch(1 0 0);
  --primary: oklch(0.205 0 0);
  --radius: 0.5rem;

  /* Sidebar — dark navy independente do tema global */
  --sidebar: #1a1a2e;
  --sidebar-foreground: #8892b0;
  --sidebar-primary: #0f62fe;
  --sidebar-primary-foreground: #ffffff;
  --sidebar-accent: rgba(255, 255, 255, 0.08);
  --sidebar-accent-foreground: #ffffff;
  --sidebar-border: rgba(255, 255, 255, 0.08);
  --sidebar-ring: #0f62fe;

  /* Status colors (custom tokens) */
  --status-no-prazo: #2ecc71;
  --status-em-risco: #f39c12;
  --status-atrasado: #e74c3c;
  --status-sem-sinal: #95a5a6;
}

/* @theme inline — mapeia vars para utilitários Tailwind */
@theme inline {
  --color-sidebar: var(--sidebar);
  --color-sidebar-foreground: var(--sidebar-foreground);
  --color-status-no-prazo: var(--status-no-prazo);
  --color-status-em-risco: var(--status-em-risco);
  --color-status-atrasado: var(--status-atrasado);
  --color-status-sem-sinal: var(--status-sem-sinal);
}
```

```tsx
// src/app/layout/Sidebar.tsx
import { Sidebar, SidebarContent, SidebarProvider } from '@/components/ui/sidebar'

// O componente shadcn Sidebar aplica automaticamente var(--sidebar) como background
// Não é necessário classe .dark — as vars de sidebar são independentes
export function AppSidebar() {
  return (
    <Sidebar collapsible="icon">
      {/* Logo + title */}
      <SidebarHeader>
        <div className="flex items-center gap-2 px-4 py-3">
          {/* ícone antena */}
          <span className="text-white font-bold text-xs tracking-widest">
            TORRE DE CONTROLE<br/>
            <span className="text-[#0f62fe]">DE ENTREGAS</span>
          </span>
        </div>
      </SidebarHeader>
      <SidebarContent>
        {/* nav items */}
      </SidebarContent>
    </Sidebar>
  )
}
```

[CITED: https://ui.shadcn.com/docs/theming, https://ui.shadcn.com/docs/components/sidebar]

### Pattern 3: Side Panel — Tabela encolhe ao abrir detalhes

**Não use Modal, Sheet nem Drawer** para este padrão. A tabela deve permanecer visível (encolhida) ao lado do painel.

```tsx
// src/components/domain/TableWithSidePanel.tsx
// Padrão: CSS Grid com transição de colunas

interface TableWithSidePanelProps<T> {
  data: T[]
  columns: ColumnDef<T>[]
  renderPanel: (item: T) => React.ReactNode
}

export function TableWithSidePanel<T>({ data, columns, renderPanel }: TableWithSidePanelProps<T>) {
  const [selectedItem, setSelectedItem] = useState<T | null>(null)
  const isPanelOpen = selectedItem !== null

  return (
    <div
      className="grid transition-all duration-300 ease-in-out"
      style={{
        gridTemplateColumns: isPanelOpen ? '1fr 400px' : '1fr 0px',
        gap: isPanelOpen ? '16px' : '0px',
      }}
    >
      {/* Tabela (encolhe) */}
      <div className="overflow-hidden">
        <DataTable
          data={data}
          columns={columns}
          onRowClick={(row) => setSelectedItem(row)}
          selectedId={(selectedItem as any)?.id}
        />
      </div>

      {/* Painel lateral (desliza) */}
      <div
        className="overflow-hidden transition-all duration-300"
        style={{ width: isPanelOpen ? '400px' : '0px' }}
      >
        {selectedItem && (
          <SidePanelLayout onClose={() => setSelectedItem(null)}>
            {renderPanel(selectedItem)}
          </SidePanelLayout>
        )}
      </div>
    </div>
  )
}
```

[ASSUMED: Padrão CSS Grid para side panel — não há documentação oficial específica, baseado em padrões de dashboards conhecidos]

### Pattern 4: Mock Data Hooks (swappable em Phase 2)

```typescript
// src/hooks/useTrips.ts
// Abstração que Phase 2 troca por TanStack Query sem mudar consumidores

import { useMemo } from 'react'
import { mockTrips } from '@/data/mocks/trips'
import type { Trip, TripFilters } from '@/data/types'

interface UseTripsReturn {
  data: Trip[]
  isLoading: boolean
  error: Error | null
}

export function useTrips(filters?: TripFilters): UseTripsReturn {
  // Phase 1: dados mock
  const data = useMemo(() => {
    if (!filters) return mockTrips
    return mockTrips.filter(trip =>
      (!filters.status || trip.status === filters.status) &&
      (!filters.slaStatus || trip.slaStatus === filters.slaStatus)
    )
  }, [filters])

  return { data, isLoading: false, error: null }
}

// Phase 2: troca apenas o corpo, interface permanece igual:
// export function useTrips(filters?: TripFilters): UseTripsReturn {
//   const { data, isLoading, error } = useQuery({
//     queryKey: ['trips', filters],
//     queryFn: () => api.get('/trips', { params: filters }),
//   })
//   return { data: data?.data ?? [], isLoading, error }
// }
```

[VERIFIED: padrão de abstração confirmado em múltiplas fontes de TanStack Query docs]

### Pattern 5: Zustand UI Store

```typescript
// src/stores/useUIStore.ts
// Source: https://zustand.docs.pmnd.rs/learn/guides/slices-pattern

import { create } from 'zustand'

interface UIState {
  // Sidebar
  isSidebarCollapsed: boolean
  toggleSidebar: () => void

  // Trip
  selectedTripId: string | null
  setSelectedTripId: (id: string | null) => void

  // Driver
  selectedDriverId: string | null
  setSelectedDriverId: (id: string | null) => void

  // Alert
  selectedAlertId: string | null
  setSelectedAlertId: (id: string | null) => void

  // Viagens page
  activeTripsTab: 'em_andamento' | 'planejadas' | 'concluidas' | 'atrasadas'
  setActiveTripsTab: (tab: UIState['activeTripsTab']) => void
}

export const useUIStore = create<UIState>((set) => ({
  isSidebarCollapsed: false,
  toggleSidebar: () => set((s) => ({ isSidebarCollapsed: !s.isSidebarCollapsed })),

  selectedTripId: null,
  setSelectedTripId: (id) => set({ selectedTripId: id }),

  selectedDriverId: null,
  setSelectedDriverId: (id) => set({ selectedDriverId: id }),

  selectedAlertId: null,
  setSelectedAlertId: (id) => set({ selectedAlertId: id }),

  activeTripsTab: 'em_andamento',
  setActiveTripsTab: (tab) => set({ activeTripsTab: tab }),
}))
```

[VERIFIED: https://zustand.docs.pmnd.rs — slices pattern, TypeScript usage]

### Pattern 6: SparklineChart (Chart.js sem eixos)

```tsx
// src/components/domain/SparklineChart.tsx
// react-chartjs-2 v5 + Chart.js v4

import { Line } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
} from 'chart.js'

// Registrar apenas o necessário (tree-shaking)
ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement)

interface SparklineChartProps {
  data: number[]
  color: string // ex: '#f39c12'
  height?: number
}

export function SparklineChart({ data, color, height = 40 }: SparklineChartProps) {
  return (
    <Line
      height={height}
      data={{
        labels: data.map((_, i) => i.toString()),
        datasets: [{
          data,
          borderColor: color,
          borderWidth: 2,
          pointRadius: 0,
          tension: 0.4,
          fill: false,
        }],
      }}
      options={{
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { enabled: false },
        },
        scales: {
          x: { display: false },
          y: { display: false },
        },
        animation: false,
      }}
    />
  )
}
```

[VERIFIED: Chart.js docs + react-chartjs-2 npm page — padrão de registro seletivo e options para sparkline]

### Pattern 7: TanStack Table com Row Selection

```tsx
// src/components/domain/DataTable.tsx
// Source: https://tanstack.com/table/v8/docs/guide/row-selection

import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  type ColumnDef,
} from '@tanstack/react-table'
import { useState } from 'react'

interface DataTableProps<T> {
  data: T[]
  columns: ColumnDef<T>[]
  onRowClick?: (row: T) => void
  selectedId?: string
}

export function DataTable<T extends { id: string }>({
  data, columns, onRowClick, selectedId
}: DataTableProps<T>) {
  const [columnFilters, setColumnFilters] = useState([])
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 20 })

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    state: { columnFilters, pagination },
    onColumnFiltersChange: setColumnFilters,
    onPaginationChange: setPagination,
  })

  return (
    <div>
      <table>
        <thead>
          {table.getHeaderGroups().map(hg => (
            <tr key={hg.id}>
              {hg.headers.map(header => (
                <th key={header.id}>
                  {flexRender(header.column.columnDef.header, header.getContext())}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map(row => (
            <tr
              key={row.id}
              onClick={() => onRowClick?.(row.original)}
              className={row.original.id === selectedId ? 'bg-blue-50' : 'hover:bg-gray-50 cursor-pointer'}
            >
              {row.getVisibleCells().map(cell => (
                <td key={cell.id}>
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {/* Paginação */}
      <div className="flex items-center justify-between mt-4">
        <span className="text-sm text-gray-500">
          Página {table.getState().pagination.pageIndex + 1} de {table.getPageCount()}
        </span>
        <div className="flex gap-2">
          <button onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>
            Anterior
          </button>
          <button onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>
            Próxima
          </button>
        </div>
      </div>
    </div>
  )
}
```

[CITED: https://tanstack.com/table/v8/docs/guide/row-selection, https://tanstack.com/table/v8/docs/guide/pagination]

### Anti-Patterns a Evitar

- **Anti-pattern:** Passar `data-` do servidor para controlar dark mode. Para sidebar dark, use as CSS vars `--sidebar-*` do shadcn — não adicione `.dark` ao `<html>`.
- **Anti-pattern:** Criar Modal para detalhes ao clicar na linha. Use o padrão CSS Grid de split panel — melhora UX operacional.
- **Anti-pattern:** Importar Chart.js completo (`import ChartJS from 'chart.js/auto'`). Registre apenas os módulos necessários para reduzir bundle.
- **Anti-pattern:** Um Zustand store gigante com tudo. Separe por domínio (useUIStore, useMapStore em Phase 3). Para Phase 1, um único `useUIStore` serve.
- **Anti-pattern:** Mock data inline nos componentes. Centralize em `data/mocks/*.ts` para facilitar substituição.
- **Anti-pattern:** Usar `react-router-dom` v7 (o `npm install react-router-dom` instala v7 agora — **pinne explicitamente `@6`**).

---

## Don't Hand-Roll

| Problema | Não construir | Use em vez disso | Por quê |
|----------|--------------|------------------|---------|
| Dark sidebar com vars CSS | Classe CSS manual para sidebar | shadcn/ui Sidebar + CSS vars `--sidebar-*` | Já tem collapsible, mobile overlay, keyboard nav |
| Tabela com filtros | `<table>` + filter manualmente | TanStack Table v8 | Locked. 50+ edge cases em sort/filter/pagination |
| Sparkline chart | SVG ou canvas manual | Chart.js 4 + react-chartjs-2 | Locked. Chart.js tem anti-aliasing, animação, responsive |
| Date formatting | `new Date().toLocaleDateString()` | date-fns | Locked. Timezone-safe, locale-aware |
| Class merging condicional | Template literals + ternários | `cn()` (clsx + tailwind-merge) | Evita conflitos Tailwind como `bg-red-500 bg-blue-500` |
| Ícones | SVG inline | lucide-react | Padrão shadcn, tree-shakeable, consistente |

---

## Common Pitfalls

### Pitfall 1: `create-vite` instala React 19 por padrão
**O que acontece:** `npm create vite@latest -- --template react-ts` instala React 19.2.5 agora.
**Por quê:** O template foi atualizado após React 19 GA (Dezembro 2024).
**Como evitar:** Após criar o projeto, instalar React 18 explicitamente: `npm install react@18.3.1 react-dom@18.3.1 @types/react@18 @types/react-dom@18`.
**Sinais de alerta:** `package.json` mostra `"react": "^19.x"` após create-vite.

### Pitfall 2: `react-router-dom` sem versão instala v7
**O que acontece:** `npm install react-router-dom` instala v7.14.2 (breaking changes em relação a v6).
**Por quê:** v7 foi lançado em Novembro 2024.
**Como evitar:** Sempre especificar `npm install react-router-dom@6`.
**Sinais de alerta:** `import { createBrowserRouter }` funciona mas `<Link>` behavior muda.

### Pitfall 3: Tailwind v4 não usa `tailwind.config.js`
**O que acontece:** Em Tailwind v4, a configuração vai em `index.css` via `@theme inline`, não em `tailwind.config.js`.
**Por quê:** Tailwind v4 mudou a arquitetura de config para CSS-first.
**Como evitar:** Não criar `tailwind.config.js`. Usar `@import "tailwindcss"` no CSS + plugin `@tailwindcss/vite` no `vite.config.ts`.
**Sinais de alerta:** Utilitários customizados não aparecem no IntelliSense.

### Pitfall 4: shadcn CLI mudou de nome
**O que acontece:** `npx shadcn-ui@latest` falha ou instala versão antiga.
**Por quê:** O package foi renomeado para `shadcn` (sem o `-ui`) na versão 2.x+.
**Como evitar:** Usar `npx shadcn@latest init` e `npx shadcn@latest add [component]`.
**Sinais de alerta:** Erros de "package not found" ou componentes com API antiga.

### Pitfall 5: react-chartjs-2 requer registro explícito de módulos
**O que acontece:** Gráficos renderizam em branco sem erro óbvio.
**Por quê:** Chart.js v4 usa tree-shaking; componentes não registrados são no-op silenciosos.
**Como evitar:** Registrar módulos necessários com `ChartJS.register(...)` antes de usar qualquer componente.
**Sinais de alerta:** Canvas renderiza mas linha/barra não aparece.

### Pitfall 6: Sidebar shadcn requer SidebarProvider no root do layout
**O que acontece:** `useSidebar()` hook lança erro "must be used within SidebarProvider".
**Por quê:** SidebarProvider usa Context para gerenciar estado de collapsed.
**Como evitar:** Envolver `AppLayout` com `<SidebarProvider>` no nível raiz.
**Sinais de alerta:** Console error sobre Context faltando.

### Pitfall 7: CSS variables OKLCH vs hex
**O que acontece:** Definir CSS vars como `#1a1a2e` (hex) não funciona com utilitários Tailwind v4 gerados pelo `@theme inline`.
**Por quê:** Tailwind v4 usa OKLCH internamente; hex não é interpolável nos cálculos de opacidade (`bg-sidebar/50`).
**Como evitar:** Converter cores para OKLCH ou usar `color-mix()`. Para opacidade de sidebar items, usar `rgba()` diretamente no CSS em vez de utilitários Tailwind com modificador `/`.
**Alternativa:** Para os status colors (`#2ecc71`, etc.) e sidebar que não precisam de modificador de opacidade, hex funciona bem para classes simples como `bg-[#1a1a2e]`.

### Pitfall 8: TanStack Table — dados paginados desaparecem ao abrir side panel
**O que acontece:** Ao selecionar linha e abrir painel, se a tabela re-renderiza com filtro, a linha selecionada pode desaparecer.
**Por quê:** O estado de seleção é local à tabela; mudanças em `data` prop fazem re-match por index, não por ID.
**Como evitar:** Usar `getRowId` no `useReactTable` para mapear por ID estável: `getRowId: (row) => row.id`.

---

## Code Examples

### vite.config.ts completo

```typescript
// Source: https://ui.shadcn.com/docs/installation/vite
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
```

### tsconfig.app.json — paths

```json
{
  "compilerOptions": {
    "strict": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  }
}
```

### src/index.css — base

```css
@import "tailwindcss";

:root {
  /* Sidebar dark navy — independente do tema global */
  --sidebar: oklch(0.16 0.04 264);    /* aprox #1a1a2e */
  --sidebar-foreground: oklch(0.62 0.04 264);   /* #8892b0 */
  --sidebar-primary: oklch(0.46 0.22 264);       /* #0f62fe */
  --sidebar-primary-foreground: oklch(1 0 0);
  --sidebar-accent: oklch(1 0 0 / 0.08);
  --sidebar-accent-foreground: oklch(1 0 0);
  --sidebar-border: oklch(1 0 0 / 0.08);
}
```

### StatusBadge Component

```tsx
// src/components/domain/StatusBadge.tsx
const statusConfig = {
  no_prazo:  { label: 'No prazo',  classes: 'bg-green-100 text-green-700' },
  em_risco:  { label: 'Em risco',  classes: 'bg-yellow-100 text-yellow-700' },
  atrasado:  { label: 'Atrasado',  classes: 'bg-red-100 text-red-700' },
  sem_sinal: { label: 'Sem sinal', classes: 'bg-gray-100 text-gray-500' },
} as const

type SlaStatus = keyof typeof statusConfig

export function StatusBadge({ status, size = 'sm' }: { status: SlaStatus; size?: 'sm' | 'md' }) {
  const { label, classes } = statusConfig[status]
  return (
    <span className={cn(
      'inline-flex items-center rounded-full font-medium',
      size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm',
      classes
    )}>
      {label}
    </span>
  )
}
```

### KPICard Component

```tsx
// src/components/domain/KPICard.tsx
interface KPICardProps {
  title: string
  value: string | number
  subtitle?: string
  total?: number
  percent?: string
  trend?: 'up' | 'down' | 'neutral'
  sparklineData?: number[]
  progressValue?: number
  color?: 'green' | 'blue' | 'orange' | 'red' | 'purple' | 'gray'
}

const colorMap = {
  green: '#2ecc71', blue: '#0f62fe', orange: '#f39c12',
  red: '#e74c3c', purple: '#9b59b6', gray: '#95a5a6',
}

export function KPICard({ title, value, subtitle, sparklineData, progressValue, color = 'blue', percent }: KPICardProps) {
  return (
    <div className="bg-white rounded-lg shadow-sm p-4 flex flex-col gap-2">
      <span className="text-xs text-gray-500 font-medium uppercase tracking-wide">{title}</span>
      <div className="flex items-end justify-between">
        <div>
          <span className="text-2xl font-bold text-gray-900">{value}</span>
          {percent && <span className="ml-1 text-sm text-gray-500">{percent}</span>}
          {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
        </div>
        {sparklineData && (
          <SparklineChart data={sparklineData} color={colorMap[color]} height={40} />
        )}
      </div>
      {progressValue !== undefined && (
        <div className="w-full h-1.5 bg-gray-100 rounded-full">
          <div
            className="h-1.5 rounded-full transition-all"
            style={{ width: `${progressValue}%`, backgroundColor: colorMap[color] }}
          />
        </div>
      )}
    </div>
  )
}
```

### data/types.ts — interfaces principais

```typescript
// src/data/types.ts — usado por todo o projeto

export type SlaStatus = 'no_prazo' | 'em_risco' | 'atrasado' | 'sem_sinal'
export type TripStatus = 'planned' | 'in_progress' | 'completed' | 'delayed' | 'cancelled'
export type AlertSeverity = 'critico' | 'medio' | 'baixo'
export type AlertStatus = 'aberto' | 'em_tratativa' | 'resolvido'
export type DriverStatus = 'available' | 'on_route' | 'unavailable'

export interface Trip {
  id: string
  code: string
  driverId: string
  driverName: string
  driverPhoto?: string
  plate: string
  clientName: string
  origin: string
  destination: string
  windowStart: Date
  windowEnd: Date
  eta: Date
  status: TripStatus
  slaStatus: SlaStatus
  progressPct: number
  distanceTotal: number
  distanceDone: number
}

export interface Driver {
  id: string
  code: string        // MTR-7822
  name: string
  phone: string
  photoUrl?: string
  status: DriverStatus
  operationalScore: number
  plate: string
  vehicleType: string
  documents: DriverDocument[]
  deliveriesToday: number
  avgDelayMinutes: number
}

export interface DriverDocument {
  type: string          // CNH, Exame Toxicologico, Treinamento
  status: 'valido' | 'vence_em_breve' | 'vencido'
  expiresAt: Date
}

export interface Alert {
  id: string
  type: string
  severity: AlertSeverity
  status: AlertStatus
  tripId: string
  driverId: string
  driverName: string
  driverPhoto?: string
  plate: string
  clientName: string
  title: string
  description: string
  delayMinutes?: number
  deviationKm?: number
  occurredAt: Date
}

export interface KPIDashboard {
  entregas: { onTime: number; total: number; pct: number }
  sla: { pct: number; meta: number }
  motoristaEmRisco: { count: number; total: number; sparkline: number[] }
  atrasosCriticos: { count: number; total: number; sparkline: number[] }
  paradasNaoPlanejadas: { count: number; total: number; sparkline: number[] }
}

export interface TripFilters {
  status?: TripStatus
  slaStatus?: SlaStatus
  clientName?: string
  driverName?: string
}
```

---

## State of the Art

| Abordagem antiga | Abordagem atual (2025/2026) | Quando mudou | Impacto |
|-----------------|---------------------------|--------------|---------|
| `create-react-app` | `npm create vite` | 2023 (CRA deprecated) | Vite é o padrão; CRA não recebe mais updates |
| `shadcn-ui` CLI | `shadcn` CLI | 2024 | Package renomeado — usar `npx shadcn@latest` |
| Tailwind v3 config (`tailwind.config.js`) | Tailwind v4 CSS-first (`@theme inline`) | Jan 2025 | Sem config JS; variáveis no CSS |
| `react-router-dom@6` como latest | `react-router-dom@7` como latest | Nov 2024 | Pinnar `@6` explicitamente |
| `forwardRef` em componentes shadcn | Props com `data-slot` (React 19 pattern) | 2025 | shadcn novo default é sem forwardRef; não impacta uso |
| Chart.js importação total | Registro seletivo por módulo | v4+ | Bundle menor |

**Deprecated/outdated:**
- `react-scripts` / CRA: não usar. Vite + template-react-ts.
- `tailwindcss-animate`: substituído por `tw-animate-css` no Tailwind v4.
- `shadcn-ui` package: usar `shadcn`.

---

## Assumptions Log

| # | Claim | Seção | Risco se errado |
|---|-------|-------|-----------------|
| A1 | CSS Grid `grid-template-columns` com transição funciona bem para split panel | Pattern 3 | Pode precisar de lib como `react-resizable-panels` se performance do transition for ruim |
| A2 | Cores hex `#1a1a2e` funcionam diretamente nas CSS vars `--sidebar` sem precisar de OKLCH | Pattern 2 | shadcn pode não gerar utilitários com modificador de opacidade para essas vars; fallback: usar `bg-[#1a1a2e]` direto |
| A3 | React 18.3.1 + shadcn@4.5.0 sem conflito de peer deps | Standard Stack | Se houver conflito, usar `--legacy-peer-deps` no install |

---

## Open Questions

1. **Vite 5 vs Vite 8 (latest)**
   - O que sabemos: Projeto locked em Vite 5. Vite 8 é o latest atual.
   - O que é incerto: O comando `npm create vite@latest` instalará Vite 8. Pinnar `npm create vite@5` garante Vite 5.
   - Recomendação: Usar `npm create vite@5 -- --template react-ts` explicitamente.

2. **Tailwind v3 vs v4 para este projeto**
   - O que sabemos: shadcn@latest suporta ambos. Tailwind v4 é o default atual do shadcn.
   - O que é incerto: v4 tem pequenas breaking changes no CSS. Se surgir problema, v3 é fallback seguro.
   - Recomendação: Usar Tailwind v4 — é o que shadcn init configura por padrão em 2026.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Vite 5 (min 20.19+) | ✓ | 24.14.0 | — |
| npm | Package management | ✓ | 11.9.0 | — |
| npx (shadcn CLI) | shadcn init | ✓ | via npm 11.x | — |
| Git | VCS | ✓ | (repo ativo) | — |

**Nota:** O projeto novo será criado dentro de `torre-de-controle/` (subdiretório) para não conflitar com o projeto Argon Dashboard estático na raiz.

---

## Security Domain

> `security_enforcement: true`, `security_asvs_level: 1`

### Applicable ASVS Categories (Phase 1 — frontend only, sem auth)

| ASVS Category | Applies | Controle padrão |
|---------------|---------|-----------------|
| V2 Authentication | Não — Phase 2 | — |
| V3 Session Management | Não — Phase 2 | — |
| V4 Access Control | Não — Phase 2 | — |
| V5 Input Validation | Parcial — inputs de filtro | Filtros são client-side, sem envio ao server. Sanitização de display via React (JSX escapa por default) |
| V6 Cryptography | Não | — |

### Threat Patterns (Phase 1 scope)

| Pattern | STRIDE | Mitigação padrão |
|---------|--------|-----------------|
| XSS via mock data display | Spoofing/Tampering | React JSX escapa strings por default — não usar `dangerouslySetInnerHTML` |
| Dados sensíveis em código | Information Disclosure | Mock data não deve conter PII real (nomes/placas fictícios) |
| Mapbox token exposição | Information Disclosure | Phase 1 usa placeholder sem token — **não commitar token real** |

**Nota de segurança Phase 1:** A fase é puramente frontend com mock data, sem autenticação e sem comunicação com backend. Os riscos de segurança são mínimos. O mais importante é estabelecer práticas seguras que as fases seguintes vão ampliar: sem segredos no código, sem `dangerouslySetInnerHTML`, sem `eval()`.

---

## Sources

### Primary (HIGH confidence)
- [VERIFIED: npm registry] — versões de react@18.3.1, vite@5.4.21, shadcn@4.5.0, react-router-dom@6.30.3, @tanstack/react-table@8.21.3, zustand@5.0.12, chart.js@4.5.1, react-chartjs-2@5.3.1, date-fns@4.1.0
- [CITED: https://ui.shadcn.com/docs/installation/vite] — setup commands Vite
- [CITED: https://ui.shadcn.com/docs/theming] — CSS variables, OKLCH, @theme inline
- [CITED: https://ui.shadcn.com/docs/components/sidebar] — sidebar CSS vars, collapsible patterns
- [CITED: https://ui.shadcn.com/docs/tailwind-v4] — breaking changes Tailwind v4
- [CITED: https://tanstack.com/table/v8/docs/guide/row-selection] — row selection pattern
- [CITED: https://tanstack.com/table/v8/docs/guide/pagination] — pagination pattern
- [CITED: https://tanstack.com/table/v8/docs/guide/column-filtering] — filter pattern
- [VERIFIED: https://raw.githubusercontent.com/vitejs/vite/main/packages/create-vite/template-react-ts/package.json] — confirma React 19 no template padrão

### Secondary (MEDIUM confidence)
- [WebSearch verificado] — shadcn suporta React ^16.8 || ^17 || ^18 || ^19 (peerDeps)
- [WebSearch verificado] — react-router-dom@7 lançado Nov 2024; v6 não recebe mais features mas é estável

### Tertiary (LOW confidence)
- [ASSUMED] — CSS Grid split panel com transição (Pattern 3) — padrão de mercado, não documentação oficial

---

## Metadata

**Breakdown de confiança:**
- Standard Stack: HIGH — versões verificadas no npm registry em 2026-04-28
- Architecture Patterns: HIGH (router, sidebar, stores) / MEDIUM (split panel CSS Grid)
- Pitfalls: HIGH — todos baseados em mudanças documentadas de versão (React 19 default, RRD v7, Tailwind v4)
- Mock patterns: HIGH — alinhado com padrão TanStack Query abstraction

**Data da pesquisa:** 2026-04-28
**Válido até:** 2026-05-28 (30 dias — stack relativamente estável)
