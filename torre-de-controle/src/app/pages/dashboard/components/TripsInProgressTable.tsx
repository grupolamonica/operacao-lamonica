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
  {
    accessorKey: 'clientName', header: 'Cliente',
    cell: (info) => <span className="text-sm text-gray-700">{info.getValue<string>()}</span>,
  },
  {
    accessorKey: 'destination', header: 'Entrega',
    cell: (info) => <span className="text-sm text-gray-700 truncate">{info.getValue<string>()}</span>,
  },
  {
    id: 'eta', header: 'ETA',
    cell: ({ row }) => <span className="text-sm tabular-nums">{formatTime(row.original.eta)}</span>,
  },
  {
    id: 'window', header: 'Janela',
    cell: ({ row }) => (
      <span className="text-sm tabular-nums text-gray-600">
        {formatTime(row.original.windowStart)} – {formatTime(row.original.windowEnd)}
      </span>
    ),
  },
  {
    id: 'status', header: 'Status',
    cell: ({ row }) => <StatusBadge status={row.original.slaStatus} />,
  },
  {
    accessorKey: 'origin', header: 'Localização',
    cell: (info) => <span className="text-xs text-gray-600 truncate">{info.getValue<string>()}</span>,
  },
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
      <button
        className="p-1 rounded hover:bg-gray-100 text-gray-500"
        onClick={(e) => e.stopPropagation()}
      >
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
