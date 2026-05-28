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
        <p className="text-sm font-mono font-medium text-foreground">{row.original.code}</p>
        <p className="text-xs text-muted-foreground">{row.original.clientName}</p>
      </div>
    ),
  },
  {
    id: 'driver', header: 'Motorista',
    cell: ({ row }) => (
      <div className="flex items-center gap-2">
        <DriverAvatar name={row.original.driverName} size="sm" />
        <div>
          <p className="text-sm text-foreground truncate">{row.original.driverName}</p>
          <p className="text-xs text-muted-foreground font-mono">{row.original.plate}</p>
        </div>
      </div>
    ),
  },
  {
    id: 'eta', header: 'ETA',
    cell: ({ row }) => <span className="text-sm tabular-nums text-foreground">{formatTime(row.original.eta)}</span>,
  },
  {
    id: 'window', header: 'Janela',
    cell: ({ row }) => (
      <span className="text-xs tabular-nums text-muted-foreground">
        {formatTime(row.original.windowStart)}–{formatTime(row.original.windowEnd)}
      </span>
    ),
  },
  {
    id: 'desvio', header: 'Desvio ETA',
    cell: ({ row }) => {
      const diff = minutesBetween(row.original.windowEnd, row.original.eta)
      const color = diff > 0 ? 'text-danger' : diff > -10 ? 'text-warning' : 'text-muted-foreground'
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
    <DataTable
      data={atRisk}
      columns={columns}
      pageSize={10}
      emptyMessage="Nenhuma viagem em risco no momento."
      title="Viagens em maior risco"
      subtitle={`${atRisk.length} viagens`}
    />
  )
}
