import { type ColumnDef } from '@tanstack/react-table'
import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { DataTable } from '@/components/domain/DataTable'
import { StatusBadge } from '@/components/domain/StatusBadge'
import { DriverAvatar } from '@/components/domain/DriverAvatar'
import { ProgressBar } from '@/components/domain/ProgressBar'
import { useTrips } from '@/hooks/useTrips'
import { formatTime } from '@/lib/formatters'
import type { Trip } from '@/data/types'

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
  { id: 'kmFalta', header: 'Km Falta', size: 80, cell: ({ row }) => <span className="text-xs tabular-nums text-foreground">{Math.round(row.original.kmFalta ?? Math.max(0, row.original.distanceTotal - row.original.distanceDone))} km</span> },
  { id: 'prazo', header: 'Prazo Final', size: 100, cell: ({ row }) => <span className="text-xs tabular-nums text-foreground">{formatTime(row.original.windowEnd)}</span> },
  { id: 'previsao', header: 'Previsão', size: 100, cell: ({ row }) => <span className="text-xs tabular-nums text-foreground">{formatTime(row.original.eta)}</span> },
  { id: 'status', header: 'Status', size: 100, cell: ({ row }) => <StatusBadge status={row.original.slaStatus} /> },
  {
    id: 'atraso', header: 'Atraso', size: 80,
    cell: ({ row }) => {
      const h = row.original.adiantamentoHoras
      const cls = h == null ? 'text-muted-foreground' : h > 0.0167 ? 'text-[#f5365c]' : h < -0.0167 ? 'text-[#2dce89]' : 'text-muted-foreground'
      return <span className={`text-xs tabular-nums font-semibold ${cls}`}>{row.original.atrasoLabel || '—'}</span>
    },
  },
  {
    id: 'progress', header: 'Progresso', size: 110,
    cell: ({ row }) => (
      <div className="space-y-1 min-w-[80px]">
        <span className="text-xs text-muted-foreground">{row.original.progressPct}%</span>
        <ProgressBar value={row.original.progressPct} color="#0f62fe" height={4} />
      </div>
    ),
  },
]

export function TripsInProgressTable() {
  const navigate = useNavigate()
  // Todas as viagens em andamento (ativas), atualizadas a cada 5s. Backend já escopa em source='painel'.
  const { data: active } = useTrips({ status: 'in_progress' })

  // Ordem: do MAIS ATRASADO para o mais adiantado (adiantamentoHoras: + = atrasado).
  const ordered = useMemo(() => {
    const at = (t: Trip) => (t.adiantamentoHoras ?? Number.NEGATIVE_INFINITY)
    return [...active].sort((a, b) => at(b) - at(a))
  }, [active])

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-foreground">Viagens em andamento</h3>
        <span className="text-xs text-muted-foreground">{ordered.length} em rota · mais atrasadas primeiro</span>
      </div>
      <DataTable
        data={ordered}
        columns={columns}
        pageSize={10}
        onRowClick={(t) => navigate(`/viagens?trip=${t.id}`)}
      />
    </div>
  )
}
