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

// Priority dots — semantic status colors, same in both themes
const priorityDot = { alta: 'bg-[#f5365c]', media: 'bg-[#fb6340]', baixa: 'bg-[#2dce89]' } as const

const columns: ColumnDef<Trip>[] = [
  { id: 'select', header: '', size: 40, cell: () => <Checkbox onClick={(e) => e.stopPropagation()} /> },
  {
    id: 'code', header: 'Código',
    cell: ({ row }) => (
      <div className="flex items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${priorityDot[row.original.priority]}`} />
        <span className="text-sm font-mono font-medium text-foreground">{row.original.code}</span>
      </div>
    ),
  },
  { accessorKey: 'clientName', header: 'Cliente', cell: (i) => <span className="text-sm text-foreground">{i.getValue<string>()}</span> },
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
  { accessorKey: 'origin',      header: 'Origem',  cell: (i) => <span className="text-xs text-muted-foreground truncate">{i.getValue<string>()}</span> },
  { accessorKey: 'destination', header: 'Destino', cell: (i) => <span className="text-xs text-muted-foreground truncate">{i.getValue<string>()}</span> },
  {
    id: 'window', header: 'Janela',
    cell: ({ row }) => <span className="text-xs tabular-nums text-muted-foreground">{formatTime(row.original.windowStart)}–{formatTime(row.original.windowEnd)}</span>,
  },
  { id: 'eta', header: 'ETA', cell: ({ row }) => <span className="text-sm tabular-nums text-foreground">{formatTime(row.original.eta)}</span> },
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
