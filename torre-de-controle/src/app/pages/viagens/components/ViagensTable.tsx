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
