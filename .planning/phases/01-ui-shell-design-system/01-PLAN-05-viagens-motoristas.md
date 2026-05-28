---
phase: 01-ui-shell-design-system
plan: 05
type: execute
wave: 2
depends_on: [01, 02, 03]
files_modified:
  - torre-de-controle/src/app/pages/viagens/ViagensPage.tsx
  - torre-de-controle/src/app/pages/viagens/components/ViagensKPIRow.tsx
  - torre-de-controle/src/app/pages/viagens/components/ViagensTabs.tsx
  - torre-de-controle/src/app/pages/viagens/components/ViagensFiltersPanel.tsx
  - torre-de-controle/src/app/pages/viagens/components/ViagensTable.tsx
  - torre-de-controle/src/app/pages/viagens/components/TripDetailPanel.tsx
  - torre-de-controle/src/app/pages/motoristas/MotoristasPage.tsx
  - torre-de-controle/src/app/pages/motoristas/components/MotoristasKPIRow.tsx
  - torre-de-controle/src/app/pages/motoristas/components/MotoristasTable.tsx
  - torre-de-controle/src/app/pages/motoristas/components/DriverDetailPanel.tsx
autonomous: true
requirements:
  - PHASE1-PAGE-VIAGENS
  - PHASE1-PAGE-MOTORISTAS
tags:
  - frontend
  - pages
  - viagens
  - motoristas
  - tabs
  - filters
  - side-panel

must_haves:
  truths:
    - "Página /viagens tem 5 KPIs + 4 tabs (Em andamento, Planejadas, Concluídas, Atrasadas) com contagens reais"
    - "Página /viagens tem painel de filtros lateral com Cliente, Operação, Rota, Prioridade, SLA, Status, Motorista"
    - "Tabela viagens permite selecionar linha → painel lateral com detalhes desliza (TableWithSidePanel)"
    - "TripDetailPanel mostra mapa mini, métricas, timeline (TripTimeline), botões Ver detalhes/Editar/Reagendar"
    - "Página /motoristas tem 5 KPIs + filtros (search, status, base) + tabela"
    - "DriverDetailPanel mostra foto, score, conformidade documentos, localização, últimas viagens, botões Ligar/Mensagem/E-mail"
  artifacts:
    - path: "torre-de-controle/src/app/pages/viagens/ViagensPage.tsx"
      provides: "Página Viagens com tabs + filtros + tabela + side panel"
      contains: "TableWithSidePanel"
    - path: "torre-de-controle/src/app/pages/motoristas/MotoristasPage.tsx"
      provides: "Página Motoristas com tabela + side panel"
      contains: "TableWithSidePanel"
    - path: "torre-de-controle/src/app/pages/viagens/components/TripDetailPanel.tsx"
      provides: "Painel lateral de detalhes da viagem"
      contains: "TripTimeline"
    - path: "torre-de-controle/src/app/pages/motoristas/components/DriverDetailPanel.tsx"
      provides: "Painel lateral de detalhes do motorista"
      contains: "Conformidade"
  key_links:
    - from: "torre-de-controle/src/app/pages/viagens/ViagensPage.tsx"
      to: "torre-de-controle/src/components/domain/TableWithSidePanel.tsx"
      via: "import + use"
      pattern: "TableWithSidePanel"
    - from: "torre-de-controle/src/app/pages/viagens/components/ViagensTabs.tsx"
      to: "torre-de-controle/src/stores/useUIStore.ts"
      via: "activeTripsTab"
      pattern: "activeTripsTab"
---

<objective>
Implementar páginas Viagens e Motoristas com padrão de tabela + side panel ao selecionar item. Viagens tem complexidade extra (tabs por status + filtros laterais). Motoristas mostra documentos e localização. Substituem stubs de PLAN-02.

Purpose: Estas duas páginas validam o padrão TableWithSidePanel (RESEARCH Pattern 3) — fundamento para Alertas em PLAN-06.
Output: 2 páginas + 10 sub-componentes, integração com Zustand para tab ativa e seleção.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/01-ui-shell-design-system/01-CONTEXT.md
@.planning/phases/01-ui-shell-design-system/01-RESEARCH.md
</context>

<interfaces>
```typescript
// PLAN-02
import { KPICard, StatusBadge, DataTable, TableWithSidePanel, SidePanelLayout, DriverAvatar, ProgressBar, MapPlaceholder, TripTimeline } from '@/components/domain/*'

// PLAN-03
import { useTrips, useTrip, useDrivers, useDriver, useTripTimeline } from '@/hooks'
import { useViagensKPIs, useMotoristasKPIs } from '@/hooks'
import type { Trip, Driver, TripFilters, DriverFilters, TripStatus } from '@/data/types'

// Zustand
import { useUIStore } from '@/stores/useUIStore'
// → selectedTripId, setSelectedTripId, selectedDriverId, setSelectedDriverId, activeTripsTab, setActiveTripsTab
```
</interfaces>

<tasks>

<task type="auto">
  <name>Task 1: ViagensPage — KPIs + 4 tabs + filtros lateral + tabela com side panel + TripDetailPanel</name>
  <files>torre-de-controle/src/app/pages/viagens/ViagensPage.tsx, torre-de-controle/src/app/pages/viagens/components/ViagensKPIRow.tsx, torre-de-controle/src/app/pages/viagens/components/ViagensTabs.tsx, torre-de-controle/src/app/pages/viagens/components/ViagensFiltersPanel.tsx, torre-de-controle/src/app/pages/viagens/components/ViagensTable.tsx, torre-de-controle/src/app/pages/viagens/components/TripDetailPanel.tsx</files>
  <read_first>
    - .planning/phases/01-ui-shell-design-system/01-CONTEXT.md (seção "Página Viagens — Layout" — 5 KPIs + tabs com contagens + filtros + colunas exatas + painel lateral)
    - torre-de-controle/src/components/domain/TableWithSidePanel.tsx
    - torre-de-controle/src/components/domain/SidePanelLayout.tsx
    - torre-de-controle/src/components/domain/TripTimeline.tsx
    - torre-de-controle/src/components/ui/tabs.tsx (shadcn)
    - torre-de-controle/src/components/ui/select.tsx
    - torre-de-controle/src/components/ui/checkbox.tsx
    - torre-de-controle/src/stores/useUIStore.ts (activeTripsTab, selectedTripId)
    - torre-de-controle/src/hooks/useTrips.ts
    - torre-de-controle/src/hooks/useTripTimeline.ts
  </read_first>
  <action>
**1. Criar `torre-de-controle/src/app/pages/viagens/components/ViagensKPIRow.tsx`** — 5 KPIs (Total, No prazo, Em risco, Atrasadas, Progresso médio):

```tsx
import { KPICard } from '@/components/domain/KPICard'
import { useViagensKPIs } from '@/hooks/useDashboardKPIs'
import { formatPercent } from '@/lib/formatters'

export function ViagensKPIRow() {
  const { data: k } = useViagensKPIs()
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
      <KPICard title="Total viagens"   value={k.total.count}        color="blue"   />
      <KPICard title="No prazo"         value={k.noPrazo.count}      percent={formatPercent(k.noPrazo.pct)}     color="green"  />
      <KPICard title="Em risco"         value={k.emRisco.count}      percent={formatPercent(k.emRisco.pct)}     color="orange" />
      <KPICard title="Atrasadas"        value={k.atrasadas.count}    percent={formatPercent(k.atrasadas.pct)}   color="red"    />
      <KPICard title="Progresso médio"  value={formatPercent(k.progressoMedio.pct, 0)} progressValue={k.progressoMedio.pct} color="purple" />
    </div>
  )
}
```

**2. Criar `torre-de-controle/src/app/pages/viagens/components/ViagensTabs.tsx`** — 4 tabs com contagens vindas de useTrips():

```tsx
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useTrips } from '@/hooks/useTrips'
import { useUIStore } from '@/stores/useUIStore'
import type { TripStatus } from '@/data/types'

const tabConfig = [
  { id: 'em_andamento', label: 'Em andamento', tripStatus: 'in_progress' as TripStatus },
  { id: 'planejadas',   label: 'Planejadas',    tripStatus: 'planned'     as TripStatus },
  { id: 'concluidas',   label: 'Concluídas',    tripStatus: 'completed'   as TripStatus },
  { id: 'atrasadas',    label: 'Atrasadas',     tripStatus: 'delayed'     as TripStatus },
] as const

export function ViagensTabs() {
  const { activeTripsTab, setActiveTripsTab } = useUIStore()
  const { data: all } = useTrips()
  const counts = {
    em_andamento: all.filter(t => t.status === 'in_progress').length,
    planejadas:   all.filter(t => t.status === 'planned').length,
    concluidas:   all.filter(t => t.status === 'completed').length,
    atrasadas:    all.filter(t => t.status === 'delayed').length,
  }

  return (
    <Tabs value={activeTripsTab} onValueChange={(v) => setActiveTripsTab(v as typeof activeTripsTab)}>
      <TabsList className="bg-white border border-gray-200">
        {tabConfig.map(t => (
          <TabsTrigger key={t.id} value={t.id} className="data-[state=active]:bg-[#0f62fe] data-[state=active]:text-white">
            {t.label}
            <span className="ml-2 text-xs opacity-80 tabular-nums">({counts[t.id]})</span>
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  )
}
```

**3. Criar `torre-de-controle/src/app/pages/viagens/components/ViagensFiltersPanel.tsx`** — filtros do CONTEXT (Cliente, Operação, Rota, Prioridade, SLA, Status, Motorista):

```tsx
import { useState } from 'react'
import { Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { useTrips } from '@/hooks/useTrips'
import type { TripFilters, Priority, SlaStatus } from '@/data/types'

interface Props {
  filters: TripFilters
  onChange: (next: TripFilters) => void
}

export function ViagensFiltersPanel({ filters, onChange }: Props) {
  const { data: all } = useTrips()
  const clients = Array.from(new Set(all.map(t => t.clientName))).sort()
  const operations = Array.from(new Set(all.map(t => t.operationName))).sort()
  const routes = Array.from(new Set(all.map(t => t.routeCode))).sort()

  const set = <K extends keyof TripFilters>(key: K, value: TripFilters[K] | undefined) =>
    onChange({ ...filters, [key]: value })

  return (
    <aside className="bg-white border border-gray-200 rounded-lg p-4 space-y-4 sticky top-0">
      <div>
        <h3 className="text-sm font-semibold text-gray-900">Filtros</h3>
        <p className="text-xs text-gray-500">Refinar por critérios</p>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Motorista (busca)</Label>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
          <Input
            placeholder="Nome do motorista"
            value={filters.driverName ?? ''}
            onChange={(e) => set('driverName', e.target.value || undefined)}
            className="pl-8 h-8 text-xs"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Cliente</Label>
        <Select value={filters.clientName ?? '__all'} onValueChange={(v) => set('clientName', v === '__all' ? undefined : v)}>
          <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Todos" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all">Todos</SelectItem>
            {clients.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Operação</Label>
        <Select value={(filters as any).operationName ?? '__all'} onValueChange={(v) => onChange({ ...filters, ...{ operationName: v === '__all' ? undefined : v } as any })}>
          <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Todas" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all">Todas</SelectItem>
            {operations.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Rota</Label>
        <Select value={filters.routeCode ?? '__all'} onValueChange={(v) => set('routeCode', v === '__all' ? undefined : v)}>
          <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Todas" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all">Todas</SelectItem>
            {routes.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Prioridade</Label>
        <Select value={filters.priority ?? '__all'} onValueChange={(v) => set('priority', v === '__all' ? undefined : v as Priority)}>
          <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Todas" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all">Todas</SelectItem>
            <SelectItem value="alta">Alta</SelectItem>
            <SelectItem value="media">Média</SelectItem>
            <SelectItem value="baixa">Baixa</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">SLA / Janela</Label>
        <Select value={filters.slaStatus ?? '__all'} onValueChange={(v) => set('slaStatus', v === '__all' ? undefined : v as SlaStatus)}>
          <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Todos" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all">Todos</SelectItem>
            <SelectItem value="no_prazo">No prazo</SelectItem>
            <SelectItem value="em_risco">Em risco</SelectItem>
            <SelectItem value="atrasado">Atrasado</SelectItem>
            <SelectItem value="sem_sinal">Sem sinal</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <button
        onClick={() => onChange({})}
        className="text-xs text-[#0f62fe] hover:underline"
      >
        Limpar filtros
      </button>
    </aside>
  )
}
```

**4. Criar `torre-de-controle/src/app/pages/viagens/components/ViagensTable.tsx`** — colunas EXATAS do CONTEXT (checkbox, Código+Prioridade, Cliente, Motorista, Origem, Destino, Janela, ETA, Status, Progresso, Ações):

```tsx
import { type ColumnDef } from '@tanstack/react-table'
import { MoreVertical } from 'lucide-react'
import { TableWithSidePanel } from '@/components/domain/TableWithSidePanel'
import { StatusBadge } from '@/components/domain/StatusBadge'
import { DriverAvatar } from '@/components/domain/DriverAvatar'
import { ProgressBar } from '@/components/domain/ProgressBar'
import { Checkbox } from '@/components/ui/checkbox'
import { useTrips, useTrip } from '@/hooks/useTrips'
import { useUIStore } from '@/stores/useUIStore'
import { formatTime } from '@/lib/formatters'
import { TripDetailPanel } from './TripDetailPanel'
import type { Trip, TripFilters, TripStatus } from '@/data/types'

const priorityDot = { alta: 'bg-red-500', media: 'bg-yellow-500', baixa: 'bg-green-500' } as const

const columns: ColumnDef<Trip>[] = [
  { id: 'select', header: '', size: 40, cell: () => <Checkbox onClick={(e) => e.stopPropagation()} /> },
  {
    id: 'code', header: 'Código',
    cell: ({ row }) => (
      <div className="flex items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${priorityDot[row.original.priority]}`} />
        <span className="text-sm font-mono font-medium text-gray-900">{row.original.code}</span>
      </div>
    ),
  },
  { accessorKey: 'clientName', header: 'Cliente', cell: (i) => <span className="text-sm">{i.getValue<string>()}</span> },
  {
    id: 'driver', header: 'Motorista',
    cell: ({ row }) => (
      <div className="flex items-center gap-2">
        <DriverAvatar name={row.original.driverName} size="sm" />
        <div className="min-w-0">
          <p className="text-sm truncate">{row.original.driverName}</p>
          <p className="text-xs text-gray-500 font-mono">{row.original.plate}</p>
        </div>
      </div>
    ),
  },
  { accessorKey: 'origin',      header: 'Origem',  cell: (i) => <span className="text-xs text-gray-600 truncate">{i.getValue<string>()}</span> },
  { accessorKey: 'destination', header: 'Destino', cell: (i) => <span className="text-xs text-gray-600 truncate">{i.getValue<string>()}</span> },
  {
    id: 'window', header: 'Janela',
    cell: ({ row }) => <span className="text-xs tabular-nums text-gray-600">{formatTime(row.original.windowStart)}–{formatTime(row.original.windowEnd)}</span>,
  },
  { id: 'eta', header: 'ETA', cell: ({ row }) => <span className="text-sm tabular-nums">{formatTime(row.original.eta)}</span> },
  { id: 'status', header: 'Status', cell: ({ row }) => <StatusBadge status={row.original.slaStatus} /> },
  {
    id: 'progress', header: 'Progresso', size: 120,
    cell: ({ row }) => (
      <div className="space-y-1 min-w-[90px]">
        <span className="text-xs text-gray-600 tabular-nums">{row.original.progressPct}%</span>
        <ProgressBar value={row.original.progressPct} color="#0f62fe" height={4} />
      </div>
    ),
  },
  {
    id: 'actions', header: '', size: 40,
    cell: () => (
      <button className="p-1 rounded hover:bg-gray-100" onClick={(e) => e.stopPropagation()}>
        <MoreVertical className="h-4 w-4 text-gray-500" />
      </button>
    ),
  },
]

const tabToStatus: Record<string, TripStatus> = {
  em_andamento: 'in_progress',
  planejadas:   'planned',
  concluidas:   'completed',
  atrasadas:    'delayed',
}

interface Props {
  filters: TripFilters
}

export function ViagensTable({ filters }: Props) {
  const { activeTripsTab, selectedTripId, setSelectedTripId } = useUIStore()
  const merged: TripFilters = { ...filters, status: tabToStatus[activeTripsTab] }
  const { data: trips } = useTrips(merged)
  const { data: selected } = useTrip(selectedTripId)

  return (
    <TableWithSidePanel
      data={trips}
      columns={columns}
      selectedItem={selected}
      onSelect={(t) => setSelectedTripId(t?.id ?? null)}
      renderPanel={(trip) => <TripDetailPanel trip={trip} onClose={() => setSelectedTripId(null)} />}
      panelWidth={420}
    />
  )
}
```

**5. Criar `torre-de-controle/src/app/pages/viagens/components/TripDetailPanel.tsx`** — painel lateral com mapa mini, métricas, timeline, botões:

```tsx
import { Eye, Pencil, CalendarClock } from 'lucide-react'
import { SidePanelLayout } from '@/components/domain/SidePanelLayout'
import { MapPlaceholder } from '@/components/domain/MapPlaceholder'
import { TripTimeline } from '@/components/domain/TripTimeline'
import { StatusBadge } from '@/components/domain/StatusBadge'
import { Button } from '@/components/ui/button'
import { useTripTimeline } from '@/hooks/useTripTimeline'
import { formatTime, formatKm, formatDuration, minutesBetween } from '@/lib/formatters'
import type { Trip } from '@/data/types'

interface Props {
  trip: Trip
  onClose: () => void
}

export function TripDetailPanel({ trip, onClose }: Props) {
  const { data: events } = useTripTimeline(trip.id)
  const remainingKm = Math.max(0, trip.distanceTotal - trip.distanceDone)

  return (
    <SidePanelLayout
      title={trip.code}
      subtitle={`${trip.clientName} · ${trip.routeCode}`}
      onClose={onClose}
      footer={
        <div className="flex gap-2">
          <Button size="sm" className="flex-1 bg-[#0f62fe] hover:bg-[#0353d9] text-xs gap-1.5"><Eye className="h-3.5 w-3.5" /> Ver detalhes</Button>
          <Button size="sm" variant="outline" className="text-xs gap-1.5"><Pencil className="h-3.5 w-3.5" /> Editar</Button>
          <Button size="sm" variant="outline" className="text-xs gap-1.5"><CalendarClock className="h-3.5 w-3.5" /> Reagendar</Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <StatusBadge status={trip.slaStatus} size="md" />
          <span className="text-xs text-gray-500">Prioridade: <strong className="text-gray-900 capitalize">{trip.priority}</strong></span>
        </div>

        <MapPlaceholder height={160} showLegend={false} />

        <div className="grid grid-cols-2 gap-3 text-xs">
          <Metric label="Origem" value={trip.origin} />
          <Metric label="Destino" value={trip.destination} />
          <Metric label="Janela" value={`${formatTime(trip.windowStart)} – ${formatTime(trip.windowEnd)}`} />
          <Metric label="ETA atual" value={formatTime(trip.eta)} />
          <Metric label="Distância total" value={formatKm(trip.distanceTotal)} />
          <Metric label="Restante" value={formatKm(remainingKm)} />
          <Metric label="Progresso" value={`${trip.progressPct}%`} />
          <Metric label="Desvio ETA" value={`${minutesBetween(trip.windowEnd, trip.eta) > 0 ? '+' : ''}${minutesBetween(trip.windowEnd, trip.eta)} min`} />
        </div>

        <div>
          <h4 className="text-xs font-semibold text-gray-900 mb-2 uppercase tracking-wide">Linha do tempo</h4>
          {events.length > 0 ? <TripTimeline events={events} /> : <p className="text-xs text-gray-500">Sem eventos registrados.</p>}
        </div>
      </div>
    </SidePanelLayout>
  )
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <p className="text-[10px] text-gray-500 uppercase tracking-wide">{label}</p>
      <p className="text-sm font-medium text-gray-900 truncate">{value}</p>
    </div>
  )
}
```

**6. Sobrescrever `torre-de-controle/src/app/pages/viagens/ViagensPage.tsx`:**

```tsx
import { useState } from 'react'
import { ViagensKPIRow } from './components/ViagensKPIRow'
import { ViagensTabs } from './components/ViagensTabs'
import { ViagensFiltersPanel } from './components/ViagensFiltersPanel'
import { ViagensTable } from './components/ViagensTable'
import type { TripFilters } from '@/data/types'

export function ViagensPage() {
  const [filters, setFilters] = useState<TripFilters>({})

  return (
    <div className="space-y-5">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Viagens</h1>
          <p className="text-sm text-gray-500">Lista completa com filtros e detalhamento</p>
        </div>
      </header>

      <ViagensKPIRow />

      <ViagensTabs />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-3">
          <ViagensFiltersPanel filters={filters} onChange={setFilters} />
        </div>
        <div className="lg:col-span-9 min-w-0">
          <ViagensTable filters={filters} />
        </div>
      </div>
    </div>
  )
}
```
  </action>
  <verify>
    <automated>cd torre-de-controle && npm run build && npx tsc --noEmit</automated>
  </verify>
  <acceptance_criteria>
    - `torre-de-controle/src/app/pages/viagens/ViagensPage.tsx` contém literalmente `ViagensKPIRow`
    - `torre-de-controle/src/app/pages/viagens/ViagensPage.tsx` contém literalmente `ViagensTabs`
    - `torre-de-controle/src/app/pages/viagens/ViagensPage.tsx` contém literalmente `ViagensFiltersPanel`
    - `torre-de-controle/src/app/pages/viagens/ViagensPage.tsx` contém literalmente `ViagensTable`
    - `torre-de-controle/src/app/pages/viagens/components/ViagensKPIRow.tsx` contém literalmente `Total viagens`
    - `torre-de-controle/src/app/pages/viagens/components/ViagensKPIRow.tsx` contém literalmente `Progresso médio`
    - `torre-de-controle/src/app/pages/viagens/components/ViagensTabs.tsx` contém literalmente `'em_andamento'`
    - `torre-de-controle/src/app/pages/viagens/components/ViagensTabs.tsx` contém literalmente `'planejadas'`
    - `torre-de-controle/src/app/pages/viagens/components/ViagensTabs.tsx` contém literalmente `'concluidas'`
    - `torre-de-controle/src/app/pages/viagens/components/ViagensTabs.tsx` contém literalmente `'atrasadas'`
    - `torre-de-controle/src/app/pages/viagens/components/ViagensTabs.tsx` contém literalmente `useUIStore`
    - `torre-de-controle/src/app/pages/viagens/components/ViagensFiltersPanel.tsx` contém literalmente `Cliente`
    - `torre-de-controle/src/app/pages/viagens/components/ViagensFiltersPanel.tsx` contém literalmente `Operação`
    - `torre-de-controle/src/app/pages/viagens/components/ViagensFiltersPanel.tsx` contém literalmente `Rota`
    - `torre-de-controle/src/app/pages/viagens/components/ViagensFiltersPanel.tsx` contém literalmente `Prioridade`
    - `torre-de-controle/src/app/pages/viagens/components/ViagensFiltersPanel.tsx` contém literalmente `SLA`
    - `torre-de-controle/src/app/pages/viagens/components/ViagensTable.tsx` contém literalmente `TableWithSidePanel`
    - `torre-de-controle/src/app/pages/viagens/components/ViagensTable.tsx` contém literalmente `TripDetailPanel`
    - `torre-de-controle/src/app/pages/viagens/components/TripDetailPanel.tsx` contém literalmente `TripTimeline`
    - `torre-de-controle/src/app/pages/viagens/components/TripDetailPanel.tsx` contém literalmente `Ver detalhes`
    - `torre-de-controle/src/app/pages/viagens/components/TripDetailPanel.tsx` contém literalmente `Reagendar`
    - `torre-de-controle/src/app/pages/viagens/components/TripDetailPanel.tsx` contém literalmente `MapPlaceholder`
    - `npm run build` exit 0
  </acceptance_criteria>
  <done>Viagens com 5 KPIs, 4 tabs com contagens, 7+ filtros, tabela com side panel funcional, build passa.</done>
</task>

<task type="auto">
  <name>Task 2: MotoristasPage — KPIs + filtros header + tabela com side panel + DriverDetailPanel</name>
  <files>torre-de-controle/src/app/pages/motoristas/MotoristasPage.tsx, torre-de-controle/src/app/pages/motoristas/components/MotoristasKPIRow.tsx, torre-de-controle/src/app/pages/motoristas/components/MotoristasTable.tsx, torre-de-controle/src/app/pages/motoristas/components/DriverDetailPanel.tsx</files>
  <read_first>
    - .planning/phases/01-ui-shell-design-system/01-CONTEXT.md (seção "Página Motoristas — Layout" — KPIs, filtros header, colunas, painel lateral exato)
    - torre-de-controle/src/components/domain/TableWithSidePanel.tsx
    - torre-de-controle/src/components/domain/SidePanelLayout.tsx
    - torre-de-controle/src/components/domain/DriverAvatar.tsx
    - torre-de-controle/src/components/domain/MapPlaceholder.tsx
    - torre-de-controle/src/hooks/useDrivers.ts
    - torre-de-controle/src/hooks/useTrips.ts
    - torre-de-controle/src/data/types.ts (DriverDocument, DocStatus)
  </read_first>
  <action>
**1. Criar `torre-de-controle/src/app/pages/motoristas/components/MotoristasKPIRow.tsx`** — 5 KPIs (Ativos, Disponíveis, Em rota, Com atraso, Documentos vencendo):

```tsx
import { KPICard } from '@/components/domain/KPICard'
import { useMotoristasKPIs } from '@/hooks/useDashboardKPIs'

export function MotoristasKPIRow() {
  const { data: k } = useMotoristasKPIs()
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
      <KPICard title="Motoristas ativos"     value={k.ativos.count}             total={k.ativos.total} color="blue"   />
      <KPICard title="Disponíveis"            value={k.disponiveis.count}        color="green"  />
      <KPICard title="Em rota"                value={k.emRota.count}             color="purple" />
      <KPICard title="Com atraso"             value={k.comAtraso.count}          color="orange" />
      <KPICard title="Documentos vencendo"    value={k.documentosVencendo.count} color="red"    />
    </div>
  )
}
```

**2. Criar `torre-de-controle/src/app/pages/motoristas/components/MotoristasTable.tsx`** — colunas do CONTEXT (Motorista, Disponibilidade, Entregas hoje, Atraso médio colorido, Score, Documentos ícones, Localização):

```tsx
import { type ColumnDef } from '@tanstack/react-table'
import { useState } from 'react'
import { Search, Filter, Download, ArrowUpDown, MoreVertical, FileCheck2, FileX2, FileWarning } from 'lucide-react'
import { TableWithSidePanel } from '@/components/domain/TableWithSidePanel'
import { DriverAvatar } from '@/components/domain/DriverAvatar'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useDrivers, useDriver } from '@/hooks/useDrivers'
import { useUIStore } from '@/stores/useUIStore'
import { formatDuration } from '@/lib/formatters'
import { DriverDetailPanel } from './DriverDetailPanel'
import type { Driver, DriverFilters, DriverStatus, DocStatus } from '@/data/types'

const statusLabel: Record<DriverStatus, { label: string; classes: string }> = {
  available:    { label: 'Disponível',    classes: 'bg-green-100 text-green-700' },
  on_route:     { label: 'Em rota',        classes: 'bg-blue-100 text-blue-700' },
  unavailable:  { label: 'Indisponível',   classes: 'bg-gray-100 text-gray-600' },
}

function delayColor(min: number) {
  if (min <= 0) return 'text-green-600'
  if (min < 10) return 'text-yellow-600'
  return 'text-red-600'
}

function scoreColor(score: number) {
  if (score >= 90) return 'bg-green-100 text-green-700'
  if (score >= 80) return 'bg-yellow-100 text-yellow-700'
  return 'bg-red-100 text-red-700'
}

const docIconByStatus: Record<DocStatus, { Icon: typeof FileCheck2; color: string }> = {
  valido:         { Icon: FileCheck2,  color: 'text-green-600' },
  vence_em_breve: { Icon: FileWarning, color: 'text-yellow-600' },
  vencido:        { Icon: FileX2,      color: 'text-red-600' },
}

const columns: ColumnDef<Driver>[] = [
  {
    id: 'driver', header: 'Motorista', size: 240,
    cell: ({ row }) => (
      <div className="flex items-center gap-3">
        <DriverAvatar name={row.original.name} status={row.original.status} size="md" />
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-900 truncate">{row.original.name}</p>
          <p className="text-xs text-gray-500 font-mono">{row.original.plate} · {row.original.vehicleType}</p>
        </div>
      </div>
    ),
  },
  {
    id: 'status', header: 'Disponibilidade',
    cell: ({ row }) => {
      const c = statusLabel[row.original.status]
      return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${c.classes}`}>{c.label}</span>
    },
  },
  { accessorKey: 'deliveriesToday', header: 'Entregas hoje', cell: (i) => <span className="text-sm tabular-nums">{i.getValue<number>()}</span> },
  {
    id: 'delay', header: 'Atraso médio',
    cell: ({ row }) => <span className={`text-sm font-medium tabular-nums ${delayColor(row.original.avgDelayMinutes)}`}>{row.original.avgDelayMinutes >= 0 ? '+' : ''}{formatDuration(Math.abs(row.original.avgDelayMinutes))}</span>,
  },
  {
    id: 'score', header: 'Score',
    cell: ({ row }) => <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium tabular-nums ${scoreColor(row.original.operationalScore)}`}>{row.original.operationalScore}</span>,
  },
  {
    id: 'docs', header: 'Documentos',
    cell: ({ row }) => (
      <div className="flex gap-1.5">
        {row.original.documents.map(d => {
          const { Icon, color } = docIconByStatus[d.status]
          return <Icon key={d.type} className={`h-4 w-4 ${color}`} aria-label={`${d.type}: ${d.status}`} />
        })}
      </div>
    ),
  },
  { accessorKey: 'address', header: 'Localização', cell: (i) => <span className="text-xs text-gray-600 truncate">{i.getValue<string>()}</span> },
  {
    id: 'actions', header: '', size: 40,
    cell: () => (
      <button className="p-1 rounded hover:bg-gray-100" onClick={(e) => e.stopPropagation()}>
        <MoreVertical className="h-4 w-4 text-gray-500" />
      </button>
    ),
  },
]

export function MotoristasTable() {
  const [filters, setFilters] = useState<DriverFilters>({})
  const { data: drivers } = useDrivers(filters)
  const { selectedDriverId, setSelectedDriverId } = useUIStore()
  const { data: selected } = useDriver(selectedDriverId)
  const bases = ['CD São Paulo', 'CD Guarulhos', 'CD Campinas']

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Buscar motorista, placa ou código..."
            value={filters.search ?? ''}
            onChange={(e) => setFilters({ ...filters, search: e.target.value || undefined })}
            className="pl-9 h-9 text-sm"
          />
        </div>

        <Select value={filters.status ?? '__all'} onValueChange={(v) => setFilters({ ...filters, status: v === '__all' ? undefined : v as DriverStatus })}>
          <SelectTrigger className="h-9 w-[160px] text-xs"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all">Todos status</SelectItem>
            <SelectItem value="available">Disponível</SelectItem>
            <SelectItem value="on_route">Em rota</SelectItem>
            <SelectItem value="unavailable">Indisponível</SelectItem>
          </SelectContent>
        </Select>

        <Select value={filters.base ?? '__all'} onValueChange={(v) => setFilters({ ...filters, base: v === '__all' ? undefined : v })}>
          <SelectTrigger className="h-9 w-[160px] text-xs"><SelectValue placeholder="Base" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all">Todas bases</SelectItem>
            {bases.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
          </SelectContent>
        </Select>

        <Button variant="outline" size="sm" className="h-9 gap-2 text-xs"><ArrowUpDown className="h-3.5 w-3.5" /> Ordenar</Button>
        <Button variant="outline" size="sm" className="h-9 gap-2 text-xs"><Filter className="h-3.5 w-3.5" /> Filtros</Button>
        <Button variant="outline" size="sm" className="h-9 gap-2 text-xs"><Download className="h-3.5 w-3.5" /> Exportar</Button>
      </div>

      <TableWithSidePanel
        data={drivers}
        columns={columns}
        selectedItem={selected}
        onSelect={(d) => setSelectedDriverId(d?.id ?? null)}
        renderPanel={(d) => <DriverDetailPanel driver={d} onClose={() => setSelectedDriverId(null)} />}
        panelWidth={400}
      />
    </div>
  )
}
```

**3. Criar `torre-de-controle/src/app/pages/motoristas/components/DriverDetailPanel.tsx`** — painel COMPLETO do CONTEXT (foto, nome, placa, score, badge disponível, botões Ligar/Mensagem/E-mail, Conformidade documentos, Localização atual, Últimas viagens):

```tsx
import { Phone, MessageSquare, Mail, FileCheck2, FileX2, FileWarning } from 'lucide-react'
import { SidePanelLayout } from '@/components/domain/SidePanelLayout'
import { DriverAvatar } from '@/components/domain/DriverAvatar'
import { MapPlaceholder } from '@/components/domain/MapPlaceholder'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { useTrips } from '@/hooks/useTrips'
import { formatDate } from '@/lib/formatters'
import { cn } from '@/lib/utils'
import type { Driver, DocStatus } from '@/data/types'

const docConfig: Record<DocStatus, { Icon: typeof FileCheck2; color: string; label: string }> = {
  valido:         { Icon: FileCheck2,  color: 'text-green-600',  label: 'Válido' },
  vence_em_breve: { Icon: FileWarning, color: 'text-yellow-600', label: 'Vence em breve' },
  vencido:        { Icon: FileX2,      color: 'text-red-600',    label: 'Vencido' },
}

const statusBadge = {
  available:   { label: 'Disponível',   classes: 'bg-green-100 text-green-700' },
  on_route:    { label: 'Em rota',       classes: 'bg-blue-100 text-blue-700' },
  unavailable: { label: 'Indisponível',  classes: 'bg-gray-100 text-gray-600' },
} as const

interface Props {
  driver: Driver
  onClose: () => void
}

export function DriverDetailPanel({ driver, onClose }: Props) {
  const { data: allTrips } = useTrips()
  const recent = allTrips
    .filter(t => t.driverId === driver.id)
    .sort((a, b) => (b.departedAt?.getTime() ?? 0) - (a.departedAt?.getTime() ?? 0))
    .slice(0, 5)

  const sb = statusBadge[driver.status]

  return (
    <SidePanelLayout
      title={driver.name}
      subtitle={`${driver.code} · ${driver.plate}`}
      onClose={onClose}
    >
      <div className="space-y-5">
        <div className="flex items-start gap-3">
          <DriverAvatar name={driver.name} photoUrl={driver.photoUrl} status={driver.status} size="lg" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900">{driver.name}</p>
            <p className="text-xs text-gray-500 font-mono">{driver.plate} · {driver.vehicleType}</p>
            <p className="text-xs text-gray-500 mt-1">{driver.base}</p>
            <div className="flex items-center gap-2 mt-2">
              <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium', sb.classes)}>{sb.label}</span>
              <span className="text-xs text-gray-500">Score: <strong className="text-gray-900 tabular-nums">{driver.operationalScore}</strong></span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <Button size="sm" variant="outline" className="text-xs gap-1.5"><Phone className="h-3.5 w-3.5" /> Ligar</Button>
          <Button size="sm" variant="outline" className="text-xs gap-1.5"><MessageSquare className="h-3.5 w-3.5" /> Mensagem</Button>
          <Button size="sm" variant="outline" className="text-xs gap-1.5"><Mail className="h-3.5 w-3.5" /> E-mail</Button>
        </div>

        <Separator />

        <div>
          <h4 className="text-xs font-semibold text-gray-900 mb-2 uppercase tracking-wide">Conformidade e documentos</h4>
          <ul className="space-y-2">
            {driver.documents.map(doc => {
              const { Icon, color, label } = docConfig[doc.status]
              return (
                <li key={doc.type} className="flex items-center gap-2 text-xs">
                  <Icon className={cn('h-4 w-4', color)} />
                  <div className="flex-1 min-w-0">
                    <p className="text-gray-900">{doc.type}</p>
                    <p className="text-gray-500">{label} · validade {formatDate(doc.expiresAt, 'dd/MM/yyyy')}</p>
                  </div>
                </li>
              )
            })}
          </ul>
        </div>

        <Separator />

        <div>
          <h4 className="text-xs font-semibold text-gray-900 mb-2 uppercase tracking-wide">Localização atual</h4>
          <MapPlaceholder height={140} showLegend={false} />
          <p className="text-xs text-gray-600 mt-2">{driver.address}</p>
          <p className="text-[10px] text-gray-400 font-mono mt-0.5">{driver.lat.toFixed(4)}, {driver.lng.toFixed(4)}</p>
        </div>

        <Separator />

        <div>
          <h4 className="text-xs font-semibold text-gray-900 mb-2 uppercase tracking-wide">Últimas viagens</h4>
          {recent.length === 0 ? (
            <p className="text-xs text-gray-500">Sem viagens recentes.</p>
          ) : (
            <ul className="space-y-2">
              {recent.map(t => (
                <li key={t.id} className="flex items-center justify-between text-xs border-b border-gray-100 pb-1.5 last:border-0">
                  <div className="min-w-0">
                    <p className="font-mono text-gray-900">{t.code}</p>
                    <p className="text-gray-500 truncate">{t.clientName} · {t.destination}</p>
                  </div>
                  <span className="text-[10px] text-gray-500 shrink-0 ml-2">{t.departedAt ? formatDate(t.departedAt, 'dd/MM HH:mm') : '—'}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </SidePanelLayout>
  )
}
```

**4. Sobrescrever `torre-de-controle/src/app/pages/motoristas/MotoristasPage.tsx`:**

```tsx
import { MotoristasKPIRow } from './components/MotoristasKPIRow'
import { MotoristasTable } from './components/MotoristasTable'

export function MotoristasPage() {
  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-bold text-gray-900">Motoristas</h1>
        <p className="text-sm text-gray-500">Equipe ativa, documentos e desempenho</p>
      </header>

      <MotoristasKPIRow />
      <MotoristasTable />
    </div>
  )
}
```
  </action>
  <verify>
    <automated>cd torre-de-controle && npm run build && npx tsc --noEmit</automated>
  </verify>
  <acceptance_criteria>
    - `torre-de-controle/src/app/pages/motoristas/MotoristasPage.tsx` contém literalmente `MotoristasKPIRow`
    - `torre-de-controle/src/app/pages/motoristas/MotoristasPage.tsx` contém literalmente `MotoristasTable`
    - `torre-de-controle/src/app/pages/motoristas/components/MotoristasKPIRow.tsx` contém literalmente `Motoristas ativos`
    - `torre-de-controle/src/app/pages/motoristas/components/MotoristasKPIRow.tsx` contém literalmente `Disponíveis`
    - `torre-de-controle/src/app/pages/motoristas/components/MotoristasKPIRow.tsx` contém literalmente `Em rota`
    - `torre-de-controle/src/app/pages/motoristas/components/MotoristasKPIRow.tsx` contém literalmente `Com atraso`
    - `torre-de-controle/src/app/pages/motoristas/components/MotoristasKPIRow.tsx` contém literalmente `Documentos vencendo`
    - `torre-de-controle/src/app/pages/motoristas/components/MotoristasTable.tsx` contém literalmente `TableWithSidePanel`
    - `torre-de-controle/src/app/pages/motoristas/components/MotoristasTable.tsx` contém literalmente `DriverDetailPanel`
    - `torre-de-controle/src/app/pages/motoristas/components/MotoristasTable.tsx` contém literalmente `Disponibilidade`
    - `torre-de-controle/src/app/pages/motoristas/components/MotoristasTable.tsx` contém literalmente `Atraso médio`
    - `torre-de-controle/src/app/pages/motoristas/components/MotoristasTable.tsx` contém literalmente `Score`
    - `torre-de-controle/src/app/pages/motoristas/components/MotoristasTable.tsx` contém literalmente `Exportar`
    - `torre-de-controle/src/app/pages/motoristas/components/DriverDetailPanel.tsx` contém literalmente `Conformidade`
    - `torre-de-controle/src/app/pages/motoristas/components/DriverDetailPanel.tsx` contém literalmente `Últimas viagens`
    - `torre-de-controle/src/app/pages/motoristas/components/DriverDetailPanel.tsx` contém literalmente `Ligar`
    - `torre-de-controle/src/app/pages/motoristas/components/DriverDetailPanel.tsx` contém literalmente `Mensagem`
    - `torre-de-controle/src/app/pages/motoristas/components/DriverDetailPanel.tsx` contém literalmente `MapPlaceholder`
    - `npm run build` exit 0
  </acceptance_criteria>
  <done>Motoristas com 5 KPIs, header de filtros, tabela com side panel, painel completo (foto/score/docs/localização/viagens), build passa.</done>
</task>

</tasks>

<threat_model>

## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| filtros user → query mock | Inputs strings de busca chegam aos hooks |
| seleção → painel | Click em linha persiste id na store global |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-01-10 | Tampering | Inputs de filtro | mitigate | Filtros usam React state controlado; sem eval, sem innerHTML; Phase 2 vai sanitizar no backend |
| T-01-11 | Information Disclosure | Telefone/email do motorista no painel | accept | Mock data fictício; Phase 2+ aplica RBAC |

</threat_model>

<verification>
- `npm run build && npx tsc --noEmit` exit 0
- /viagens: trocar tabs muda contagem na tabela (manual); aplicar filtro Cliente=Shopee filtra
- /viagens: clicar em linha abre painel lateral com timeline
- /viagens: em 1366x768, TableWithSidePanel com 400px painel — tabela tem ≥ 620px disponível (manual)
- /motoristas: clicar em linha abre painel com docs + mapa + últimas viagens
</verification>

<success_criteria>
- [ ] ViagensPage com 5 KPIs, 4 tabs com contagens reais, painel de filtros lateral, tabela com TableWithSidePanel, TripDetailPanel funcional
- [ ] MotoristasPage com 5 KPIs, header de filtros (search/status/base/ordenar/filtros/exportar), tabela com TableWithSidePanel, DriverDetailPanel completo
- [ ] Zustand store consumido para activeTripsTab e selectedDriverId
- [ ] Filtros aplicam corretamente
- [ ] Build passa
</success_criteria>

<output>
Após completion, criar `.planning/phases/01-ui-shell-design-system/01-05-SUMMARY.md` listando: páginas implementadas, sub-componentes criados, validação de TableWithSidePanel, build status.
</output>

## PLANNING COMPLETE
