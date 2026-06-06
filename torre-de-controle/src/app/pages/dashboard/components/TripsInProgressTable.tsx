import { type ColumnDef } from '@tanstack/react-table'
import { useMemo } from 'react'
import { DataTable } from '@/components/domain/DataTable'
import { StatusBadge } from '@/components/domain/StatusBadge'
import { DriverAvatar } from '@/components/domain/DriverAvatar'
import { ProgressBar } from '@/components/domain/ProgressBar'
import { useTrips } from '@/hooks/useTrips'
import { formatTime } from '@/lib/formatters'
import type { Trip, TripFilters } from '@/data/types'

const columns: ColumnDef<Trip>[] = [
  {
    id: 'driver', header: 'Motorista', size: 200,
    cell: ({ row }) => {
      const t = row.original
      return (
        <div className="flex items-center gap-2">
          <DriverAvatar name={t.driverName} photoUrl={t.driverPhoto} size="sm" />
          <p className="text-sm font-medium text-foreground truncate">{t.driverName}</p>
        </div>
      )
    },
  },
  { accessorKey: 'clientName', header: 'Cliente', cell: (info) => <span className="text-sm text-foreground truncate">{info.getValue<string>()}</span> },
  { id: 'eta', header: 'ETA', size: 70, cell: ({ row }) => <span className="text-sm tabular-nums text-foreground">{formatTime(row.original.eta)}</span> },
  { id: 'status', header: 'Status', size: 110, cell: ({ row }) => <StatusBadge status={row.original.slaStatus} /> },
  {
    id: 'progress', header: 'Progresso', size: 120,
    cell: ({ row }) => (
      <div className="space-y-1 min-w-[90px]">
        <span className="text-xs text-muted-foreground">{row.original.progressPct}%</span>
        <ProgressBar value={row.original.progressPct} color="#0f62fe" height={4} />
      </div>
    ),
  },
]

export function TripsInProgressTable() {
  // Phase 13 — todas as viagens NÃO concluídas/canceladas, ordem: mais próximo de descarregar (ETA asc).
  const { data: all } = useTrips({ limit: 20000 } as TripFilters & { limit: number })

  const active = useMemo(() => {
    const km = (t: Trip) => (t.distanceTotal ?? 0) - (t.distanceDone ?? 0)
    const etaMs = (t: Trip) => (t.eta ? new Date(t.eta).getTime() : Number.POSITIVE_INFINITY)
    return all
      .filter(t => t.status !== 'completed' && t.status !== 'cancelled')
      .sort((a, b) => {
        const d = etaMs(a) - etaMs(b)
        if (d !== 0 && !Number.isNaN(d)) return d
        return km(a) - km(b)
      })
  }, [all])

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-foreground">Viagens em andamento</h3>
        <span className="text-xs text-muted-foreground">{active.length} ativas · por chegada</span>
      </div>
      <DataTable data={active} columns={columns} pageSize={10} />
    </div>
  )
}
