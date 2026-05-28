---
phase: 01-ui-shell-design-system
plan: 06
type: execute
wave: 2
depends_on: [01, 02, 03]
files_modified:
  - torre-de-controle/src/app/pages/alertas/AlertasPage.tsx
  - torre-de-controle/src/app/pages/alertas/components/AlertasKPIRow.tsx
  - torre-de-controle/src/app/pages/alertas/components/AlertasFiltersBar.tsx
  - torre-de-controle/src/app/pages/alertas/components/AlertGroupedList.tsx
  - torre-de-controle/src/app/pages/alertas/components/AlertDetailPanel.tsx
  - torre-de-controle/src/app/pages/alertas/components/SLAGauge.tsx
  - torre-de-controle/src/app/pages/geofences/GeofencesPage.tsx
  - torre-de-controle/src/app/pages/insights/InsightsPage.tsx
  - torre-de-controle/src/app/pages/configuracoes/ConfiguracoesPage.tsx
autonomous: true
requirements:
  - PHASE1-PAGE-ALERTAS
  - PHASE1-PAGES-STUB
tags:
  - frontend
  - pages
  - alertas
  - stubs

must_haves:
  truths:
    - "Página /alertas tem 4 KPIs (Críticos, Abertos, Resolvidos hoje, SLA tratativas com gauge)"
    - "Página /alertas tem barra de filtros (Tipo, Cliente, Rota, Responsável, Período)"
    - "Página /alertas tem 3 grupos colapsáveis (Críticos, Médios, Baixos) com contagem"
    - "Selecionar alerta abre AlertDetailPanel com 5 ações (Assumir, Registrar tratativa, Ligar, Escalar, Resolver)"
    - "Páginas /geofences, /insights, /configuracoes existem como stubs com header + mensagem 'Disponível em Phase X'"
  artifacts:
    - path: "torre-de-controle/src/app/pages/alertas/AlertasPage.tsx"
      provides: "Página Alertas completa"
      contains: "AlertGroupedList"
    - path: "torre-de-controle/src/app/pages/alertas/components/AlertDetailPanel.tsx"
      provides: "Painel lateral com 5 ações"
      contains: "Registrar tratativa"
    - path: "torre-de-controle/src/app/pages/alertas/components/SLAGauge.tsx"
      provides: "Gauge circular SVG para SLA"
      contains: "circle"
    - path: "torre-de-controle/src/app/pages/geofences/GeofencesPage.tsx"
      provides: "Stub Geofences"
      contains: "Phase 5"
    - path: "torre-de-controle/src/app/pages/insights/InsightsPage.tsx"
      provides: "Stub Insights"
      contains: "Phase 6"
    - path: "torre-de-controle/src/app/pages/configuracoes/ConfiguracoesPage.tsx"
      provides: "Stub Configurações"
      contains: "Phase 6"
  key_links:
    - from: "torre-de-controle/src/app/pages/alertas/AlertasPage.tsx"
      to: "torre-de-controle/src/hooks/useAlerts.ts"
      via: "useAlertsBySeverity"
      pattern: "useAlertsBySeverity"
    - from: "torre-de-controle/src/app/pages/alertas/components/AlertDetailPanel.tsx"
      to: "torre-de-controle/src/data/types.ts"
      via: "Alert type"
      pattern: "import type.*Alert"
---

<objective>
Implementar Alertas (página principal mais complexa com lista agrupada por severidade + side panel de ações) e os 3 stubs (Geofences, Insights, Configurações). Substitui stubs criados em PLAN-02.

Purpose: Alertas é o coração operacional do Phase 4 (alert engine) — design fiel agora evita retrabalho. Stubs sinalizam ao usuário que as páginas existem e indicam phase em que serão implementadas.
Output: 1 página completa (Alertas) + 6 sub-componentes + 3 stubs explicativos.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/01-ui-shell-design-system/01-CONTEXT.md
@.planning/phases/01-ui-shell-design-system/01-RESEARCH.md
@.planning/ROADMAP.md
</context>

<interfaces>
```typescript
// PLAN-02
import { KPICard, SeverityBadge, AlertItem, SidePanelLayout, DriverAvatar } from '@/components/domain/*'

// PLAN-03
import { useAlerts, useAlert, useAlertsBySeverity } from '@/hooks/useAlerts'
import { useAlertasKPIs } from '@/hooks/useDashboardKPIs'
import type { Alert, AlertFilters, AlertSeverity, AlertStatus, AlertType } from '@/data/types'

import { useUIStore } from '@/stores/useUIStore'
// → selectedAlertId, setSelectedAlertId
```
</interfaces>

<tasks>

<task type="auto">
  <name>Task 1: AlertasPage — KPIs + filtros + 3 grupos colapsáveis + painel de ações</name>
  <files>torre-de-controle/src/app/pages/alertas/AlertasPage.tsx, torre-de-controle/src/app/pages/alertas/components/AlertasKPIRow.tsx, torre-de-controle/src/app/pages/alertas/components/SLAGauge.tsx, torre-de-controle/src/app/pages/alertas/components/AlertasFiltersBar.tsx, torre-de-controle/src/app/pages/alertas/components/AlertGroupedList.tsx, torre-de-controle/src/app/pages/alertas/components/AlertDetailPanel.tsx</files>
  <read_first>
    - .planning/phases/01-ui-shell-design-system/01-CONTEXT.md (seção "Página Alertas — Layout" — KPIs incluindo gauge, filtros exatos, lista agrupada, painel com 5 ações específicas)
    - torre-de-controle/src/components/domain/AlertItem.tsx
    - torre-de-controle/src/components/domain/SeverityBadge.tsx
    - torre-de-controle/src/components/domain/SidePanelLayout.tsx
    - torre-de-controle/src/components/domain/DriverAvatar.tsx
    - torre-de-controle/src/components/ui/select.tsx
    - torre-de-controle/src/hooks/useAlerts.ts
    - torre-de-controle/src/data/types.ts (AlertType — para filtros)
    - torre-de-controle/src/lib/formatters.ts
  </read_first>
  <action>
**1. Criar `torre-de-controle/src/app/pages/alertas/components/SLAGauge.tsx`** — gauge circular SVG (sem libs externas):

```tsx
interface Props {
  value: number   // 0-100
  size?: number   // px
  stroke?: number
  color?: string
}

export function SLAGauge({ value, size = 64, stroke = 6, color = '#0f62fe' }: Props) {
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const pct = Math.max(0, Math.min(100, value))
  const offset = circumference - (pct / 100) * circumference

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} stroke="#e5e7eb" strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          stroke={color} strokeWidth={stroke} fill="none"
          strokeDasharray={circumference} strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 400ms ease' }}
        />
      </svg>
      <span className="absolute text-xs font-bold text-gray-900 tabular-nums">{Math.round(pct)}%</span>
    </div>
  )
}
```

**2. Criar `torre-de-controle/src/app/pages/alertas/components/AlertasKPIRow.tsx`** — 4 KPIs (Críticos, Abertos, Resolvidos hoje, SLA tratativas com gauge):

```tsx
import { KPICard } from '@/components/domain/KPICard'
import { useAlertasKPIs } from '@/hooks/useDashboardKPIs'
import { SLAGauge } from './SLAGauge'

export function AlertasKPIRow() {
  const { data: k } = useAlertasKPIs()
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <KPICard title="Críticos"        value={k.criticos.count}       color="red"   />
      <KPICard title="Abertos"          value={k.abertos.count}        color="orange"/>
      <KPICard title="Resolvidos hoje"  value={k.resolvidosHoje.count} color="green" />

      <div className="bg-white rounded-lg shadow-sm p-4 flex items-center justify-between border border-gray-100">
        <div className="flex flex-col gap-1">
          <span className="text-xs text-gray-500 font-medium uppercase tracking-wide">SLA das tratativas</span>
          <span className="text-2xl font-bold text-gray-900 tabular-nums">{k.slaTratativas.pct}%</span>
          <span className="text-[10px] text-gray-400">Tempo médio dentro da meta</span>
        </div>
        <SLAGauge value={k.slaTratativas.pct} size={64} color="#0f62fe" />
      </div>
    </div>
  )
}
```

**3. Criar `torre-de-controle/src/app/pages/alertas/components/AlertasFiltersBar.tsx`** — filtros do CONTEXT (Tipo, Cliente, Rota, Responsável, Período):

```tsx
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { useAlerts } from '@/hooks/useAlerts'
import type { AlertFilters, AlertType } from '@/data/types'

const typeLabels: Record<AlertType, string> = {
  atraso_critico:          'Atraso crítico',
  desvio_nao_autorizado:   'Desvio não autorizado',
  parada_nao_planejada:    'Parada não planejada',
  sinal_gps_intermitente:  'Sinal GPS intermitente',
  tempo_parada_elevado:    'Tempo de parada elevado',
  entrega_fora_janela:     'Entrega fora da janela',
  checklist_incompleto:    'Checklist incompleto',
}

interface Props {
  filters: AlertFilters
  onChange: (next: AlertFilters) => void
}

export function AlertasFiltersBar({ filters, onChange }: Props) {
  const { data: all } = useAlerts()
  const clients = Array.from(new Set(all.map(a => a.clientName))).sort()
  const routes = Array.from(new Set(all.map(a => a.routeCode))).sort()
  const assignees = Array.from(new Set(all.map(a => a.assignedTo).filter((x): x is string => Boolean(x)))).sort()

  const set = <K extends keyof AlertFilters>(key: K, value: AlertFilters[K] | undefined) =>
    onChange({ ...filters, [key]: value })

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
      <Filter label="Tipo de alerta">
        <Select value={filters.type ?? '__all'} onValueChange={(v) => set('type', v === '__all' ? undefined : v as AlertType)}>
          <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Todos" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all">Todos</SelectItem>
            {(Object.keys(typeLabels) as AlertType[]).map(t => <SelectItem key={t} value={t}>{typeLabels[t]}</SelectItem>)}
          </SelectContent>
        </Select>
      </Filter>

      <Filter label="Cliente">
        <Select value={filters.clientName ?? '__all'} onValueChange={(v) => set('clientName', v === '__all' ? undefined : v)}>
          <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Todos" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all">Todos</SelectItem>
            {clients.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
      </Filter>

      <Filter label="Rota">
        <Select value={filters.routeCode ?? '__all'} onValueChange={(v) => set('routeCode', v === '__all' ? undefined : v)}>
          <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Todas" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all">Todas</SelectItem>
            {routes.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
          </SelectContent>
        </Select>
      </Filter>

      <Filter label="Responsável">
        <Select value={filters.assignedTo ?? '__all'} onValueChange={(v) => set('assignedTo', v === '__all' ? undefined : v)}>
          <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Todos" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all">Todos</SelectItem>
            <SelectItem value="__unassigned">Não atribuído</SelectItem>
            {assignees.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
          </SelectContent>
        </Select>
      </Filter>

      <Filter label="Período">
        <Select value={filters.period ?? 'today'} onValueChange={(v) => set('period', v as AlertFilters['period'])}>
          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="today">Hoje</SelectItem>
            <SelectItem value="7d">Últimos 7 dias</SelectItem>
            <SelectItem value="30d">Últimos 30 dias</SelectItem>
          </SelectContent>
        </Select>
      </Filter>
    </div>
  )
}

function Filter({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-[10px] uppercase tracking-wide text-gray-500">{label}</Label>
      {children}
    </div>
  )
}
```

**4. Criar `torre-de-controle/src/app/pages/alertas/components/AlertGroupedList.tsx`** — lista colapsável por severidade:

```tsx
import { useState } from 'react'
import { ChevronDown, ChevronRight, AlertCircle, AlertTriangle, Info } from 'lucide-react'
import { AlertItem } from '@/components/domain/AlertItem'
import { useUIStore } from '@/stores/useUIStore'
import { cn } from '@/lib/utils'
import type { Alert, AlertSeverity } from '@/data/types'

const groupConfig: Record<AlertSeverity, { label: string; Icon: typeof AlertCircle; color: string }> = {
  critico: { label: 'Críticos', Icon: AlertCircle,    color: 'text-red-600' },
  medio:   { label: 'Médios',   Icon: AlertTriangle,  color: 'text-yellow-600' },
  baixo:   { label: 'Baixos',   Icon: Info,           color: 'text-green-600' },
}

interface Props {
  alerts: Alert[]
}

export function AlertGroupedList({ alerts }: Props) {
  const { selectedAlertId, setSelectedAlertId } = useUIStore()
  const [open, setOpen] = useState<Record<AlertSeverity, boolean>>({ critico: true, medio: true, baixo: false })

  const groups: Record<AlertSeverity, Alert[]> = {
    critico: alerts.filter(a => a.severity === 'critico'),
    medio:   alerts.filter(a => a.severity === 'medio'),
    baixo:   alerts.filter(a => a.severity === 'baixo'),
  }

  return (
    <div className="space-y-3">
      {(['critico', 'medio', 'baixo'] as const).map(sev => {
        const cfg = groupConfig[sev]
        const list = groups[sev]
        const isOpen = open[sev]
        const Chev = isOpen ? ChevronDown : ChevronRight

        return (
          <div key={sev} className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <button
              onClick={() => setOpen({ ...open, [sev]: !isOpen })}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50"
            >
              <div className="flex items-center gap-2">
                <Chev className="h-4 w-4 text-gray-500" />
                <cfg.Icon className={cn('h-5 w-5', cfg.color)} />
                <span className="text-sm font-semibold text-gray-900">{cfg.label}</span>
                <span className="text-xs text-gray-500">({list.length})</span>
              </div>
            </button>

            {isOpen && (
              <div className="px-3 pb-3 space-y-2 border-t border-gray-100 pt-2">
                {list.length === 0 ? (
                  <p className="text-sm text-gray-500 text-center py-4">Nenhum alerta neste grupo.</p>
                ) : (
                  list.map(a => (
                    <AlertItem
                      key={a.id}
                      variant="list"
                      onClick={(id) => setSelectedAlertId(id)}
                      selected={selectedAlertId === a.id}
                      alert={{
                        id: a.id, severity: a.severity, title: a.title, subtitle: a.tripCode,
                        driverName: a.driverName, driverPhoto: a.driverPhoto, plate: a.plate,
                        clientName: a.clientName, occurredAt: a.occurredAt, delayMinutes: a.delayMinutes,
                      }}
                    />
                  ))
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
```

**5. Criar `torre-de-controle/src/app/pages/alertas/components/AlertDetailPanel.tsx`** — painel com **5 ações exatas** do CONTEXT (Assumir, Registrar tratativa, Ligar para motorista, Escalar, Resolver):

```tsx
import { Hand, FileEdit, Phone, ArrowUpCircle, CheckCircle2 } from 'lucide-react'
import { SidePanelLayout } from '@/components/domain/SidePanelLayout'
import { SeverityBadge } from '@/components/domain/SeverityBadge'
import { DriverAvatar } from '@/components/domain/DriverAvatar'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { formatDate, formatRelative } from '@/lib/formatters'
import type { Alert } from '@/data/types'

interface Props {
  alert: Alert
  onClose: () => void
}

export function AlertDetailPanel({ alert, onClose }: Props) {
  const handle = (action: string) => () => console.log(`[alert ${alert.id}] ${action}`)

  return (
    <SidePanelLayout
      title={alert.title}
      subtitle={`Alerta #${alert.id.toUpperCase()} · ${alert.tripCode}`}
      onClose={onClose}
      footer={
        <div className="flex flex-col gap-2">
          <Button size="sm" className="w-full bg-[#0f62fe] hover:bg-[#0353d9] text-xs gap-2" onClick={handle('assumir')}>
            <Hand className="h-3.5 w-3.5" /> Assumir alerta
          </Button>
          <div className="grid grid-cols-2 gap-2">
            <Button size="sm" variant="outline" className="text-xs gap-1.5" onClick={handle('registrar_tratativa')}>
              <FileEdit className="h-3.5 w-3.5" /> Registrar tratativa
            </Button>
            <Button size="sm" variant="outline" className="text-xs gap-1.5" onClick={handle('ligar')}>
              <Phone className="h-3.5 w-3.5" /> Ligar para motorista
            </Button>
            <Button size="sm" variant="outline" className="text-xs gap-1.5" onClick={handle('escalar')}>
              <ArrowUpCircle className="h-3.5 w-3.5" /> Escalar alerta
            </Button>
            <Button size="sm" variant="outline" className="text-xs gap-1.5 text-green-700 border-green-300 hover:bg-green-50" onClick={handle('resolver')}>
              <CheckCircle2 className="h-3.5 w-3.5" /> Marcar como resolvido
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="flex items-center gap-2 flex-wrap">
          <SeverityBadge severity={alert.severity} size="md" />
          <span className="inline-flex items-center rounded-full bg-gray-100 text-gray-700 px-2 py-0.5 text-xs font-medium capitalize">
            {alert.status.replace('_', ' ')}
          </span>
          <span className="inline-flex items-center rounded-full bg-blue-50 text-blue-700 px-2 py-0.5 text-xs font-medium">
            {alert.source}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3 text-xs">
          <Field label="Abertura" value={formatDate(alert.occurredAt, 'dd/MM HH:mm')} />
          <Field label="Tempo em andamento" value={formatRelative(alert.occurredAt)} />
          <Field label="Origem do alerta" value={alert.source} />
          <Field label="Prioridade" value={alert.severity} capitalize />
        </div>

        <Separator />

        <div>
          <h4 className="text-xs font-semibold text-gray-900 mb-2 uppercase tracking-wide">Detalhes</h4>
          <div className="space-y-2 text-xs text-gray-700">
            <Row label="Entrega/Rota" value={`${alert.tripCode} · ${alert.routeCode}`} />
            <Row label="Cliente"       value={alert.clientName} />
            {alert.delayMinutes !== undefined && <Row label="Desvio ETA" value={`+${alert.delayMinutes} min`} highlight="text-red-600" />}
            {alert.deviationKm !== undefined  && <Row label="Desvio rota" value={`${alert.deviationKm.toFixed(1)} km`} highlight="text-orange-600" />}
            {alert.lat && alert.lng && <Row label="Local" value={`${alert.lat.toFixed(4)}, ${alert.lng.toFixed(4)}`} mono />}
            <Row label="Descrição" value={alert.description} />
          </div>
        </div>

        <Separator />

        <div>
          <h4 className="text-xs font-semibold text-gray-900 mb-2 uppercase tracking-wide">Motorista</h4>
          <div className="flex items-center gap-3">
            <DriverAvatar name={alert.driverName} photoUrl={alert.driverPhoto} size="md" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-900">{alert.driverName}</p>
              <p className="text-xs text-gray-500 font-mono">{alert.plate}</p>
            </div>
          </div>
        </div>

        {alert.slaDeadline && (
          <>
            <Separator />
            <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-yellow-700">Prazo SLA da tratativa</p>
              <p className="text-sm text-yellow-900 mt-0.5">{formatDate(alert.slaDeadline, 'dd/MM HH:mm')} ({formatRelative(alert.slaDeadline)})</p>
            </div>
          </>
        )}
      </div>
    </SidePanelLayout>
  )
}

function Field({ label, value, capitalize }: { label: string; value: string; capitalize?: boolean }) {
  return (
    <div>
      <p className="text-[10px] text-gray-500 uppercase tracking-wide">{label}</p>
      <p className={`text-sm font-medium text-gray-900 ${capitalize ? 'capitalize' : ''}`}>{value}</p>
    </div>
  )
}

function Row({ label, value, highlight, mono }: { label: string; value: string; highlight?: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-gray-500 shrink-0">{label}</span>
      <span className={`text-right ${highlight ?? 'text-gray-900'} ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  )
}
```

**6. Sobrescrever `torre-de-controle/src/app/pages/alertas/AlertasPage.tsx`:**

```tsx
import { useState } from 'react'
import { AlertasKPIRow } from './components/AlertasKPIRow'
import { AlertasFiltersBar } from './components/AlertasFiltersBar'
import { AlertGroupedList } from './components/AlertGroupedList'
import { AlertDetailPanel } from './components/AlertDetailPanel'
import { useAlerts, useAlert } from '@/hooks/useAlerts'
import { useUIStore } from '@/stores/useUIStore'
import type { AlertFilters } from '@/data/types'

export function AlertasPage() {
  const [filters, setFilters] = useState<AlertFilters>({ period: 'today' })
  const { data: alerts } = useAlerts(filters)
  const { selectedAlertId, setSelectedAlertId } = useUIStore()
  const { data: selected } = useAlert(selectedAlertId)
  const isOpen = selected !== null

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-bold text-gray-900">Alertas</h1>
        <p className="text-sm text-gray-500">Lista priorizada e tratativas</p>
      </header>

      <AlertasKPIRow />

      <AlertasFiltersBar filters={filters} onChange={setFilters} />

      <div
        className="grid transition-all duration-300 ease-in-out"
        style={{
          gridTemplateColumns: isOpen ? '1fr 440px' : '1fr 0px',
          gap: isOpen ? '20px' : '0px',
        }}
      >
        <div className="overflow-hidden min-w-0">
          <AlertGroupedList alerts={alerts} />
        </div>

        <div className="overflow-hidden transition-all duration-300" style={{ width: isOpen ? '440px' : '0px' }}>
          {selected && <AlertDetailPanel alert={selected} onClose={() => setSelectedAlertId(null)} />}
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
    - `torre-de-controle/src/app/pages/alertas/AlertasPage.tsx` contém literalmente `AlertasKPIRow`
    - `torre-de-controle/src/app/pages/alertas/AlertasPage.tsx` contém literalmente `AlertasFiltersBar`
    - `torre-de-controle/src/app/pages/alertas/AlertasPage.tsx` contém literalmente `AlertGroupedList`
    - `torre-de-controle/src/app/pages/alertas/AlertasPage.tsx` contém literalmente `AlertDetailPanel`
    - `torre-de-controle/src/app/pages/alertas/AlertasPage.tsx` contém literalmente `gridTemplateColumns`
    - `torre-de-controle/src/app/pages/alertas/components/AlertasKPIRow.tsx` contém literalmente `Críticos`
    - `torre-de-controle/src/app/pages/alertas/components/AlertasKPIRow.tsx` contém literalmente `Abertos`
    - `torre-de-controle/src/app/pages/alertas/components/AlertasKPIRow.tsx` contém literalmente `Resolvidos hoje`
    - `torre-de-controle/src/app/pages/alertas/components/AlertasKPIRow.tsx` contém literalmente `SLA das tratativas`
    - `torre-de-controle/src/app/pages/alertas/components/AlertasKPIRow.tsx` contém literalmente `SLAGauge`
    - `torre-de-controle/src/app/pages/alertas/components/SLAGauge.tsx` contém literalmente `<circle`
    - `torre-de-controle/src/app/pages/alertas/components/SLAGauge.tsx` contém literalmente `strokeDasharray`
    - `torre-de-controle/src/app/pages/alertas/components/AlertasFiltersBar.tsx` contém literalmente `Tipo de alerta`
    - `torre-de-controle/src/app/pages/alertas/components/AlertasFiltersBar.tsx` contém literalmente `Cliente`
    - `torre-de-controle/src/app/pages/alertas/components/AlertasFiltersBar.tsx` contém literalmente `Rota`
    - `torre-de-controle/src/app/pages/alertas/components/AlertasFiltersBar.tsx` contém literalmente `Responsável`
    - `torre-de-controle/src/app/pages/alertas/components/AlertasFiltersBar.tsx` contém literalmente `Período`
    - `torre-de-controle/src/app/pages/alertas/components/AlertGroupedList.tsx` contém literalmente `Críticos`
    - `torre-de-controle/src/app/pages/alertas/components/AlertGroupedList.tsx` contém literalmente `Médios`
    - `torre-de-controle/src/app/pages/alertas/components/AlertGroupedList.tsx` contém literalmente `Baixos`
    - `torre-de-controle/src/app/pages/alertas/components/AlertDetailPanel.tsx` contém literalmente `Assumir alerta`
    - `torre-de-controle/src/app/pages/alertas/components/AlertDetailPanel.tsx` contém literalmente `Registrar tratativa`
    - `torre-de-controle/src/app/pages/alertas/components/AlertDetailPanel.tsx` contém literalmente `Ligar para motorista`
    - `torre-de-controle/src/app/pages/alertas/components/AlertDetailPanel.tsx` contém literalmente `Escalar alerta`
    - `torre-de-controle/src/app/pages/alertas/components/AlertDetailPanel.tsx` contém literalmente `Marcar como resolvido`
    - `npm run build` exit 0
  </acceptance_criteria>
  <done>Alertas com 4 KPIs (incluindo gauge), 5 filtros, 3 grupos colapsáveis, painel com 5 ações exatas, build passa.</done>
</task>

<task type="auto">
  <name>Task 2: Páginas stub — Geofences (Phase 5), Insights (Phase 6), Configurações (Phase 6)</name>
  <files>torre-de-controle/src/app/pages/geofences/GeofencesPage.tsx, torre-de-controle/src/app/pages/insights/InsightsPage.tsx, torre-de-controle/src/app/pages/configuracoes/ConfiguracoesPage.tsx</files>
  <read_first>
    - .planning/ROADMAP.md (confirma: Geofences = Phase 5; Insights + Configurações = Phase 6)
    - .planning/PROJECT.md (módulos 5, 7 e 8 — features previstas)
    - torre-de-controle/src/components/ui/card.tsx (shadcn — para usar Card no stub)
  </read_first>
  <action>
**Princípio:** Stubs são autorelevantes — listam o que cada página vai conter quando implementada (extraído do PROJECT.md), com badge da phase prevista.

**1. Sobrescrever `torre-de-controle/src/app/pages/geofences/GeofencesPage.tsx`:**

```tsx
import { MapPin, Construction } from 'lucide-react'
import { Card } from '@/components/ui/card'

export function GeofencesPage() {
  return (
    <div className="space-y-5">
      <header className="flex items-start gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Geofences</h1>
          <p className="text-sm text-gray-500">Zonas geográficas, eventos de entrada/saída e alertas territoriais</p>
        </div>
        <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-blue-50 text-blue-700 px-3 py-1 text-xs font-medium">
          <Construction className="h-3.5 w-3.5" /> Disponível em Phase 5
        </span>
      </header>

      <Card className="p-8 text-center bg-white">
        <MapPin className="h-12 w-12 mx-auto text-blue-500 mb-3" />
        <h2 className="text-lg font-semibold text-gray-900 mb-2">Módulo Geofences</h2>
        <p className="text-sm text-gray-600 max-w-md mx-auto mb-4">
          A gestão de zonas geográficas (PostGIS) e eventos de entrada/saída será entregue na Phase 5.
        </p>
        <ul className="text-xs text-gray-500 space-y-1 max-w-sm mx-auto text-left list-disc list-inside">
          <li>Criar/editar zonas no mapa (polígono, círculo)</li>
          <li>Tipos: zona restrita, base, ponto de entrega, área de risco</li>
          <li>Histórico de entradas/saídas</li>
          <li>Alertas automáticos por geofence</li>
        </ul>
      </Card>
    </div>
  )
}
```

**2. Sobrescrever `torre-de-controle/src/app/pages/insights/InsightsPage.tsx`:**

```tsx
import { BarChart3, Construction } from 'lucide-react'
import { Card } from '@/components/ui/card'

export function InsightsPage() {
  return (
    <div className="space-y-5">
      <header className="flex items-start gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Insights</h1>
          <p className="text-sm text-gray-500">Analytics, tendências de SLA e ranking operacional</p>
        </div>
        <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-purple-50 text-purple-700 px-3 py-1 text-xs font-medium">
          <Construction className="h-3.5 w-3.5" /> Disponível em Phase 6
        </span>
      </header>

      <Card className="p-8 text-center bg-white">
        <BarChart3 className="h-12 w-12 mx-auto text-purple-500 mb-3" />
        <h2 className="text-lg font-semibold text-gray-900 mb-2">Módulo Insights</h2>
        <p className="text-sm text-gray-600 max-w-md mx-auto mb-4">
          Métricas históricas e exportações serão entregues na Phase 6 (Polish + Deploy).
        </p>
        <ul className="text-xs text-gray-500 space-y-1 max-w-sm mx-auto text-left list-disc list-inside">
          <li>Métricas históricas de performance</li>
          <li>Tendências de SLA</li>
          <li>Ranking de motoristas</li>
          <li>Análise de rotas problemáticas</li>
          <li>Exportação CSV</li>
        </ul>
      </Card>
    </div>
  )
}
```

**3. Sobrescrever `torre-de-controle/src/app/pages/configuracoes/ConfiguracoesPage.tsx`:**

```tsx
import { Settings, Construction } from 'lucide-react'
import { Card } from '@/components/ui/card'

export function ConfiguracoesPage() {
  return (
    <div className="space-y-5">
      <header className="flex items-start gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Configurações</h1>
          <p className="text-sm text-gray-500">Usuários, regras de alerta e integrações</p>
        </div>
        <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-gray-100 text-gray-700 px-3 py-1 text-xs font-medium">
          <Construction className="h-3.5 w-3.5" /> Disponível em Phase 6
        </span>
      </header>

      <Card className="p-8 text-center bg-white">
        <Settings className="h-12 w-12 mx-auto text-gray-500 mb-3" />
        <h2 className="text-lg font-semibold text-gray-900 mb-2">Módulo Configurações</h2>
        <p className="text-sm text-gray-600 max-w-md mx-auto mb-4">
          Administração do sistema será entregue progressivamente entre Phase 2 (auth) e Phase 6 (operações).
        </p>
        <ul className="text-xs text-gray-500 space-y-1 max-w-sm mx-auto text-left list-disc list-inside">
          <li>Usuários e perfis de acesso (Phase 2)</li>
          <li>Regras de alerta (thresholds configuráveis) (Phase 4)</li>
          <li>Geofences padrão (Phase 5)</li>
          <li>Integrações com GPS providers (Phase 6)</li>
        </ul>
      </Card>
    </div>
  )
}
```
  </action>
  <verify>
    <automated>cd torre-de-controle && npm run build && npx tsc --noEmit</automated>
  </verify>
  <acceptance_criteria>
    - `torre-de-controle/src/app/pages/geofences/GeofencesPage.tsx` contém literalmente `Phase 5`
    - `torre-de-controle/src/app/pages/geofences/GeofencesPage.tsx` contém literalmente `Geofences`
    - `torre-de-controle/src/app/pages/geofences/GeofencesPage.tsx` contém literalmente `polígono` ou `polígonos` (descrição feature)
    - `torre-de-controle/src/app/pages/insights/InsightsPage.tsx` contém literalmente `Phase 6`
    - `torre-de-controle/src/app/pages/insights/InsightsPage.tsx` contém literalmente `Insights`
    - `torre-de-controle/src/app/pages/insights/InsightsPage.tsx` contém literalmente `Tendências de SLA`
    - `torre-de-controle/src/app/pages/configuracoes/ConfiguracoesPage.tsx` contém literalmente `Configurações`
    - `torre-de-controle/src/app/pages/configuracoes/ConfiguracoesPage.tsx` contém literalmente `Phase 2` (usuários)
    - `torre-de-controle/src/app/pages/configuracoes/ConfiguracoesPage.tsx` contém literalmente `Regras de alerta`
    - `npm run build` exit 0
  </acceptance_criteria>
  <done>3 páginas stub com header, ícone, descrição da phase prevista e lista de features futuras, build passa.</done>
</task>

</tasks>

<threat_model>

## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| user click → ação alerta | Botões Assumir/Resolver/Escalar acionam handlers |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-01-12 | Tampering | Botões de ação no alerta | accept | Phase 1 apenas log; Phase 4 implementa auditoria via treatments table (ARCHITECTURE) |
| T-01-13 | Information Disclosure | Coordenadas lat/lng do alerta | accept | Mock data sem residências reais |

</threat_model>

<verification>
- `npm run build && npx tsc --noEmit` exit 0
- /alertas mostra 4 KPIs (incluindo gauge SLA), barra de filtros (5), 3 grupos colapsáveis com contagens corretas (manual)
- Selecionar alerta abre painel com SeverityBadge, status, source, todos campos e 5 botões de ação
- /geofences, /insights, /configuracoes mostram stub explicando phase prevista
- Layout em 1366x768: sem overflow horizontal em nenhuma página (verificar manualmente)
</verification>

<success_criteria>
- [ ] AlertasPage com 4 KPIs (Críticos/Abertos/Resolvidos hoje/SLA gauge)
- [ ] AlertasFiltersBar com 5 filtros (Tipo/Cliente/Rota/Responsável/Período)
- [ ] 3 grupos colapsáveis (Críticos/Médios/Baixos) com contagens
- [ ] AlertDetailPanel com 5 ações exatas (Assumir/Registrar tratativa/Ligar/Escalar/Resolver)
- [ ] SLAGauge SVG implementado sem libs externas
- [ ] 3 stubs (Geofences/Insights/Configurações) com badge de phase prevista e lista de features
- [ ] Build passa
</success_criteria>

<output>
Após completion, criar `.planning/phases/01-ui-shell-design-system/01-06-SUMMARY.md` listando: AlertasPage e sub-componentes, 5 ações implementadas, stubs criados, build status.
</output>

## PLANNING COMPLETE
