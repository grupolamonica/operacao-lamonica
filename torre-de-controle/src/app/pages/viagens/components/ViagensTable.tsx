import { type ColumnDef } from '@tanstack/react-table'
import { useState } from 'react'
import { Search, Filter, ArrowUpDown, MoreVertical } from 'lucide-react'
import { TableWithSidePanel } from '@/components/domain/TableWithSidePanel'
import { StatusBadge } from '@/components/domain/StatusBadge'
import { DriverAvatar } from '@/components/domain/DriverAvatar'
import { ProgressBar } from '@/components/domain/ProgressBar'
import { ExportButton } from '@/components/common/ExportButton'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useTrips, useTrip } from '@/hooks/useTrips'
import { useUIStore } from '@/stores/useUIStore'
import { formatTime } from '@/lib/formatters'
import { TripDetailPanel } from './TripDetailPanel'
import type { Trip, TripFilters, TripStatus, Priority, SlaStatus } from '@/data/types'

const priorityDot = { alta: 'bg-[#f5365c]', media: 'bg-[#fb6340]', baixa: 'bg-[#2dce89]' } as const

const columns: ColumnDef<Trip>[] = [
  {
    id: 'code', header: 'Código',
    cell: ({ row }) => (
      <div className="flex items-center gap-2">
        <span className={`h-2 w-2 rounded-full shrink-0 ${priorityDot[row.original.priority]}`} />
        <span className="text-sm font-mono font-medium text-foreground">{row.original.code}</span>
      </div>
    ),
  },
  {
    id: 'driver', header: 'Motorista',
    cell: ({ row }) => (
      <div className="flex items-center gap-2">
        <DriverAvatar name={row.original.driverName} size="sm" />
        <div className="min-w-0">
          <p className="text-sm truncate text-foreground">{row.original.driverName}</p>
          <p className="text-xs text-muted-foreground font-mono">{row.original.plate}</p>
        </div>
      </div>
    ),
  },
  { accessorKey: 'clientName', header: 'Cliente', cell: (i) => <span className="text-sm text-foreground truncate">{i.getValue<string>()}</span> },
  { id: 'eta', header: 'ETA', size: 70, cell: ({ row }) => <span className="text-sm tabular-nums text-foreground">{formatTime(row.original.eta)}</span> },
  { id: 'status', header: 'Status', cell: ({ row }) => <StatusBadge status={row.original.slaStatus} /> },
  {
    id: 'progress', header: 'Progresso', size: 120,
    cell: ({ row }) => (
      <div className="space-y-1 min-w-[90px]">
        <span className="text-xs text-muted-foreground tabular-nums">{row.original.progressPct}%</span>
        <ProgressBar value={row.original.progressPct} color="#0f62fe" height={4} />
      </div>
    ),
  },
  {
    id: 'actions', header: '', size: 40,
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

export function ViagensTable() {
  const { activeTripsTab, setActiveTripsTab, selectedTripId, setSelectedTripId } = useUIStore()
  const [filters, setFilters] = useState<TripFilters>({})
  const { data: all } = useTrips()

  const clients    = Array.from(new Set(all.map(t => t.clientName))).sort()

  const routes     = Array.from(new Set(all.map(t => t.routeCode))).sort()

  const merged: TripFilters = { ...filters, status: tabToStatus[activeTripsTab] }
  const { data: trips } = useTrips(merged)
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
          {routes.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
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
