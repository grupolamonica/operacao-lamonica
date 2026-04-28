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
  {
    id: 'eta', header: 'ETA',
    cell: ({ row }) => <span className="text-sm tabular-nums">{formatTime(row.original.eta)}</span>,
  },
  {
    id: 'window', header: 'Janela',
    cell: ({ row }) => (
      <span className="text-xs tabular-nums text-gray-600">
        {formatTime(row.original.windowStart)}–{formatTime(row.original.windowEnd)}
      </span>
    ),
  },
  {
    id: 'desvio', header: 'Desvio ETA',
    cell: ({ row }) => {
      const diff = minutesBetween(row.original.windowEnd, row.original.eta)
      const color = diff > 0 ? 'text-red-600' : diff > -10 ? 'text-orange-600' : 'text-gray-500'
      return (
        <span className={`text-sm font-medium tabular-nums ${color}`}>
          {diff > 0 ? `+${diff}` : diff} min
        </span>
      )
    },
  },
  {
    id: 'status', header: 'Status',
    cell: ({ row }) => <StatusBadge status={row.original.slaStatus} />,
  },
]

export function AtRiskTripsTable() {
  const { data: all } = useTrips({ status: 'in_progress' })
  const atRisk = all.filter(
    t => t.slaStatus === 'em_risco' || t.slaStatus === 'atrasado' || t.slaStatus === 'sem_sinal',
  )

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-gray-900">Viagens em maior risco</h3>
        <span className="text-xs text-gray-500">{atRisk.length} viagens</span>
      </div>
      <DataTable
        data={atRisk}
        columns={columns}
        pageSize={10}
        emptyMessage="Nenhuma viagem em risco no momento."
      />
    </div>
  )
}
