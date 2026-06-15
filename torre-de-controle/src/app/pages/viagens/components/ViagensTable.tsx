import { type ColumnDef } from '@tanstack/react-table'
import { useState, useMemo, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Search, Filter, ArrowUpDown, MoreVertical } from 'lucide-react'
import { TableWithSidePanel } from '@/components/domain/TableWithSidePanel'
import { StatusBadge } from '@/components/domain/StatusBadge'
import { RiskBadge } from '@/components/domain/RiskBadge'
import { DriverAvatar } from '@/components/domain/DriverAvatar'
import { ProgressBar } from '@/components/domain/ProgressBar'
import { ExportButton } from '@/components/common/ExportButton'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useTrips, useTrip, useRouteOptions } from '@/hooks/useTrips'
import { useUIStore } from '@/stores/useUIStore'
import { type PrazoRange, prazoInRange } from '@/components/domain/PrazoFinalFilter'
import { formatDate } from '@/lib/formatters'

const fmtDT = (d?: Date | string | null) => (d ? formatDate(d, 'dd/MM/yyyy HH:mm:ss') : '—')
import { TripDetailPanel } from './TripDetailPanel'
import { CARGAS_STATUS_OPTIONS, cargasStatusLabel, cargasStatusMatches } from '@/data/cargasStatus'
import type { Trip, TripFilters, TripStatus, Priority, SlaStatus } from '@/data/types'

const priorityDot = { alta: 'bg-[#f5365c]', media: 'bg-[#fb6340]', baixa: 'bg-[#2dce89]' } as const

const fmtKm = (km?: number) => (km != null && km > 0 ? `${km.toFixed(2).replace('.', ',')} Km` : '—')
function atrasoClass(h?: number | null) {
  if (h == null) return 'text-muted-foreground'
  return h > 0.0167 ? 'text-[#f5365c]' : h < -0.0167 ? 'text-[#2dce89]' : 'text-muted-foreground'
}

// Fix B2 — trips do Cargas não têm routeCode; o filtro de rota casa por
// routeCode (painel) OU por "origem → destino" normalizado (sem acento).
const normRoute = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toUpperCase()
const tripMatchesRoute = (t: Trip, value: string) =>
  t.routeCode === value ||
  (!!t.origin && !!t.destination && normRoute(`${t.origin} → ${t.destination}`) === normRoute(value))

const columns: ColumnDef<Trip>[] = [
  {
    id: 'driver', header: 'Motorista',
    cell: ({ row }) => (
      <div className="flex items-center gap-2">
        <span className={`h-2 w-2 rounded-full shrink-0 ${priorityDot[row.original.priority]}`} />
        <DriverAvatar name={row.original.driverName} size="sm" />
        <div className="min-w-0">
          <p className="text-sm truncate text-foreground">{row.original.driverName}</p>
          <p className="text-xs text-muted-foreground font-mono">{row.original.code} · {row.original.plate}</p>
        </div>
      </div>
    ),
  },
  { accessorKey: 'clientName', header: 'Cliente', size: 120, cell: (i) => <span className="text-sm text-foreground truncate">{i.getValue<string>()}</span> },
  { id: 'kmTotal', header: 'Km Total', size: 90, cell: ({ row }) => <span className="text-xs tabular-nums text-foreground">{fmtKm(row.original.distanceTotal)}</span> },
  { id: 'kmFalta', header: 'Km que Falta', size: 95, cell: ({ row }) => <span className="text-xs tabular-nums text-foreground">{fmtKm(row.original.kmFalta ?? Math.max(0, row.original.distanceTotal - row.original.distanceDone))}</span> },
  {
    id: 'progress', header: 'Progresso', size: 110,
    cell: ({ row }) => (
      <div className="space-y-1 min-w-[80px]">
        <span className="text-xs text-muted-foreground tabular-nums">{row.original.progressPct}%</span>
        <ProgressBar value={row.original.progressPct} color="#0f62fe" height={4} />
      </div>
    ),
  },
  { id: 'prazo', header: 'Prazo Final', size: 145, cell: ({ row }) => <span className="text-xs tabular-nums text-foreground">{fmtDT(row.original.windowEnd)}</span> },
  { id: 'previsao', header: 'Previsão de Chegada', size: 145, cell: ({ row }) => <span className="text-xs tabular-nums text-foreground">{fmtDT(row.original.eta)}</span> },
  { id: 'status', header: 'Status', size: 100, cell: ({ row }) => <StatusBadge status={row.original.slaStatus} /> },
  {
    id: 'cargasStatus', header: 'Status operacional', size: 150,
    cell: ({ row }) => row.original.cargasStatus
      ? <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold bg-sky-500/15 text-sky-700 dark:text-sky-200">{cargasStatusLabel(row.original.cargasStatus)}</span>
      : <span className="text-xs text-muted-foreground">—</span>,
  },
  { id: 'atraso', header: 'Atraso', size: 80, cell: ({ row }) => <span className={`text-xs tabular-nums font-medium ${atrasoClass(row.original.adiantamentoHoras)}`}>{row.original.atrasoLabel || '—'}</span> },
  {
    id: 'conducao', header: 'Condução', size: 90,
    cell: ({ row }) => {
      const r = row.original.conducaoRegime ?? 'intensivo'
      return <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-semibold ${r === 'intensivo' ? 'bg-[#2dce89]/15 text-[#2dce89]' : 'bg-muted text-muted-foreground'}`}>{r === 'intensivo' ? 'Intensivo' : 'Regular'}</span>
    },
  },
  { id: 'meta', header: 'Meta KM/Dia', size: 110, cell: ({ row }) => <span className="text-xs tabular-nums text-foreground">{row.original.metaKmDia ?? '—'}</span> },
  {
    id: 'risk', header: 'Risco', size: 80,
    cell: ({ row }) => <RiskBadge level={row.original.riskLevel} score={row.original.riskScore} />,
  },
  {
    id: 'actions', header: '', size: 36,
    cell: () => (
      <button className="p-1 rounded hover:bg-accent text-muted-foreground" onClick={(e) => e.stopPropagation()}>
        <MoreVertical className="h-4 w-4" />
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

export function ViagensTable({ range }: { range: PrazoRange }) {
  const { activeTripsTab, setActiveTripsTab, selectedTripId, setSelectedTripId } = useUIStore()
  const [filters, setFilters] = useState<TripFilters>({})
  // Phase 12 — busca a base COMPLETA uma vez; filtra/pagina client-side.
  // Lista grande → refetch mais lento (30s); os detalhes/KPIs ao vivo ficam no dashboard (5s).
  const { data: allRaw } = useTrips({ limit: 20000 } as TripFilters & { limit: number }, { refetchMs: 30_000 })

  // Escopo por PRAZO FINAL (window_end), intervalo do filtro — réplica do checkVisibilityDate
  // do painel. Sem datas = tudo. Afeta a tabela + os contadores das abas.
  const all = useMemo(() => allRaw.filter((t) => prazoInRange(t.windowEnd, range)), [allRaw, range])

  // Deep-link do dashboard: /viagens?trip=<id> abre o detalhe da viagem direto.
  // Deep-link do Insights (D-05): /viagens?route=<valor> pré-seleciona o filtro de rota.
  const [searchParams] = useSearchParams()
  useEffect(() => {
    const t = searchParams.get('trip')
    if (t) setSelectedTripId(t)
    const r = searchParams.get('route')
    if (r) setFilters(f => ({ ...f, routeCode: r }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  const clients = Array.from(new Set(all.map(t => t.clientName).filter(Boolean))).sort()
  // Fix B2 — rotas: UNION Torre + Ranking + Cargas (não só os routeCode dos trips do painel)
  const { data: routeOptions } = useRouteOptions()
  // Fix B1 — status operacional: lista canônica fixa + append dos raw fora da canônica (ex.: 'NO SHOW')
  const cargasStatusOptions = useMemo(() => {
    const extras = Array.from(new Set(all.map(t => t.cargasStatus).filter((s): s is string => !!s)))
      .filter(s => !CARGAS_STATUS_OPTIONS.some(o => cargasStatusMatches(s, o.value)))
      .sort()
      .map(s => ({ value: s, label: s }))
    return [...CARGAS_STATUS_OPTIONS, ...extras]
  }, [all])

  const merged: TripFilters = { ...filters, status: tabToStatus[activeTripsTab] }
  const trips = useMemo(() => {
    const q = (filters.driverName ?? '').toLowerCase().trim()
    return all.filter(t => {
      if (merged.status && t.status !== merged.status) return false
      if (filters.clientName && t.clientName !== filters.clientName) return false
      if (filters.routeCode && !tripMatchesRoute(t, filters.routeCode)) return false
      if (filters.priority && t.priority !== filters.priority) return false
      if (filters.slaStatus && t.slaStatus !== filters.slaStatus) return false
      // Fix B1 — matching tolerante a mojibake ('CTE EM EMISS?O' casa com 'CTE EM EMISSÃO')
      if (filters.cargasStatus && !(t.cargasStatus && cargasStatusMatches(t.cargasStatus, filters.cargasStatus))) return false
      if (q && !`${t.driverName} ${t.code} ${t.clientName}`.toLowerCase().includes(q)) return false
      return true
    })
  }, [all, merged.status, filters.clientName, filters.routeCode, filters.priority, filters.slaStatus, filters.cargasStatus, filters.driverName])
  const { data: selected } = useTrip(selectedTripId)

  const set = <K extends keyof TripFilters>(key: K, value: TripFilters[K] | undefined) =>
    setFilters(f => ({ ...f, [key]: value }))

  const toolbar = (
    <div className="flex items-center gap-3">
      <div className="relative w-56 shrink-0">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar motorista, código ou cliente..."
          value={filters.driverName ?? ''}
          onChange={(e) => set('driverName', e.target.value || undefined)}
          className="pl-9 h-9 text-sm"
        />
      </div>

      <Select value={activeTripsTab} onValueChange={(v) => setActiveTripsTab(v as typeof activeTripsTab)}>
        <SelectTrigger className="h-9 w-[170px] text-xs"><SelectValue placeholder="Status" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="todas">Todas ({all.length})</SelectItem>
          <SelectItem value="em_andamento">Em andamento ({all.filter(t => t.status === 'in_progress').length})</SelectItem>
          <SelectItem value="planejadas">Planejadas ({all.filter(t => t.status === 'planned').length})</SelectItem>
          <SelectItem value="concluidas">Concluídas ({all.filter(t => t.status === 'completed').length})</SelectItem>
          <SelectItem value="atrasadas">Atrasadas ({all.filter(t => t.status === 'delayed').length})</SelectItem>
        </SelectContent>
      </Select>

      <Select value={filters.clientName ?? '__all'} onValueChange={(v) => set('clientName', v === '__all' ? undefined : v)}>
        <SelectTrigger className="h-9 w-[150px] text-xs"><SelectValue placeholder="Cliente" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="__all">Todos clientes</SelectItem>
          {clients.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
        </SelectContent>
      </Select>

      <Select value={filters.routeCode ?? '__all'} onValueChange={(v) => set('routeCode', v === '__all' ? undefined : v)}>
        <SelectTrigger className="h-9 w-[140px] text-xs"><SelectValue placeholder="Rota" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="__all">Todas rotas</SelectItem>
          {routeOptions.map(o => <SelectItem key={`${o.source}:${o.value}`} value={o.value}>{o.label}</SelectItem>)}
        </SelectContent>
      </Select>

      <Select value={filters.priority ?? '__all'} onValueChange={(v) => set('priority', v === '__all' ? undefined : v as Priority)}>
        <SelectTrigger className="h-9 w-[140px] text-xs"><SelectValue placeholder="Prioridade" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="__all">Todas</SelectItem>
          <SelectItem value="alta">Alta</SelectItem>
          <SelectItem value="media">Média</SelectItem>
          <SelectItem value="baixa">Baixa</SelectItem>
        </SelectContent>
      </Select>

      <Select value={filters.slaStatus ?? '__all'} onValueChange={(v) => set('slaStatus', v === '__all' ? undefined : v as SlaStatus)}>
        <SelectTrigger className="h-9 w-[140px] text-xs"><SelectValue placeholder="SLA" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="__all">Todos SLA</SelectItem>
          <SelectItem value="no_prazo">No prazo</SelectItem>
          <SelectItem value="em_risco">Em risco</SelectItem>
          <SelectItem value="atrasado">Atrasado</SelectItem>
          <SelectItem value="sem_sinal">Sem sinal</SelectItem>
        </SelectContent>
      </Select>

      {/* Phase 14 / Fix B1 — status operacional do Cargas (sheet_status): lista canônica fixa, sempre visível */}
      <Select value={filters.cargasStatus ?? '__all'} onValueChange={(v) => set('cargasStatus', v === '__all' ? undefined : v)}>
        <SelectTrigger className="h-9 w-[180px] text-xs"><SelectValue placeholder="Status operacional" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="__all">Todas</SelectItem>
          {cargasStatusOptions.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
        </SelectContent>
      </Select>

      <Button variant="outline" size="sm" className="h-9 gap-2 text-xs"><ArrowUpDown className="h-3.5 w-3.5" /> Ordenar</Button>
      <Button variant="outline" size="sm" className="h-9 gap-2 text-xs"><Filter className="h-3.5 w-3.5" /> Filtros</Button>
      <ExportButton entity="viagens" filters={merged} className="h-9 gap-2 text-xs" />
    </div>
  )

  return (
    <TableWithSidePanel
      data={trips}
      columns={columns}
      selectedItem={selected}
      onSelect={(t) => setSelectedTripId(t?.id ?? null)}
      renderPanel={(trip) => <TripDetailPanel trip={trip} onClose={() => setSelectedTripId(null)} />}
      panelWidth={420}
      toolbar={toolbar}
    />
  )
}
