---
phase: 01-ui-shell-design-system
plan: 02
type: execute
wave: 1
depends_on: [01]
files_modified:
  - torre-de-controle/src/app/layout/AppLayout.tsx
  - torre-de-controle/src/app/layout/AppSidebar.tsx
  - torre-de-controle/src/app/layout/Topbar.tsx
  - torre-de-controle/src/app/router.tsx
  - torre-de-controle/src/main.tsx
  - torre-de-controle/src/App.tsx
  - torre-de-controle/src/stores/useUIStore.ts
  - torre-de-controle/src/lib/formatters.ts
  - torre-de-controle/src/components/domain/StatusBadge.tsx
  - torre-de-controle/src/components/domain/SeverityBadge.tsx
  - torre-de-controle/src/components/domain/KPICard.tsx
  - torre-de-controle/src/components/domain/SparklineChart.tsx
  - torre-de-controle/src/components/domain/ProgressBar.tsx
  - torre-de-controle/src/components/domain/DriverAvatar.tsx
  - torre-de-controle/src/components/domain/DataTable.tsx
  - torre-de-controle/src/components/domain/SidePanelLayout.tsx
  - torre-de-controle/src/components/domain/TableWithSidePanel.tsx
  - torre-de-controle/src/components/domain/MapPlaceholder.tsx
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
autonomous: true
requirements:
  - PHASE1-LAYOUT
  - PHASE1-DESIGN-SYSTEM
  - PHASE1-ROUTING
  - PHASE1-COMPONENTS-BASE
tags:
  - frontend
  - layout
  - design-system
  - routing
  - shadcn

must_haves:
  truths:
    - "Sidebar dark navy #1a1a2e visível à esquerda com 8 itens de navegação"
    - "Active nav item destacado em azul #0f62fe com texto branco"
    - "Topbar branco com search, date picker, filtros, avatar"
    - "Navegação React Router v6 funciona entre 8 rotas"
    - "/ redireciona para /dashboard"
    - "Componentes domain: KPICard, StatusBadge, SeverityBadge, SparklineChart, DataTable, SidePanelLayout, TableWithSidePanel funcionais"
    - "StatusBadge renderiza 4 variantes com cores corretas"
    - "Sparkline renderiza linha curva sem eixos"
  artifacts:
    - path: "torre-de-controle/src/app/layout/AppLayout.tsx"
      provides: "Layout root com Sidebar + Topbar + Outlet"
      contains: "SidebarProvider"
    - path: "torre-de-controle/src/app/layout/AppSidebar.tsx"
      provides: "Dark sidebar com 8 nav items + branding"
      contains: "TORRE DE CONTROLE"
    - path: "torre-de-controle/src/app/router.tsx"
      provides: "createBrowserRouter com 8 rotas + redirect /"
      contains: "createBrowserRouter"
    - path: "torre-de-controle/src/components/domain/StatusBadge.tsx"
      provides: "Badge para SLA status"
      contains: "no_prazo"
    - path: "torre-de-controle/src/components/domain/KPICard.tsx"
      provides: "KPI card com sparkline e progress bar"
      contains: "progressValue"
    - path: "torre-de-controle/src/components/domain/SparklineChart.tsx"
      provides: "Mini Chart.js line chart"
      contains: "ChartJS.register"
    - path: "torre-de-controle/src/components/domain/DataTable.tsx"
      provides: "TanStack Table wrapper com row selection"
      contains: "getRowId"
    - path: "torre-de-controle/src/components/domain/TableWithSidePanel.tsx"
      provides: "Padrão CSS Grid de tabela + painel lateral"
      contains: "gridTemplateColumns"
  key_links:
    - from: "torre-de-controle/src/main.tsx"
      to: "torre-de-controle/src/app/router.tsx"
      via: "RouterProvider"
      pattern: "RouterProvider"
    - from: "torre-de-controle/src/app/router.tsx"
      to: "torre-de-controle/src/app/layout/AppLayout.tsx"
      via: "element prop em route raiz"
      pattern: "<AppLayout"
    - from: "torre-de-controle/src/app/layout/AppLayout.tsx"
      to: "torre-de-controle/src/app/layout/AppSidebar.tsx"
      via: "child component"
      pattern: "<AppSidebar"
---

<objective>
Estabelecer shell visual do app: AppLayout (Sidebar dark + Topbar light), React Router v6 com 8 rotas, design system tokens já em CSS (de PLAN-01), e biblioteca de 11 componentes de domínio reutilizáveis. Páginas stubs criadas para que o router funcione — Wave 2 substitui conteúdo das páginas principais.

Purpose: Toda página subsequente importa destes componentes. Sem o shell e os componentes domain, plans 04/05/06 não conseguem renderizar nada.
Output: Aplicação navegável com sidebar/topbar matching design + lib completa de componentes domain.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/phases/01-ui-shell-design-system/01-CONTEXT.md
@.planning/phases/01-ui-shell-design-system/01-RESEARCH.md
</context>

<interfaces>
<!-- Contracts criados aqui que PLAN-04/05/06 vão consumir -->

```typescript
// StatusBadge
type SlaStatus = 'no_prazo' | 'em_risco' | 'atrasado' | 'sem_sinal'
export function StatusBadge(props: { status: SlaStatus; size?: 'sm' | 'md' }): JSX.Element

// SeverityBadge
type AlertSeverity = 'critico' | 'medio' | 'baixo'
export function SeverityBadge(props: { severity: AlertSeverity; size?: 'sm' | 'md' }): JSX.Element

// KPICard
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
export function KPICard(props: KPICardProps): JSX.Element

// DataTable (TanStack Table wrapper)
interface DataTableProps<T extends { id: string }> {
  data: T[]
  columns: ColumnDef<T>[]
  onRowClick?: (row: T) => void
  selectedId?: string | null
  pageSize?: number
}
export function DataTable<T extends { id: string }>(props: DataTableProps<T>): JSX.Element

// TableWithSidePanel
interface TableWithSidePanelProps<T extends { id: string }> {
  data: T[]
  columns: ColumnDef<T>[]
  selectedItem: T | null
  onSelect: (item: T | null) => void
  renderPanel: (item: T) => React.ReactNode
  panelWidth?: number  // default 400
}

// SidePanelLayout
interface SidePanelLayoutProps {
  title: string
  subtitle?: string
  onClose: () => void
  children: React.ReactNode
  footer?: React.ReactNode
}

// useUIStore (Zustand) — NÃO inclui isSidebarCollapsed (shadcn SidebarProvider gerencia esse estado)
interface UIState {
  selectedTripId: string | null
  setSelectedTripId: (id: string | null) => void
  selectedDriverId: string | null
  setSelectedDriverId: (id: string | null) => void
  selectedAlertId: string | null
  setSelectedAlertId: (id: string | null) => void
  activeTripsTab: 'em_andamento' | 'planejadas' | 'concluidas' | 'atrasadas'
  setActiveTripsTab: (tab: UIState['activeTripsTab']) => void
}
```
</interfaces>

<tasks>

<task type="auto">
  <name>Task 1: AppLayout (Sidebar + Topbar + Outlet) + Router + páginas stub + Zustand store</name>
  <files>torre-de-controle/src/app/layout/AppLayout.tsx, torre-de-controle/src/app/layout/AppSidebar.tsx, torre-de-controle/src/app/layout/Topbar.tsx, torre-de-controle/src/app/router.tsx, torre-de-controle/src/main.tsx, torre-de-controle/src/App.tsx, torre-de-controle/src/stores/useUIStore.ts, torre-de-controle/src/app/pages/dashboard/DashboardPage.tsx, torre-de-controle/src/app/pages/torre-de-controle/TorreDeControlePage.tsx, torre-de-controle/src/app/pages/viagens/ViagensPage.tsx, torre-de-controle/src/app/pages/motoristas/MotoristasPage.tsx, torre-de-controle/src/app/pages/geofences/GeofencesPage.tsx, torre-de-controle/src/app/pages/alertas/AlertasPage.tsx, torre-de-controle/src/app/pages/insights/InsightsPage.tsx, torre-de-controle/src/app/pages/configuracoes/ConfiguracoesPage.tsx</files>
  <read_first>
    - torre-de-controle/src/index.css (vars de sidebar de PLAN-01)
    - torre-de-controle/src/components/ui/sidebar.tsx (gerado por shadcn em PLAN-01 — entender API)
    - torre-de-controle/src/components/ui/button.tsx
    - torre-de-controle/src/components/ui/input.tsx
    - torre-de-controle/src/components/ui/avatar.tsx
    - .planning/phases/01-ui-shell-design-system/01-CONTEXT.md (seções "Sidebar — Itens de Navegação", "Topbar — Componentes", "Branding")
    - .planning/phases/01-ui-shell-design-system/01-RESEARCH.md (Pattern 1, Pattern 2, Pattern 5, Pitfall 6)
  </read_first>
  <action>
**1. Criar `torre-de-controle/src/stores/useUIStore.ts`:**

```typescript
import { create } from 'zustand'

export type TripsTab = 'em_andamento' | 'planejadas' | 'concluidas' | 'atrasadas'

// NOTA: isSidebarCollapsed NÃO está neste store — shadcn SidebarProvider gerencia seu próprio
// estado de colapso via useSidebar(). Adicionar isSidebarCollapsed aqui criaria dois sources of truth.
// Pages que precisam controlar sidebar: usar useSidebar() do shadcn.
interface UIState {
  selectedTripId: string | null
  setSelectedTripId: (id: string | null) => void

  selectedDriverId: string | null
  setSelectedDriverId: (id: string | null) => void

  selectedAlertId: string | null
  setSelectedAlertId: (id: string | null) => void

  activeTripsTab: TripsTab
  setActiveTripsTab: (tab: TripsTab) => void
}

export const useUIStore = create<UIState>((set) => ({
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

**2. Criar `torre-de-controle/src/app/layout/AppSidebar.tsx`** — sidebar dark com 8 itens de navegação. CRÍTICO: shadcn Sidebar requer `<SidebarProvider>` no nível raiz (RESEARCH Pitfall 6). Itens da sidebar (ordem exata do CONTEXT):

1. Dashboard — `LayoutDashboard` icon — `/dashboard`
2. Torre de Controle — `Radio` icon — `/torre-de-controle`
3. Viagens — `Truck` icon — `/viagens`
4. Motoristas — `Users` icon — `/motoristas`
5. Geofences — `MapPin` icon — `/geofences`
6. Alertas — `AlertTriangle` icon — `/alertas` — badge "12"
7. Insights — `BarChart3` icon — `/insights`
8. Configurações — `Settings` icon — `/configuracoes`

Estrutura:

```tsx
import { NavLink } from 'react-router-dom'
import {
  Sidebar, SidebarContent, SidebarHeader, SidebarFooter,
  SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarGroup,
} from '@/components/ui/sidebar'
import {
  LayoutDashboard, Radio, Truck, Users, MapPin,
  AlertTriangle, BarChart3, Settings, ChevronLeft, Antenna,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const navItems = [
  { to: '/dashboard',         label: 'Dashboard',          icon: LayoutDashboard },
  { to: '/torre-de-controle', label: 'Torre de Controle',  icon: Radio },
  { to: '/viagens',           label: 'Viagens',            icon: Truck },
  { to: '/motoristas',        label: 'Motoristas',         icon: Users },
  { to: '/geofences',         label: 'Geofences',          icon: MapPin },
  { to: '/alertas',           label: 'Alertas',            icon: AlertTriangle, badge: 12 },
  { to: '/insights',          label: 'Insights',           icon: BarChart3 },
  { to: '/configuracoes',     label: 'Configurações',      icon: Settings },
] as const

export function AppSidebar() {
  return (
    <Sidebar collapsible="icon" className="border-r-0">
      <SidebarHeader className="bg-[#1a1a2e]">
        <div className="flex items-center gap-2 px-3 py-4">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[#0f62fe]">
            <Antenna className="h-5 w-5 text-white" />
          </div>
          <div className="flex flex-col leading-tight group-data-[collapsible=icon]:hidden">
            <span className="text-[11px] font-bold tracking-widest text-white">TORRE DE CONTROLE</span>
            <span className="text-[10px] tracking-widest text-[#0f62fe]">DE ENTREGAS</span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent className="bg-[#1a1a2e]">
        <SidebarGroup>
          <SidebarMenu>
            {navItems.map(({ to, label, icon: Icon, badge }) => (
              <SidebarMenuItem key={to}>
                <NavLink to={to}>
                  {({ isActive }) => (
                    <SidebarMenuButton
                      asChild
                      isActive={isActive}
                      className={cn(
                        'text-[#8892b0] hover:bg-white/8 hover:text-white',
                        'data-[active=true]:bg-[#0f62fe] data-[active=true]:text-white'
                      )}
                    >
                      <span className="flex items-center gap-3 w-full">
                        <Icon className="h-4 w-4" />
                        <span className="flex-1 group-data-[collapsible=icon]:hidden">{label}</span>
                        {('badge' in { badge }) && badge !== undefined && (
                          <span className="ml-auto rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-bold text-white group-data-[collapsible=icon]:hidden">
                            {badge}
                          </span>
                        )}
                      </span>
                    </SidebarMenuButton>
                  )}
                </NavLink>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="bg-[#1a1a2e]">
        <button
          className="flex items-center gap-2 px-3 py-2 text-xs text-[#8892b0] hover:text-white"
        >
          <ChevronLeft className="h-4 w-4" />
          <span className="group-data-[collapsible=icon]:hidden">Recolher menu</span>
        </button>
      </SidebarFooter>
    </Sidebar>
  )
}
```

**3. Criar `torre-de-controle/src/app/layout/Topbar.tsx`** — barra superior branca:

```tsx
import { Search, Bell, Filter, Calendar } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { SidebarTrigger } from '@/components/ui/sidebar'

export function Topbar() {
  return (
    <header className="flex h-14 items-center gap-4 border-b border-gray-200 bg-white px-4 shrink-0">
      <SidebarTrigger />
      <div className="relative flex-1 max-w-xl">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input
          placeholder="Buscar viagens, motoristas, clientes..."
          className="pl-9 pr-16 h-9 bg-gray-50 border-gray-200"
        />
        <kbd className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-mono text-gray-400 border border-gray-200 rounded px-1.5 py-0.5">⌘K</kbd>
      </div>

      <Button variant="outline" size="sm" className="gap-2 text-xs">
        <Calendar className="h-3.5 w-3.5" />
        20/05/2025 00:00 — 20/05/2025 23:59
      </Button>

      <Button variant="outline" size="sm" className="gap-2 text-xs">
        <Filter className="h-3.5 w-3.5" />
        Filtros
      </Button>

      <button className="relative p-2 rounded-md hover:bg-gray-100">
        <Bell className="h-4 w-4 text-gray-600" />
        <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-red-500" />
      </button>

      <div className="flex items-center gap-3">
        <Avatar className="h-8 w-8">
          <AvatarFallback className="bg-[#0f62fe] text-white text-xs">AS</AvatarFallback>
        </Avatar>
        <div className="flex flex-col leading-tight">
          <span className="text-xs font-semibold text-gray-900">Ana Silva</span>
          <span className="text-[10px] text-gray-500">Torre de Controle</span>
        </div>
      </div>
    </header>
  )
}
```

**4. Criar `torre-de-controle/src/app/layout/AppLayout.tsx`:**

```tsx
import { Outlet } from 'react-router-dom'
import { SidebarProvider } from '@/components/ui/sidebar'
import { AppSidebar } from './AppSidebar'
import { Topbar } from './Topbar'

export function AppLayout() {
  return (
    <SidebarProvider>
      <div className="flex h-screen w-screen overflow-hidden">
        <AppSidebar />
        <div className="flex flex-1 flex-col overflow-hidden">
          <Topbar />
          <main className="flex-1 overflow-auto bg-[#f4f6f9] p-6">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  )
}
```

**5. Criar `torre-de-controle/src/app/router.tsx`** com 8 rotas + redirect:

```tsx
import { createBrowserRouter, Navigate } from 'react-router-dom'
import { AppLayout } from './layout/AppLayout'
import { DashboardPage } from './pages/dashboard/DashboardPage'
import { TorreDeControlePage } from './pages/torre-de-controle/TorreDeControlePage'
import { ViagensPage } from './pages/viagens/ViagensPage'
import { MotoristasPage } from './pages/motoristas/MotoristasPage'
import { GeofencesPage } from './pages/geofences/GeofencesPage'
import { AlertasPage } from './pages/alertas/AlertasPage'
import { InsightsPage } from './pages/insights/InsightsPage'
import { ConfiguracoesPage } from './pages/configuracoes/ConfiguracoesPage'

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { index: true, element: <Navigate to="/dashboard" replace /> },
      { path: 'dashboard',         element: <DashboardPage /> },
      { path: 'torre-de-controle', element: <TorreDeControlePage /> },
      { path: 'viagens',           element: <ViagensPage /> },
      { path: 'motoristas',        element: <MotoristasPage /> },
      { path: 'geofences',         element: <GeofencesPage /> },
      { path: 'alertas',           element: <AlertasPage /> },
      { path: 'insights',          element: <InsightsPage /> },
      { path: 'configuracoes',     element: <ConfiguracoesPage /> },
    ],
  },
])
```

**6. Sobrescrever `torre-de-controle/src/main.tsx`:**

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import './index.css'
import { router } from './app/router'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
```

**7. Apagar `torre-de-controle/src/App.tsx`** — não é mais usado (router substitui). Se manter, deixar export vazio para não quebrar imports remanescentes.

**8. Criar 8 páginas STUB** — todas seguem o mesmo padrão. PLAN-04/05/06 vão sobrescrever. Conteúdo de cada `*Page.tsx`:

```tsx
// src/app/pages/{slug}/{Name}Page.tsx
export function {Name}Page() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-gray-900">{Title}</h1>
      <p className="text-sm text-gray-500">Página em construção — Phase 1.</p>
    </div>
  )
}
```

Mapeamento exato (slug → arquivo → export → título):
- `dashboard/DashboardPage.tsx` → `DashboardPage` → "Dashboard"
- `torre-de-controle/TorreDeControlePage.tsx` → `TorreDeControlePage` → "Torre de Controle"
- `viagens/ViagensPage.tsx` → `ViagensPage` → "Viagens"
- `motoristas/MotoristasPage.tsx` → `MotoristasPage` → "Motoristas"
- `geofences/GeofencesPage.tsx` → `GeofencesPage` → "Geofences"
- `alertas/AlertasPage.tsx` → `AlertasPage` → "Alertas"
- `insights/InsightsPage.tsx` → `InsightsPage` → "Insights"
- `configuracoes/ConfiguracoesPage.tsx` → `ConfiguracoesPage` → "Configurações"
  </action>
  <verify>
    <automated>cd torre-de-controle && npm run build && npx tsc --noEmit</automated>
  </verify>
  <acceptance_criteria>
    - `torre-de-controle/src/stores/useUIStore.ts` contém literalmente `import { create } from 'zustand'`
    - `torre-de-controle/src/stores/useUIStore.ts` contém literalmente `selectedTripId`
    - `torre-de-controle/src/stores/useUIStore.ts` contém literalmente `selectedDriverId`
    - `torre-de-controle/src/stores/useUIStore.ts` contém literalmente `selectedAlertId`
    - `torre-de-controle/src/stores/useUIStore.ts` contém literalmente `activeTripsTab`
    - `torre-de-controle/src/app/layout/AppSidebar.tsx` contém literalmente `TORRE DE CONTROLE`
    - `torre-de-controle/src/app/layout/AppSidebar.tsx` contém literalmente `'/dashboard'`
    - `torre-de-controle/src/app/layout/AppSidebar.tsx` contém literalmente `'/torre-de-controle'`
    - `torre-de-controle/src/app/layout/AppSidebar.tsx` contém literalmente `'/viagens'`
    - `torre-de-controle/src/app/layout/AppSidebar.tsx` contém literalmente `'/motoristas'`
    - `torre-de-controle/src/app/layout/AppSidebar.tsx` contém literalmente `'/geofences'`
    - `torre-de-controle/src/app/layout/AppSidebar.tsx` contém literalmente `'/alertas'`
    - `torre-de-controle/src/app/layout/AppSidebar.tsx` contém literalmente `'/insights'`
    - `torre-de-controle/src/app/layout/AppSidebar.tsx` contém literalmente `'/configuracoes'`
    - `torre-de-controle/src/app/layout/AppSidebar.tsx` contém literalmente `bg-[#1a1a2e]`
    - `torre-de-controle/src/app/layout/AppLayout.tsx` contém literalmente `SidebarProvider`
    - `torre-de-controle/src/app/layout/AppLayout.tsx` contém literalmente `<Outlet`
    - `torre-de-controle/src/app/router.tsx` contém literalmente `createBrowserRouter`
    - `torre-de-controle/src/app/router.tsx` contém literalmente `<Navigate to="/dashboard" replace />`
    - `torre-de-controle/src/main.tsx` contém literalmente `RouterProvider`
    - 8 páginas stub existem: DashboardPage, TorreDeControlePage, ViagensPage, MotoristasPage, GeofencesPage, AlertasPage, InsightsPage, ConfiguracoesPage
    - `npm run build` exit 0
  </acceptance_criteria>
  <done>Build passa, layout estruturado, 8 rotas registradas, store Zustand criado, todas páginas stub existem.</done>
</task>

<task type="auto">
  <name>Task 2: Componentes de domínio — badges, KPI, sparkline, progress, avatar, formatters</name>
  <files>torre-de-controle/src/components/domain/StatusBadge.tsx, torre-de-controle/src/components/domain/SeverityBadge.tsx, torre-de-controle/src/components/domain/SparklineChart.tsx, torre-de-controle/src/components/domain/KPICard.tsx, torre-de-controle/src/components/domain/ProgressBar.tsx, torre-de-controle/src/components/domain/DriverAvatar.tsx, torre-de-controle/src/components/domain/MapPlaceholder.tsx, torre-de-controle/src/lib/formatters.ts</files>
  <read_first>
    - torre-de-controle/src/lib/utils.ts (cn helper de PLAN-01)
    - torre-de-controle/src/components/ui/avatar.tsx (shadcn)
    - .planning/phases/01-ui-shell-design-system/01-RESEARCH.md (Pattern 6, Pitfall 5, "KPICard Component", "StatusBadge Component")
    - .planning/phases/01-ui-shell-design-system/01-CONTEXT.md (seções "Design System — Cores", "specifics → KPICard", "specifics → StatusBadge")
  </read_first>
  <action>
**1. Criar `torre-de-controle/src/lib/formatters.ts`:**

```typescript
import { format, formatDistanceToNow, differenceInMinutes } from 'date-fns'
import { ptBR } from 'date-fns/locale'

export function formatDate(date: Date | string, pattern = 'dd/MM/yyyy HH:mm'): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return format(d, pattern, { locale: ptBR })
}

export function formatTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return format(d, 'HH:mm', { locale: ptBR })
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}min`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m === 0 ? `${h}h` : `${h}h${m}min`
}

export function formatRelative(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return formatDistanceToNow(d, { addSuffix: true, locale: ptBR })
}

export function formatPercent(value: number, decimals = 1): string {
  return `${value.toFixed(decimals)}%`
}

export function formatKm(km: number): string {
  return `${km.toFixed(1)} km`
}

export function minutesBetween(a: Date, b: Date): number {
  return differenceInMinutes(b, a)
}
```

**2. Criar `torre-de-controle/src/components/domain/StatusBadge.tsx`** (4 variantes exatas do CONTEXT):

```tsx
import { cn } from '@/lib/utils'

const config = {
  no_prazo:  { label: 'No prazo',  classes: 'bg-green-100 text-green-700' },
  em_risco:  { label: 'Em risco',  classes: 'bg-yellow-100 text-yellow-700' },
  atrasado:  { label: 'Atrasado',  classes: 'bg-red-100 text-red-700' },
  sem_sinal: { label: 'Sem sinal', classes: 'bg-gray-100 text-gray-500' },
} as const

export type SlaStatus = keyof typeof config

interface Props {
  status: SlaStatus
  size?: 'sm' | 'md'
}

export function StatusBadge({ status, size = 'sm' }: Props) {
  const { label, classes } = config[status]
  return (
    <span className={cn(
      'inline-flex items-center rounded-full font-medium whitespace-nowrap',
      size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm',
      classes,
    )}>
      {label}
    </span>
  )
}
```

**3. Criar `torre-de-controle/src/components/domain/SeverityBadge.tsx`** (3 variantes):

```tsx
import { cn } from '@/lib/utils'

const config = {
  critico: { label: 'Crítico', classes: 'bg-red-100 text-red-700 border-red-200' },
  medio:   { label: 'Médio',   classes: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
  baixo:   { label: 'Baixo',   classes: 'bg-green-100 text-green-700 border-green-200' },
} as const

export type AlertSeverity = keyof typeof config

interface Props {
  severity: AlertSeverity
  size?: 'sm' | 'md'
}

export function SeverityBadge({ severity, size = 'sm' }: Props) {
  const { label, classes } = config[severity]
  return (
    <span className={cn(
      'inline-flex items-center rounded-full font-medium border whitespace-nowrap',
      size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm',
      classes,
    )}>
      {label}
    </span>
  )
}
```

**4. Criar `torre-de-controle/src/components/domain/SparklineChart.tsx`** — registro EXPLÍCITO de módulos Chart.js (RESEARCH Pitfall 5):

```tsx
import { Line } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
} from 'chart.js'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler)

interface Props {
  data: number[]
  color: string
  height?: number
  fill?: boolean
}

export function SparklineChart({ data, color, height = 40, fill = false }: Props) {
  return (
    <div style={{ height, width: '100%', minWidth: 80 }}>
      <Line
        data={{
          labels: data.map((_, i) => i.toString()),
          datasets: [{
            data,
            borderColor: color,
            backgroundColor: fill ? `${color}33` : 'transparent',
            borderWidth: 2,
            pointRadius: 0,
            tension: 0.4,
            fill,
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
    </div>
  )
}
```

**5. Criar `torre-de-controle/src/components/domain/ProgressBar.tsx`:**

```tsx
import { cn } from '@/lib/utils'

interface Props {
  value: number   // 0-100
  color?: string  // hex; default azul
  height?: number // px; default 6
  showLabel?: boolean
  className?: string
}

export function ProgressBar({ value, color = '#0f62fe', height = 6, showLabel, className }: Props) {
  const pct = Math.max(0, Math.min(100, value))
  return (
    <div className={cn('w-full', className)}>
      <div
        className="w-full bg-gray-100 rounded-full overflow-hidden"
        style={{ height }}
      >
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
      {showLabel && (
        <span className="text-[10px] text-gray-500 mt-1">{pct.toFixed(0)}%</span>
      )}
    </div>
  )
}
```

**6. Criar `torre-de-controle/src/components/domain/DriverAvatar.tsx`:**

```tsx
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'

const statusDot = {
  available:    'bg-[#2ecc71]',
  on_route:     'bg-[#0f62fe]',
  unavailable:  'bg-[#95a5a6]',
} as const

type DriverStatus = keyof typeof statusDot

interface Props {
  name: string
  photoUrl?: string
  status?: DriverStatus
  size?: 'sm' | 'md' | 'lg'
}

const sizeMap = { sm: 'h-7 w-7', md: 'h-9 w-9', lg: 'h-12 w-12' }

export function DriverAvatar({ name, photoUrl, status, size = 'md' }: Props) {
  const initials = name.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase()
  return (
    <div className="relative inline-block">
      <Avatar className={sizeMap[size]}>
        {photoUrl && <AvatarImage src={photoUrl} alt={name} />}
        <AvatarFallback className="bg-gray-200 text-gray-700 text-xs">{initials}</AvatarFallback>
      </Avatar>
      {status && (
        <span className={cn(
          'absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-white',
          statusDot[status],
        )} />
      )}
    </div>
  )
}
```

**7. Criar `torre-de-controle/src/components/domain/KPICard.tsx`** com props EXATOS do CONTEXT specifics:

```tsx
import { cn } from '@/lib/utils'
import { SparklineChart } from './SparklineChart'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'

export type KPIColor = 'green' | 'blue' | 'orange' | 'red' | 'purple' | 'gray'

const colorMap: Record<KPIColor, string> = {
  green:  '#2ecc71',
  blue:   '#0f62fe',
  orange: '#f39c12',
  red:    '#e74c3c',
  purple: '#9b59b6',
  gray:   '#95a5a6',
}

interface KPICardProps {
  title: string
  value: string | number
  subtitle?: string
  total?: number
  percent?: string
  trend?: 'up' | 'down' | 'neutral'
  sparklineData?: number[]
  progressValue?: number
  color?: KPIColor
}

export function KPICard({
  title, value, subtitle, total, percent, trend,
  sparklineData, progressValue, color = 'blue',
}: KPICardProps) {
  const TrendIcon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus
  const trendColor = trend === 'up' ? 'text-green-600' : trend === 'down' ? 'text-red-600' : 'text-gray-400'
  const hex = colorMap[color]

  return (
    <div className="bg-white rounded-lg shadow-sm p-4 flex flex-col gap-2 border border-gray-100">
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs text-gray-500 font-medium uppercase tracking-wide">{title}</span>
        {trend && <TrendIcon className={cn('h-3.5 w-3.5', trendColor)} />}
      </div>

      <div className="flex items-end justify-between gap-3">
        <div className="flex flex-col min-w-0">
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-bold text-gray-900 tabular-nums">{value}</span>
            {total !== undefined && (
              <span className="text-sm text-gray-400">/ {total}</span>
            )}
            {percent && <span className="text-sm text-gray-500">{percent}</span>}
          </div>
          {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
        </div>

        {sparklineData && sparklineData.length > 0 && (
          <div className="w-24 shrink-0">
            <SparklineChart data={sparklineData} color={hex} height={36} />
          </div>
        )}
      </div>

      {progressValue !== undefined && (
        <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden mt-1">
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${Math.max(0, Math.min(100, progressValue))}%`, backgroundColor: hex }}
          />
        </div>
      )}
    </div>
  )
}
```

**8. Criar `torre-de-controle/src/components/domain/MapPlaceholder.tsx`** — container para Phase 3:

```tsx
import { Map as MapIcon, Satellite } from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/lib/utils'

interface Props {
  height?: number | string
  showLegend?: boolean
}

export function MapPlaceholder({ height = 400, showLegend = true }: Props) {
  const [mode, setMode] = useState<'mapa' | 'satelite'>('mapa')

  return (
    <div
      className="relative rounded-lg overflow-hidden border border-gray-200"
      style={{ height, background: 'linear-gradient(135deg, #1e293b 0%, #334155 100%)' }}
    >
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="text-center">
          <MapIcon className="h-12 w-12 mx-auto text-gray-400 mb-2" />
          <p className="text-sm text-gray-300">Mapa será carregado na Phase 3</p>
          <p className="text-xs text-gray-500 mt-1">Mapbox GL JS</p>
        </div>
      </div>

      <div className="absolute top-3 right-3 flex bg-white rounded-md shadow-sm overflow-hidden text-xs">
        <button
          onClick={() => setMode('mapa')}
          className={cn(
            'px-3 py-1.5 flex items-center gap-1.5',
            mode === 'mapa' ? 'bg-[#0f62fe] text-white' : 'text-gray-700 hover:bg-gray-50',
          )}
        >
          <MapIcon className="h-3 w-3" /> Mapa
        </button>
        <button
          onClick={() => setMode('satelite')}
          className={cn(
            'px-3 py-1.5 flex items-center gap-1.5',
            mode === 'satelite' ? 'bg-[#0f62fe] text-white' : 'text-gray-700 hover:bg-gray-50',
          )}
        >
          <Satellite className="h-3 w-3" /> Satélite
        </button>
      </div>

      {showLegend && (
        <div className="absolute bottom-3 left-3 bg-white rounded-md shadow-sm px-3 py-2 text-xs space-y-1">
          <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-[#2ecc71]" /> No prazo</div>
          <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-[#f39c12]" /> Em risco</div>
          <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-[#e74c3c]" /> Atrasado</div>
          <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-[#95a5a6]" /> Sem sinal</div>
        </div>
      )}
    </div>
  )
}
```
  </action>
  <verify>
    <automated>cd torre-de-controle && npm run build && npx tsc --noEmit</automated>
  </verify>
  <acceptance_criteria>
    - `torre-de-controle/src/lib/formatters.ts` contém literalmente `formatDate`, `formatTime`, `formatDuration`, `formatRelative`, `formatPercent`, `formatKm`
    - `torre-de-controle/src/components/domain/StatusBadge.tsx` contém literalmente `no_prazo`
    - `torre-de-controle/src/components/domain/StatusBadge.tsx` contém literalmente `em_risco`
    - `torre-de-controle/src/components/domain/StatusBadge.tsx` contém literalmente `atrasado`
    - `torre-de-controle/src/components/domain/StatusBadge.tsx` contém literalmente `sem_sinal`
    - `torre-de-controle/src/components/domain/StatusBadge.tsx` contém literalmente `bg-green-100 text-green-700`
    - `torre-de-controle/src/components/domain/StatusBadge.tsx` contém literalmente `bg-red-100 text-red-700`
    - `torre-de-controle/src/components/domain/SeverityBadge.tsx` contém literalmente `critico`
    - `torre-de-controle/src/components/domain/SeverityBadge.tsx` contém literalmente `medio`
    - `torre-de-controle/src/components/domain/SeverityBadge.tsx` contém literalmente `baixo`
    - `torre-de-controle/src/components/domain/SparklineChart.tsx` contém literalmente `ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement`
    - `torre-de-controle/src/components/domain/KPICard.tsx` contém literalmente `progressValue`
    - `torre-de-controle/src/components/domain/KPICard.tsx` contém literalmente `sparklineData`
    - `torre-de-controle/src/components/domain/KPICard.tsx` contém literalmente `'#2ecc71'` ou `colorMap`
    - `torre-de-controle/src/components/domain/ProgressBar.tsx` contém literalmente `export function ProgressBar`
    - `torre-de-controle/src/components/domain/DriverAvatar.tsx` contém literalmente `available`
    - `torre-de-controle/src/components/domain/DriverAvatar.tsx` contém literalmente `on_route`
    - `torre-de-controle/src/components/domain/MapPlaceholder.tsx` contém literalmente `'mapa'` e `'satelite'`
    - `torre-de-controle/src/components/domain/MapPlaceholder.tsx` contém literalmente `Mapa será carregado na Phase 3`
    - `npm run build` exit 0
  </acceptance_criteria>
  <done>7 componentes domain + formatters criados, todas variantes/cores conferem com CONTEXT, build passa.</done>
</task>

<task type="auto">
  <name>Task 3: DataTable (TanStack), SidePanelLayout, TableWithSidePanel, AlertItem, TripTimeline</name>
  <files>torre-de-controle/src/components/domain/DataTable.tsx, torre-de-controle/src/components/domain/SidePanelLayout.tsx, torre-de-controle/src/components/domain/TableWithSidePanel.tsx, torre-de-controle/src/components/domain/AlertItem.tsx, torre-de-controle/src/components/domain/TripTimeline.tsx</files>
  <read_first>
    - torre-de-controle/src/components/ui/table.tsx (shadcn — base markup)
    - torre-de-controle/src/components/ui/scroll-area.tsx (shadcn)
    - torre-de-controle/src/components/ui/separator.tsx (shadcn)
    - torre-de-controle/src/lib/utils.ts (cn)
    - .planning/phases/01-ui-shell-design-system/01-RESEARCH.md (Pattern 3, Pattern 7, Pitfall 8)
    - .planning/phases/01-ui-shell-design-system/01-CONTEXT.md (seções "Página Alertas", "Página Viagens — painel lateral")
  </read_first>
  <action>
**1. Criar `torre-de-controle/src/components/domain/DataTable.tsx`** — TanStack Table v8 wrapper com row selection, paginação e `getRowId` (RESEARCH Pitfall 8):

```tsx
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  flexRender,
  type ColumnDef,
  type ColumnFiltersState,
} from '@tanstack/react-table'
import { useState } from 'react'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

interface DataTableProps<T extends { id: string }> {
  data: T[]
  columns: ColumnDef<T, unknown>[]
  onRowClick?: (row: T) => void
  selectedId?: string | null
  pageSize?: number
  emptyMessage?: string
}

export function DataTable<T extends { id: string }>({
  data, columns, onRowClick, selectedId, pageSize = 20,
  emptyMessage = 'Nenhum resultado encontrado.',
}: DataTableProps<T>) {
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize })

  const table = useReactTable({
    data,
    columns,
    getRowId: (row) => row.id,  // CRITICAL — RESEARCH Pitfall 8
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    state: { columnFilters, pagination },
    onColumnFiltersChange: setColumnFilters,
    onPaginationChange: setPagination,
  })

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map(hg => (
              <TableRow key={hg.id}>
                {hg.headers.map(h => (
                  <TableHead key={h.id} className="text-xs font-semibold text-gray-600 uppercase tracking-wide bg-gray-50">
                    {h.isPlaceholder ? null : flexRender(h.column.columnDef.header, h.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="text-center text-sm text-gray-500 py-8">
                  {emptyMessage}
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map(row => (
                <TableRow
                  key={row.id}
                  onClick={() => onRowClick?.(row.original)}
                  className={cn(
                    onRowClick && 'cursor-pointer',
                    row.id === selectedId ? 'bg-blue-50 hover:bg-blue-100' : 'hover:bg-gray-50',
                  )}
                >
                  {row.getVisibleCells().map(cell => (
                    <TableCell key={cell.id} className="text-sm">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {table.getPageCount() > 1 && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 bg-gray-50/40">
          <span className="text-xs text-gray-500">
            Página {table.getState().pagination.pageIndex + 1} de {table.getPageCount()} ({data.length} registros)
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <Button variant="outline" size="sm" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
```

**2. Criar `torre-de-controle/src/components/domain/SidePanelLayout.tsx`:**

```tsx
import { X } from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'

interface Props {
  title: string
  subtitle?: string
  onClose: () => void
  children: React.ReactNode
  footer?: React.ReactNode
}

export function SidePanelLayout({ title, subtitle, onClose, children, footer }: Props) {
  return (
    <div className="flex flex-col h-full bg-white border border-gray-200 rounded-lg overflow-hidden">
      <div className="flex items-start justify-between p-4 shrink-0">
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-gray-900 truncate">{title}</h3>
          {subtitle && <p className="text-xs text-gray-500 mt-0.5 truncate">{subtitle}</p>}
        </div>
        <button
          onClick={onClose}
          className="ml-2 p-1 rounded hover:bg-gray-100 text-gray-500 shrink-0"
          aria-label="Fechar painel"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <Separator />
      <ScrollArea className="flex-1 p-4">
        {children}
      </ScrollArea>
      {footer && (
        <>
          <Separator />
          <div className="p-4 shrink-0 bg-gray-50/40">{footer}</div>
        </>
      )}
    </div>
  )
}
```

**3. Criar `torre-de-controle/src/components/domain/TableWithSidePanel.tsx`** — padrão CSS Grid com comportamento especificado (RESEARCH Pattern 3 + P1-HIGH fixes do code review):

CRITÉRIOS DE COMPORTAMENTO (obrigatórios):
- `minmax(0, 1fr)` na coluna da tabela: impede overflow quando painel abre
- `min-h-0` no container: impede que grid creça além do parent flex container
- `min-w-0 overflow-auto` na área da tabela: scroll independente horizontal
- SidePanelLayout já usa ScrollArea internamente: scroll independente do painel
- Reset de seleção: quando `data` muda e `selectedItem` não está mais presente → chama `onSelect(null)`
- Toggle click: clicar na mesma linha novamente → deseleciona (passa null)
- Largura do painel: clamped entre 320px e 520px (padrão 400px)

```tsx
import { type ColumnDef } from '@tanstack/react-table'
import { useEffect } from 'react'
import { DataTable } from './DataTable'

interface Props<T extends { id: string }> {
  data: T[]
  columns: ColumnDef<T, unknown>[]
  selectedItem: T | null
  onSelect: (item: T | null) => void
  renderPanel: (item: T) => React.ReactNode
  panelWidth?: number   // clamped: min 320 / max 520 / default 400
  pageSize?: number
}

export function TableWithSidePanel<T extends { id: string }>({
  data, columns, selectedItem, onSelect, renderPanel,
  panelWidth = 400, pageSize,
}: Props<T>) {
  const clampedWidth = Math.min(520, Math.max(320, panelWidth))
  const isOpen = selectedItem !== null

  // P1-HIGH: Reset selection when selectedItem is filtered out of the current dataset.
  // Prevents stale detail panels showing data for rows no longer visible in the table.
  useEffect(() => {
    if (selectedItem && !data.find(d => d.id === selectedItem.id)) {
      onSelect(null)
    }
  }, [data, selectedItem, onSelect])

  return (
    // CSS Grid: minmax(0, 1fr) is CRITICAL — prevents table column from overflowing when panel is open.
    // Plain '1fr' = minmax(auto, 1fr) which can grow beyond available space.
    // min-h-0 prevents grid height from escaping parent flex container.
    <div
      className="grid min-h-0 h-full"
      style={{
        gridTemplateColumns: isOpen
          ? `minmax(0, 1fr) ${clampedWidth}px`
          : 'minmax(0, 1fr)',
        columnGap: isOpen ? '16px' : '0',
      }}
    >
      {/* Table area — min-w-0 prevents horizontal blowout; overflow-auto allows its own H-scroll */}
      <div className="min-w-0 overflow-auto">
        <DataTable
          data={data}
          columns={columns}
          onRowClick={(row) => onSelect(row.id === selectedItem?.id ? null : row)}
          selectedId={selectedItem?.id ?? null}
          pageSize={pageSize}
        />
      </div>

      {/* Panel area — only rendered when open. SidePanelLayout uses ScrollArea for independent V-scroll. */}
      {isOpen && (
        <div
          className="min-w-0 overflow-hidden"
          style={{ width: `${clampedWidth}px` }}
        >
          {renderPanel(selectedItem)}
        </div>
      )}
    </div>
  )
}
```

Nota de layout para 1366px (laptops corporativos): com sidebar de 240px e padding de 48px, a área de conteúdo tem 1078px. Com painel de 400px + gap de 16px, a tabela fica com 662px — adequado para as colunas definidas. Verificar manualmente em 1366x768.

**4. Criar `torre-de-controle/src/components/domain/AlertItem.tsx`** — linha de alerta para fila operacional / lista:

```tsx
import { Phone, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SeverityBadge, type AlertSeverity } from './SeverityBadge'
import { DriverAvatar } from './DriverAvatar'
import { formatTime, formatRelative } from '@/lib/formatters'
import { cn } from '@/lib/utils'

export interface AlertItemData {
  id: string
  severity: AlertSeverity
  title: string
  subtitle?: string
  driverName: string
  driverPhoto?: string
  plate: string
  clientName?: string
  occurredAt: Date | string
  delayMinutes?: number
}

interface Props {
  alert: AlertItemData
  onAssume?: (id: string) => void
  onCall?: (id: string) => void
  onClick?: (id: string) => void
  selected?: boolean
  variant?: 'queue' | 'list'  // queue = botões Assumir/Ligar; list = chevron
}

export function AlertItem({ alert, onAssume, onCall, onClick, selected, variant = 'queue' }: Props) {
  return (
    <div
      onClick={() => onClick?.(alert.id)}
      className={cn(
        'flex items-start gap-3 p-3 rounded-md border transition-colors',
        selected ? 'border-blue-300 bg-blue-50' : 'border-gray-200 bg-white hover:bg-gray-50',
        onClick && 'cursor-pointer',
      )}
    >
      <SeverityBadge severity={alert.severity} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 text-[10px] text-gray-500">
          <span>{formatTime(alert.occurredAt)}</span>
          <span>·</span>
          <span>{formatRelative(alert.occurredAt)}</span>
        </div>
        <p className="text-sm font-medium text-gray-900 truncate">{alert.title}</p>
        {alert.subtitle && <p className="text-xs text-gray-500 truncate">{alert.subtitle}</p>}
        <div className="flex items-center gap-2 mt-2">
          <DriverAvatar name={alert.driverName} photoUrl={alert.driverPhoto} size="sm" />
          <span className="text-xs text-gray-700 truncate">{alert.driverName}</span>
          <span className="text-xs text-gray-400">·</span>
          <span className="text-xs font-mono text-gray-500">{alert.plate}</span>
          {alert.clientName && (
            <>
              <span className="text-xs text-gray-400">·</span>
              <span className="text-xs text-gray-500 truncate">{alert.clientName}</span>
            </>
          )}
        </div>
        {alert.delayMinutes !== undefined && (
          <p className="text-[11px] text-red-600 font-medium mt-1">
            Desvio ETA: +{alert.delayMinutes} min
          </p>
        )}
      </div>
      {variant === 'queue' && (onAssume || onCall) && (
        <div className="flex flex-col gap-1.5 shrink-0">
          {onAssume && (
            <Button size="sm" className="h-7 text-xs bg-[#0f62fe] hover:bg-[#0353d9]" onClick={(e) => { e.stopPropagation(); onAssume(alert.id) }}>
              Assumir
            </Button>
          )}
          {onCall && (
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={(e) => { e.stopPropagation(); onCall(alert.id) }}>
              <Phone className="h-3 w-3" /> Ligar
            </Button>
          )}
        </div>
      )}
      {variant === 'list' && (
        <ChevronRight className="h-4 w-4 text-gray-400 shrink-0 mt-1" />
      )}
    </div>
  )
}
```

**5. Criar `torre-de-controle/src/components/domain/TripTimeline.tsx`** — eventos cronológicos verticais:

```tsx
import { CheckCircle2, AlertCircle, Circle, MapPin, Truck, Flag } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatTime } from '@/lib/formatters'

export type TimelineEventKind = 'departure' | 'stop' | 'delivery' | 'alert' | 'arrival' | 'pending'

export interface TimelineEvent {
  id: string
  kind: TimelineEventKind
  title: string
  description?: string
  occurredAt: Date | string
  isCompleted?: boolean
  isCurrent?: boolean
}

const iconMap = {
  departure: Truck,
  stop:      MapPin,
  delivery:  CheckCircle2,
  alert:     AlertCircle,
  arrival:   Flag,
  pending:   Circle,
} as const

const colorMap = {
  departure: 'text-blue-600 bg-blue-100',
  stop:      'text-gray-600 bg-gray-100',
  delivery:  'text-green-600 bg-green-100',
  alert:     'text-red-600 bg-red-100',
  arrival:   'text-purple-600 bg-purple-100',
  pending:   'text-gray-400 bg-gray-100',
} as const

interface Props {
  events: TimelineEvent[]
}

export function TripTimeline({ events }: Props) {
  return (
    <ol className="relative">
      {events.map((event, idx) => {
        const Icon = iconMap[event.kind]
        const colors = colorMap[event.kind]
        const isLast = idx === events.length - 1
        return (
          <li key={event.id} className="flex gap-3 pb-4 last:pb-0">
            <div className="flex flex-col items-center shrink-0">
              <div className={cn('h-8 w-8 rounded-full flex items-center justify-center', colors, event.isCurrent && 'ring-2 ring-offset-2 ring-blue-500')}>
                <Icon className="h-4 w-4" />
              </div>
              {!isLast && <div className="w-px flex-1 bg-gray-200 my-1" />}
            </div>
            <div className="flex-1 min-w-0 pb-2">
              <div className="flex items-center justify-between gap-2">
                <p className={cn('text-sm font-medium truncate', event.isCompleted ? 'text-gray-900' : 'text-gray-500')}>
                  {event.title}
                </p>
                <span className="text-[11px] text-gray-500 shrink-0">{formatTime(event.occurredAt)}</span>
              </div>
              {event.description && (
                <p className="text-xs text-gray-500 mt-0.5">{event.description}</p>
              )}
            </div>
          </li>
        )
      })}
    </ol>
  )
}
```
  </action>
  <verify>
    <automated>cd torre-de-controle && npm run build && npx tsc --noEmit</automated>
  </verify>
  <acceptance_criteria>
    - `torre-de-controle/src/components/domain/DataTable.tsx` contém literalmente `getRowId: (row) => row.id`
    - `torre-de-controle/src/components/domain/DataTable.tsx` contém literalmente `useReactTable`
    - `torre-de-controle/src/components/domain/DataTable.tsx` contém literalmente `getPaginationRowModel`
    - `torre-de-controle/src/components/domain/DataTable.tsx` contém literalmente `selectedId`
    - `torre-de-controle/src/components/domain/SidePanelLayout.tsx` contém literalmente `onClose`
    - `torre-de-controle/src/components/domain/SidePanelLayout.tsx` contém literalmente `ScrollArea`
    - `torre-de-controle/src/components/domain/TableWithSidePanel.tsx` contém literalmente `minmax(0, 1fr)`
    - `torre-de-controle/src/components/domain/TableWithSidePanel.tsx` contém literalmente `panelWidth`
    - `torre-de-controle/src/components/domain/TableWithSidePanel.tsx` contém literalmente `onSelect(null)` (reset de seleção)
    - `torre-de-controle/src/components/domain/TableWithSidePanel.tsx` contém literalmente `useEffect`
    - `torre-de-controle/src/components/domain/TableWithSidePanel.tsx` contém literalmente `clampedWidth`
    - `torre-de-controle/src/components/domain/AlertItem.tsx` contém literalmente `Assumir`
    - `torre-de-controle/src/components/domain/AlertItem.tsx` contém literalmente `Ligar`
    - `torre-de-controle/src/components/domain/AlertItem.tsx` contém literalmente `SeverityBadge`
    - `torre-de-controle/src/components/domain/TripTimeline.tsx` contém literalmente `departure`
    - `torre-de-controle/src/components/domain/TripTimeline.tsx` contém literalmente `delivery`
    - `torre-de-controle/src/components/domain/TripTimeline.tsx` contém literalmente `arrival`
    - `npm run build` exit 0
  </acceptance_criteria>
  <done>5 componentes (DataTable, SidePanelLayout, TableWithSidePanel, AlertItem, TripTimeline) criados, build passa, todas APIs do <interfaces> implementadas.</done>
</task>

</tasks>

<threat_model>

## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| user → DOM | Inputs em forms (search, filters) são strings de usuário |
| mock → render | Dados mock chegam ao JSX |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-01-04 | Tampering | Renderização de strings em JSX | mitigate | Nenhum uso de `dangerouslySetInnerHTML` em qualquer componente domain (verificável com grep `dangerouslySetInnerHTML` retornando vazio) |
| T-01-05 | Information Disclosure | DriverAvatar com photoUrl | accept | Phase 1 usa apenas mock data fictícia; sem PII real |

</threat_model>

<verification>
- `npm run build && npx tsc --noEmit` exit 0
- `npm run dev` carrega `/dashboard`, sidebar dark visível, navegação para outras 7 rotas funciona (manual)
- TableWithSidePanel: em viewport 1366px, tabela ocupa ≥ 650px com painel de 400px aberto (verificar manualmente)
- Grep `dangerouslySetInnerHTML` em src/ retorna 0 ocorrências
- Todos componentes domain importáveis via path alias `@/components/domain/*`
</verification>

<success_criteria>
- [ ] AppLayout com Sidebar dark + Topbar funcional
- [ ] 8 rotas registradas em router.tsx
- [ ] / redireciona para /dashboard
- [ ] Zustand store useUIStore com 5 estados
- [ ] 12 componentes domain criados (StatusBadge, SeverityBadge, KPICard, SparklineChart, ProgressBar, DriverAvatar, DataTable, SidePanelLayout, TableWithSidePanel, AlertItem, TripTimeline, MapPlaceholder)
- [ ] Formatters com 7 funções (date, time, duration, relative, percent, km, minutesBetween)
- [ ] Chart.js módulos registrados explicitamente
- [ ] DataTable usa getRowId estável
- [ ] TableWithSidePanel usa minmax(0, 1fr) + reset de seleção + toggle click
- [ ] useUIStore NÃO contém isSidebarCollapsed (shadcn SidebarProvider gerencia sidebar state)
- [ ] Build + tsc --noEmit passam
</success_criteria>

<output>
Após completion, criar `.planning/phases/01-ui-shell-design-system/01-02-SUMMARY.md` listando: layout files, 12 componentes domain criados, store, formatters, decisões de implementação, build status.
</output>

## PLANNING COMPLETE
