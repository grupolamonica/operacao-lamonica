---
phase: 01-ui-shell-design-system
plan: 04
type: execute
wave: 2
depends_on: [01, 02, 03]
files_modified:
  - torre-de-controle/src/app/pages/dashboard/DashboardPage.tsx
  - torre-de-controle/src/app/pages/dashboard/components/DashboardKPIRow.tsx
  - torre-de-controle/src/app/pages/dashboard/components/TripsInProgressTable.tsx
  - torre-de-controle/src/app/pages/dashboard/components/ExceptionsAlertsPanel.tsx
  - torre-de-controle/src/app/pages/dashboard/components/OperationalSummary.tsx
  - torre-de-controle/src/app/pages/torre-de-controle/TorreDeControlePage.tsx
  - torre-de-controle/src/app/pages/torre-de-controle/components/TorreKPIRow.tsx
  - torre-de-controle/src/app/pages/torre-de-controle/components/AtRiskTripsTable.tsx
  - torre-de-controle/src/app/pages/torre-de-controle/components/OperationalQueue.tsx
  - torre-de-controle/src/app/pages/torre-de-controle/components/OperatorsQueue.tsx
autonomous: true
requirements:
  - PHASE1-PAGE-DASHBOARD
  - PHASE1-PAGE-TORRE
tags:
  - frontend
  - pages
  - dashboard
  - torre-de-controle

must_haves:
  truths:
    - "Página /dashboard renderiza 5 KPI cards na linha superior matching CONTEXT"
    - "Dashboard mostra mapa placeholder + tabela 'Viagens em andamento' à esquerda (~70%)"
    - "Dashboard mostra 'Exceções e alertas' + 'Resumo operacional' à direita (~30%)"
    - "Página /torre-de-controle renderiza 5 KPI cards"
    - "Torre mostra mapa + tabela 'Viagens em maior risco' à esquerda"
    - "Torre mostra 'Fila operacional' (com botões Assumir/Ligar) + 'Fila de operadores' à direita"
    - "Tabelas usam DataTable com dados de useTrips()"
    - "Alertas usam AlertItem com dados de useAlerts()"
  artifacts:
    - path: "torre-de-controle/src/app/pages/dashboard/DashboardPage.tsx"
      provides: "Página Dashboard completa"
      contains: "DashboardKPIRow"
    - path: "torre-de-controle/src/app/pages/torre-de-controle/TorreDeControlePage.tsx"
      provides: "Página Torre de Controle completa"
      contains: "OperationalQueue"
  key_links:
    - from: "torre-de-controle/src/app/pages/dashboard/DashboardPage.tsx"
      to: "torre-de-controle/src/hooks/useDashboardKPIs.ts"
      via: "useDashboardKPIs hook"
      pattern: "useDashboardKPIs\\("
    - from: "torre-de-controle/src/app/pages/torre-de-controle/TorreDeControlePage.tsx"
      to: "torre-de-controle/src/hooks/useAlerts.ts"
      via: "useAlerts hook"
      pattern: "useAlerts\\("
---

<objective>
Implementar páginas Dashboard e Torre de Controle conforme designs do CONTEXT. Ambas seguem layout 70/30 com KPIs no topo, mapa+tabela à esquerda, painéis à direita. Substituem stubs criados em PLAN-02.

Purpose: Estas duas páginas são a vitrine principal do MVP — todos os critérios visuais do CONTEXT exigem implementação fiel ao design.
Output: 2 páginas funcionais com 9 sub-componentes, dados via hooks de PLAN-03, layout responsivo via grid.
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
<!-- Componentes/hooks já criados em PLAN-02 e PLAN-03 que esta página vai consumir -->

```typescript
// De PLAN-02
import { KPICard } from '@/components/domain/KPICard'
import { StatusBadge } from '@/components/domain/StatusBadge'
import { SeverityBadge } from '@/components/domain/SeverityBadge'
import { DataTable } from '@/components/domain/DataTable'
import { AlertItem } from '@/components/domain/AlertItem'
import { DriverAvatar } from '@/components/domain/DriverAvatar'
import { ProgressBar } from '@/components/domain/ProgressBar'
import { MapPlaceholder } from '@/components/domain/MapPlaceholder'

// De PLAN-03
import { useTrips } from '@/hooks/useTrips'
import { useAlerts, useAlertsBySeverity } from '@/hooks/useAlerts'
import { useDashboardKPIs, useTorreKPIs } from '@/hooks/useDashboardKPIs'
import type { Trip, Alert } from '@/data/types'

// De PLAN-02 (formatters)
import { formatTime, formatPercent, formatDuration } from '@/lib/formatters'
```
</interfaces>

<tasks>

<task type="auto">
  <name>Task 1: DashboardPage — 5 KPI cards + grid 70/30 (mapa+tabela viagens / exceções+resumo)</name>
  <files>torre-de-controle/src/app/pages/dashboard/DashboardPage.tsx, torre-de-controle/src/app/pages/dashboard/components/DashboardKPIRow.tsx, torre-de-controle/src/app/pages/dashboard/components/TripsInProgressTable.tsx, torre-de-controle/src/app/pages/dashboard/components/ExceptionsAlertsPanel.tsx, torre-de-controle/src/app/pages/dashboard/components/OperationalSummary.tsx</files>
  <read_first>
    - .planning/phases/01-ui-shell-design-system/01-CONTEXT.md (seção "Página Dashboard — Layout" — KPIs exatos + Tabela Viagens em andamento + colunas)
    - torre-de-controle/src/components/domain/KPICard.tsx
    - torre-de-controle/src/components/domain/DataTable.tsx
    - torre-de-controle/src/components/domain/StatusBadge.tsx
    - torre-de-controle/src/components/domain/AlertItem.tsx
    - torre-de-controle/src/components/domain/MapPlaceholder.tsx
    - torre-de-controle/src/hooks/useTrips.ts
    - torre-de-controle/src/hooks/useAlerts.ts
    - torre-de-controle/src/hooks/useDashboardKPIs.ts
    - torre-de-controle/src/data/types.ts
  </read_first>
  <action>
**1. Criar `torre-de-controle/src/app/pages/dashboard/components/DashboardKPIRow.tsx`** — 5 KPIs exatos do CONTEXT:

```tsx
import { KPICard } from '@/components/domain/KPICard'
import { useDashboardKPIs } from '@/hooks/useDashboardKPIs'
import { formatPercent } from '@/lib/formatters'

export function DashboardKPIRow() {
  const { data: kpis } = useDashboardKPIs()

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
      <KPICard
        title="Entregas no prazo"
        value={kpis.entregas.onTime}
        total={kpis.entregas.total}
        percent={formatPercent(kpis.entregas.pct)}
        progressValue={kpis.entregas.pct}
        color="green"
      />
      <KPICard
        title="% SLA"
        value={formatPercent(kpis.sla.pct)}
        subtitle={`Meta: ${kpis.sla.meta}%`}
        progressValue={kpis.sla.pct}
        color="blue"
      />
      <KPICard
        title="Motoristas em risco"
        value={kpis.motoristasEmRisco.count}
        total={kpis.motoristasEmRisco.total}
        sparklineData={kpis.motoristasEmRisco.sparkline}
        color="orange"
      />
      <KPICard
        title="Atrasos críticos"
        value={kpis.atrasosCriticos.count}
        total={kpis.atrasosCriticos.total}
        sparklineData={kpis.atrasosCriticos.sparkline}
        color="red"
      />
      <KPICard
        title="Paradas não planejadas"
        value={kpis.paradasNaoPlanejadas.count}
        total={kpis.paradasNaoPlanejadas.total}
        sparklineData={kpis.paradasNaoPlanejadas.sparkline}
        color="purple"
      />
    </div>
  )
}
```

**2. Criar `torre-de-controle/src/app/pages/dashboard/components/TripsInProgressTable.tsx`** — colunas EXATAS do CONTEXT (Motorista, Cliente, Entrega, ETA, Janela, Status, Localização, Progresso, Ações):

```tsx
import { type ColumnDef } from '@tanstack/react-table'
import { MoreVertical } from 'lucide-react'
import { DataTable } from '@/components/domain/DataTable'
import { StatusBadge } from '@/components/domain/StatusBadge'
import { DriverAvatar } from '@/components/domain/DriverAvatar'
import { ProgressBar } from '@/components/domain/ProgressBar'
import { useTrips } from '@/hooks/useTrips'
import { formatTime } from '@/lib/formatters'
import type { Trip } from '@/data/types'

const columns: ColumnDef<Trip>[] = [
  {
    id: 'driver', header: 'Motorista', size: 220,
    cell: ({ row }) => {
      const t = row.original
      return (
        <div className="flex items-center gap-2">
          <DriverAvatar name={t.driverName} photoUrl={t.driverPhoto} size="sm" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">{t.driverName}</p>
            <p className="text-xs text-gray-500 font-mono">{t.plate}</p>
          </div>
        </div>
      )
    },
  },
  { accessorKey: 'clientName', header: 'Cliente', cell: (info) => <span className="text-sm text-gray-700">{info.getValue<string>()}</span> },
  { accessorKey: 'destination', header: 'Entrega', cell: (info) => <span className="text-sm text-gray-700 truncate">{info.getValue<string>()}</span> },
  { id: 'eta',    header: 'ETA',    cell: ({ row }) => <span className="text-sm tabular-nums">{formatTime(row.original.eta)}</span> },
  {
    id: 'window', header: 'Janela',
    cell: ({ row }) => <span className="text-sm tabular-nums text-gray-600">{formatTime(row.original.windowStart)} – {formatTime(row.original.windowEnd)}</span>,
  },
  { id: 'status', header: 'Status', cell: ({ row }) => <StatusBadge status={row.original.slaStatus} /> },
  { accessorKey: 'origin', header: 'Localização', cell: (info) => <span className="text-xs text-gray-600 truncate">{info.getValue<string>()}</span> },
  {
    id: 'progress', header: 'Progresso', size: 140,
    cell: ({ row }) => (
      <div className="space-y-1 min-w-[100px]">
        <span className="text-xs text-gray-600">{row.original.progressPct}%</span>
        <ProgressBar value={row.original.progressPct} color="#0f62fe" height={4} />
      </div>
    ),
  },
  {
    id: 'actions', header: '', size: 40,
    cell: () => (
      <button className="p-1 rounded hover:bg-gray-100 text-gray-500" onClick={(e) => e.stopPropagation()}>
        <MoreVertical className="h-4 w-4" />
      </button>
    ),
  },
]

export function TripsInProgressTable() {
  const { data: trips } = useTrips({ status: 'in_progress' })
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-gray-900">Viagens em andamento</h3>
        <span className="text-xs text-gray-500">{trips.length} ativas</span>
      </div>
      <DataTable data={trips} columns={columns} pageSize={10} />
    </div>
  )
}
```

**3. Criar `torre-de-controle/src/app/pages/dashboard/components/ExceptionsAlertsPanel.tsx`:**

```tsx
import { AlertItem } from '@/components/domain/AlertItem'
import { useAlerts } from '@/hooks/useAlerts'

export function ExceptionsAlertsPanel() {
  const { data: alerts } = useAlerts({ status: 'aberto' })
  // Top 5 críticos+médios para o painel
  const top = [...alerts]
    .sort((a, b) => {
      const sev = { critico: 0, medio: 1, baixo: 2 }
      return sev[a.severity] - sev[b.severity]
    })
    .slice(0, 5)

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900">Exceções e alertas</h3>
        <span className="text-xs text-gray-500">{alerts.length} abertos</span>
      </div>
      <div className="space-y-2">
        {top.map(a => (
          <AlertItem
            key={a.id}
            variant="list"
            alert={{
              id: a.id, severity: a.severity, title: a.title, subtitle: a.tripCode,
              driverName: a.driverName, driverPhoto: a.driverPhoto, plate: a.plate,
              clientName: a.clientName, occurredAt: a.occurredAt, delayMinutes: a.delayMinutes,
            }}
          />
        ))}
      </div>
    </div>
  )
}
```

**4. Criar `torre-de-controle/src/app/pages/dashboard/components/OperationalSummary.tsx`:**

```tsx
import { useDashboardKPIs } from '@/hooks/useDashboardKPIs'
import { useTrips } from '@/hooks/useTrips'

export function OperationalSummary() {
  const { data: kpis } = useDashboardKPIs()
  const { data: inProgress } = useTrips({ status: 'in_progress' })
  const { data: planned } = useTrips({ status: 'planned' })
  const { data: completed } = useTrips({ status: 'completed' })

  const rows = [
    { label: 'Viagens em andamento', value: inProgress.length },
    { label: 'Viagens planejadas',   value: planned.length },
    { label: 'Concluídas hoje',       value: completed.length },
    { label: 'Atrasos críticos',      value: kpis.atrasosCriticos.count, accent: 'text-red-600' },
    { label: 'Motoristas em risco',   value: kpis.motoristasEmRisco.count, accent: 'text-orange-600' },
  ] as const

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <h3 className="text-sm font-semibold text-gray-900 mb-3">Resumo operacional</h3>
      <ul className="space-y-2.5">
        {rows.map(r => (
          <li key={r.label} className="flex items-center justify-between text-sm">
            <span className="text-gray-600">{r.label}</span>
            <span className={`font-semibold tabular-nums ${('accent' in r && r.accent) ? r.accent : 'text-gray-900'}`}>
              {r.value}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
```

**5. Sobrescrever `torre-de-controle/src/app/pages/dashboard/DashboardPage.tsx`:**

```tsx
import { DashboardKPIRow } from './components/DashboardKPIRow'
import { TripsInProgressTable } from './components/TripsInProgressTable'
import { ExceptionsAlertsPanel } from './components/ExceptionsAlertsPanel'
import { OperationalSummary } from './components/OperationalSummary'
import { MapPlaceholder } from '@/components/domain/MapPlaceholder'

export function DashboardPage() {
  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard Operacional</h1>
        <p className="text-sm text-gray-500">Visão geral em tempo real da operação</p>
      </header>

      <DashboardKPIRow />

      <div className="grid grid-cols-1 lg:grid-cols-10 gap-5">
        <div className="lg:col-span-7 space-y-5">
          <MapPlaceholder height={360} />
          <TripsInProgressTable />
        </div>
        <div className="lg:col-span-3 space-y-5">
          <ExceptionsAlertsPanel />
          <OperationalSummary />
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
    - `torre-de-controle/src/app/pages/dashboard/DashboardPage.tsx` contém literalmente `DashboardKPIRow`
    - `torre-de-controle/src/app/pages/dashboard/DashboardPage.tsx` contém literalmente `TripsInProgressTable`
    - `torre-de-controle/src/app/pages/dashboard/DashboardPage.tsx` contém literalmente `ExceptionsAlertsPanel`
    - `torre-de-controle/src/app/pages/dashboard/DashboardPage.tsx` contém literalmente `OperationalSummary`
    - `torre-de-controle/src/app/pages/dashboard/DashboardPage.tsx` contém literalmente `MapPlaceholder`
    - `torre-de-controle/src/app/pages/dashboard/components/DashboardKPIRow.tsx` contém literalmente `Entregas no prazo`
    - `torre-de-controle/src/app/pages/dashboard/components/DashboardKPIRow.tsx` contém literalmente `% SLA`
    - `torre-de-controle/src/app/pages/dashboard/components/DashboardKPIRow.tsx` contém literalmente `Motoristas em risco`
    - `torre-de-controle/src/app/pages/dashboard/components/DashboardKPIRow.tsx` contém literalmente `Atrasos críticos`
    - `torre-de-controle/src/app/pages/dashboard/components/DashboardKPIRow.tsx` contém literalmente `Paradas não planejadas`
    - `torre-de-controle/src/app/pages/dashboard/components/TripsInProgressTable.tsx` contém literalmente `useTrips({ status: 'in_progress' })`
    - `torre-de-controle/src/app/pages/dashboard/components/TripsInProgressTable.tsx` contém literalmente `Viagens em andamento`
    - `torre-de-controle/src/app/pages/dashboard/components/TripsInProgressTable.tsx` contém literalmente `Janela`
    - `torre-de-controle/src/app/pages/dashboard/components/TripsInProgressTable.tsx` contém literalmente `Progresso`
    - `torre-de-controle/src/app/pages/dashboard/components/ExceptionsAlertsPanel.tsx` contém literalmente `Exceções e alertas`
    - `torre-de-controle/src/app/pages/dashboard/components/OperationalSummary.tsx` contém literalmente `Resumo operacional`
    - `npm run build` exit 0
  </acceptance_criteria>
  <done>Dashboard renderiza com 5 KPIs corretos, layout 70/30, mapa+tabela+painéis, build passa.</done>
</task>

<task type="auto">
  <name>Task 2: TorreDeControlePage — 5 KPIs + tabela viagens em risco + Fila operacional + Fila operadores</name>
  <files>torre-de-controle/src/app/pages/torre-de-controle/TorreDeControlePage.tsx, torre-de-controle/src/app/pages/torre-de-controle/components/TorreKPIRow.tsx, torre-de-controle/src/app/pages/torre-de-controle/components/AtRiskTripsTable.tsx, torre-de-controle/src/app/pages/torre-de-controle/components/OperationalQueue.tsx, torre-de-controle/src/app/pages/torre-de-controle/components/OperatorsQueue.tsx</files>
  <read_first>
    - .planning/phases/01-ui-shell-design-system/01-CONTEXT.md (seção "Página Torre de Controle — Layout" — 5 KPIs específicos + Fila operacional)
    - torre-de-controle/src/components/domain/AlertItem.tsx (variant="queue" tem Assumir/Ligar)
    - torre-de-controle/src/hooks/useDashboardKPIs.ts (useTorreKPIs)
    - torre-de-controle/src/hooks/useAlerts.ts (useAlerts com filtro severity)
    - torre-de-controle/src/hooks/useTrips.ts
    - torre-de-controle/src/hooks/useDrivers.ts
  </read_first>
  <action>
**1. Criar `torre-de-controle/src/app/pages/torre-de-controle/components/TorreKPIRow.tsx`** — 5 KPIs do CONTEXT (Viagens ativas, Em risco, Atrasos críticos, Sem sinal, Ocorrências):

```tsx
import { KPICard } from '@/components/domain/KPICard'
import { useTorreKPIs } from '@/hooks/useDashboardKPIs'

export function TorreKPIRow() {
  const { data: k } = useTorreKPIs()
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
      <KPICard title="Viagens ativas"   value={k.viagensAtivas.count}   total={k.viagensAtivas.total}   color="blue"   />
      <KPICard title="Em risco"          value={k.emRisco.count}         total={k.emRisco.total}         color="orange" />
      <KPICard title="Atrasos críticos"  value={k.atrasosCriticos.count} total={k.atrasosCriticos.total} color="red"    />
      <KPICard title="Sem sinal"         value={k.semSinal.count}        total={k.semSinal.total}        color="gray"   />
      <KPICard
        title="Ocorrências abertas"
        value={k.ocorrencias.criticas + k.ocorrencias.medias}
        subtitle={`${k.ocorrencias.criticas} críticas · ${k.ocorrencias.medias} médias`}
        color="purple"
      />
    </div>
  )
}
```

**2. Criar `torre-de-controle/src/app/pages/torre-de-controle/components/AtRiskTripsTable.tsx`** — viagens em risco/atrasadas/sem_sinal:

```tsx
import { type ColumnDef } from '@tanstack/react-table'
import { DataTable } from '@/components/domain/DataTable'
import { StatusBadge } from '@/components/domain/StatusBadge'
import { DriverAvatar } from '@/components/domain/DriverAvatar'
import { useTrips } from '@/hooks/useTrips'
import { formatTime, minutesBetween } from '@/lib/formatters'
import type { Trip } from '@/data/types'

const columns: ColumnDef<Trip>[] = [
  {
    id: 'trip', header: 'Viagem',
    cell: ({ row }) => (
      <div>
        <p className="text-sm font-mono font-medium text-gray-900">{row.original.code}</p>
        <p className="text-xs text-gray-500">{row.original.clientName}</p>
      </div>
    ),
  },
  {
    id: 'driver', header: 'Motorista',
    cell: ({ row }) => (
      <div className="flex items-center gap-2">
        <DriverAvatar name={row.original.driverName} size="sm" />
        <div>
          <p className="text-sm text-gray-900 truncate">{row.original.driverName}</p>
          <p className="text-xs text-gray-500 font-mono">{row.original.plate}</p>
        </div>
      </div>
    ),
  },
  { id: 'eta', header: 'ETA', cell: ({ row }) => <span className="text-sm tabular-nums">{formatTime(row.original.eta)}</span> },
  {
    id: 'window', header: 'Janela',
    cell: ({ row }) => <span className="text-xs tabular-nums text-gray-600">{formatTime(row.original.windowStart)}–{formatTime(row.original.windowEnd)}</span>,
  },
  {
    id: 'desvio', header: 'Desvio ETA',
    cell: ({ row }) => {
      const diff = minutesBetween(row.original.windowEnd, row.original.eta)
      const color = diff > 0 ? 'text-red-600' : diff > -10 ? 'text-orange-600' : 'text-gray-500'
      return <span className={`text-sm font-medium tabular-nums ${color}`}>{diff > 0 ? `+${diff}` : diff} min</span>
    },
  },
  { id: 'status', header: 'Status', cell: ({ row }) => <StatusBadge status={row.original.slaStatus} /> },
]

export function AtRiskTripsTable() {
  const { data: all } = useTrips({ status: 'in_progress' })
  const atRisk = all.filter(t => t.slaStatus === 'em_risco' || t.slaStatus === 'atrasado' || t.slaStatus === 'sem_sinal')

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-gray-900">Viagens em maior risco</h3>
        <span className="text-xs text-gray-500">{atRisk.length} viagens</span>
      </div>
      <DataTable data={atRisk} columns={columns} pageSize={10} emptyMessage="Nenhuma viagem em risco no momento." />
    </div>
  )
}
```

**3. Criar `torre-de-controle/src/app/pages/torre-de-controle/components/OperationalQueue.tsx`** — fila operacional priorizada com Assumir/Ligar:

```tsx
import { AlertItem } from '@/components/domain/AlertItem'
import { useAlerts } from '@/hooks/useAlerts'

export function OperationalQueue() {
  const { data: openAlerts } = useAlerts({ status: 'aberto' })
  const queue = [...openAlerts].sort((a, b) => {
    const sev = { critico: 0, medio: 1, baixo: 2 }
    return sev[a.severity] - sev[b.severity]
  })

  const handleAssume = (id: string) => console.log('assume', id)
  const handleCall = (id: string) => console.log('call', id)

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900">Fila operacional</h3>
        <span className="text-xs text-gray-500">{queue.length} pendentes</span>
      </div>
      <div className="space-y-2 max-h-[480px] overflow-y-auto">
        {queue.map(a => (
          <AlertItem
            key={a.id}
            variant="queue"
            onAssume={handleAssume}
            onCall={handleCall}
            alert={{
              id: a.id, severity: a.severity, title: a.title, subtitle: a.tripCode,
              driverName: a.driverName, driverPhoto: a.driverPhoto, plate: a.plate,
              clientName: a.clientName, occurredAt: a.occurredAt, delayMinutes: a.delayMinutes,
            }}
          />
        ))}
        {queue.length === 0 && (
          <p className="text-sm text-gray-500 text-center py-6">Fila vazia.</p>
        )}
      </div>
    </div>
  )
}
```

**4. Criar `torre-de-controle/src/app/pages/torre-de-controle/components/OperatorsQueue.tsx`** — lista mock de operadores disponíveis (estática nesta fase):

```tsx
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'

interface Operator {
  id: string
  name: string
  status: 'available' | 'busy' | 'offline'
  activeAlerts: number
}

const operators: Operator[] = [
  { id: 'op-001', name: 'Ana Silva',         status: 'busy',      activeAlerts: 3 },
  { id: 'op-002', name: 'Bruno Reis',        status: 'busy',      activeAlerts: 2 },
  { id: 'op-003', name: 'Carla Mendes',      status: 'available', activeAlerts: 0 },
  { id: 'op-004', name: 'Diego Tavares',     status: 'available', activeAlerts: 0 },
  { id: 'op-005', name: 'Eduarda Pinto',     status: 'offline',   activeAlerts: 0 },
]

const dotMap = {
  available: 'bg-[#2ecc71]',
  busy:      'bg-[#f39c12]',
  offline:   'bg-[#95a5a6]',
} as const

const labelMap = {
  available: 'Disponível',
  busy:      'Em atendimento',
  offline:   'Offline',
} as const

export function OperatorsQueue() {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
      <h3 className="text-sm font-semibold text-gray-900">Fila de operadores</h3>
      <ul className="space-y-2">
        {operators.map(op => {
          const initials = op.name.split(' ').slice(0, 2).map(n => n[0]).join('')
          return (
            <li key={op.id} className="flex items-center gap-3 py-1.5">
              <div className="relative">
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="bg-gray-200 text-gray-700 text-xs">{initials}</AvatarFallback>
                </Avatar>
                <span className={cn('absolute bottom-0 right-0 h-2 w-2 rounded-full border-2 border-white', dotMap[op.status])} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-900 truncate">{op.name}</p>
                <p className="text-xs text-gray-500">{labelMap[op.status]}</p>
              </div>
              {op.activeAlerts > 0 && (
                <span className="text-[10px] font-bold bg-[#0f62fe] text-white rounded-full px-2 py-0.5">
                  {op.activeAlerts}
                </span>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
```

**5. Sobrescrever `torre-de-controle/src/app/pages/torre-de-controle/TorreDeControlePage.tsx`:**

```tsx
import { TorreKPIRow } from './components/TorreKPIRow'
import { AtRiskTripsTable } from './components/AtRiskTripsTable'
import { OperationalQueue } from './components/OperationalQueue'
import { OperatorsQueue } from './components/OperatorsQueue'
import { MapPlaceholder } from '@/components/domain/MapPlaceholder'

export function TorreDeControlePage() {
  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-bold text-gray-900">Torre de Controle</h1>
        <p className="text-sm text-gray-500">Fila priorizada de incidentes e operação ativa</p>
      </header>

      <TorreKPIRow />

      <div className="grid grid-cols-1 lg:grid-cols-10 gap-5">
        <div className="lg:col-span-7 space-y-5">
          <MapPlaceholder height={420} />
          <AtRiskTripsTable />
        </div>
        <div className="lg:col-span-3 space-y-5">
          <OperationalQueue />
          <OperatorsQueue />
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
    - `torre-de-controle/src/app/pages/torre-de-controle/TorreDeControlePage.tsx` contém literalmente `TorreKPIRow`
    - `torre-de-controle/src/app/pages/torre-de-controle/TorreDeControlePage.tsx` contém literalmente `OperationalQueue`
    - `torre-de-controle/src/app/pages/torre-de-controle/TorreDeControlePage.tsx` contém literalmente `OperatorsQueue`
    - `torre-de-controle/src/app/pages/torre-de-controle/TorreDeControlePage.tsx` contém literalmente `AtRiskTripsTable`
    - `torre-de-controle/src/app/pages/torre-de-controle/TorreDeControlePage.tsx` contém literalmente `MapPlaceholder`
    - `torre-de-controle/src/app/pages/torre-de-controle/components/TorreKPIRow.tsx` contém literalmente `Viagens ativas`
    - `torre-de-controle/src/app/pages/torre-de-controle/components/TorreKPIRow.tsx` contém literalmente `Em risco`
    - `torre-de-controle/src/app/pages/torre-de-controle/components/TorreKPIRow.tsx` contém literalmente `Atrasos críticos`
    - `torre-de-controle/src/app/pages/torre-de-controle/components/TorreKPIRow.tsx` contém literalmente `Sem sinal`
    - `torre-de-controle/src/app/pages/torre-de-controle/components/TorreKPIRow.tsx` contém literalmente `Ocorrências`
    - `torre-de-controle/src/app/pages/torre-de-controle/components/AtRiskTripsTable.tsx` contém literalmente `Viagens em maior risco`
    - `torre-de-controle/src/app/pages/torre-de-controle/components/AtRiskTripsTable.tsx` contém literalmente `Desvio ETA`
    - `torre-de-controle/src/app/pages/torre-de-controle/components/OperationalQueue.tsx` contém literalmente `Fila operacional`
    - `torre-de-controle/src/app/pages/torre-de-controle/components/OperationalQueue.tsx` contém literalmente `variant="queue"`
    - `torre-de-controle/src/app/pages/torre-de-controle/components/OperatorsQueue.tsx` contém literalmente `Fila de operadores`
    - `npm run build` exit 0
  </acceptance_criteria>
  <done>Torre renderiza com 5 KPIs, mapa+tabela em risco, fila operacional com Assumir/Ligar, fila de operadores com status dot, build passa.</done>
</task>

</tasks>

<threat_model>

## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| user click → state change | Botões Assumir/Ligar disparam handlers |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-01-08 | Tampering | Botões de ação (Assumir/Ligar) | accept | Phase 1 apenas log no console; Phase 4 conecta a API real com auditoria |
| T-01-09 | Information Disclosure | OperationalQueue mostra placas/motoristas | accept | Mock data fictícia |

</threat_model>

<verification>
- `npm run build && npx tsc --noEmit` exit 0
- `npm run dev` → /dashboard mostra layout 70/30 com 5 KPIs e tabela populada (manual)
- /torre-de-controle mostra fila operacional com botões Assumir/Ligar funcionais (logam no console)
- Layout em 1366x768: sidebar + conteúdo sem overflow horizontal (verificar manualmente)
</verification>

<success_criteria>
- [ ] DashboardPage tem 5 KPI cards exatos do CONTEXT
- [ ] DashboardPage layout 70/30 com mapa+tabela / exceções+resumo
- [ ] TorreDeControlePage tem 5 KPI cards exatos
- [ ] TorreDeControlePage tem fila operacional com Assumir/Ligar
- [ ] TorreDeControlePage tem fila de operadores
- [ ] Tabelas populam com dados via hooks
- [ ] Build passa
</success_criteria>

<output>
Após completion, criar `.planning/phases/01-ui-shell-design-system/01-04-SUMMARY.md` listando: páginas implementadas, sub-componentes criados, hooks consumidos, build status.
</output>

## PLANNING COMPLETE
