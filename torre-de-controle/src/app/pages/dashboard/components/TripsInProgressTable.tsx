import { type ColumnDef } from '@tanstack/react-table'
import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { DataTable } from '@/components/domain/DataTable'
import { StatusBadge } from '@/components/domain/StatusBadge'
import { DriverAvatar } from '@/components/domain/DriverAvatar'
import { ProgressBar } from '@/components/domain/ProgressBar'
import { useTrips } from '@/hooks/useTrips'
import { useNow } from '@/hooks/useNow'
import { recomputeSla, formatarAtraso } from '@/lib/regulamentacao'
import { formatDate } from '@/lib/formatters'
import type { Trip, TripFilters } from '@/data/types'

const fmtDT = (d?: Date | string | null) => (d ? formatDate(d, 'dd/MM/yyyy HH:mm:ss') : '—')

// Colunas compartilhadas: "Viagens em andamento" (Dashboard) e "Viagens em maior risco" (Torre)
// usam exatamente as mesmas (D-14, Onda B). Motorista · Km Falta · Prazo Final · Previsão · Status · Atraso · Progresso.
export const tripProgressColumns: ColumnDef<Trip>[] = [
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
  { id: 'prazo', header: 'Prazo Final', size: 140, cell: ({ row }) => <span className="text-xs tabular-nums text-foreground">{fmtDT(row.original.windowEnd)}</span> },
  { id: 'previsao', header: 'Previsão de Chegada', size: 140, cell: ({ row }) => <span className="text-xs tabular-nums text-foreground">{fmtDT(row.original.eta)}</span> },
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

/**
 * Hook compartilhado: viagens recalculadas AO VIVO (ETA/atraso/status a cada 5s,
 * lei do motorista) para um filtro. Sem ordenação — quem chama decide. Usado por
 * "Viagens em andamento" e "Viagens em maior risco".
 */
export function useLiveTrips(filter: TripFilters): Trip[] {
  const now = useNow(5000)
  const { data: active } = useTrips(filter)
  return useMemo(() => {
    return active.map((t): Trip => {
      const kmFalta = t.kmFalta ?? Math.max(0, t.distanceTotal - t.distanceDone)
      const live = recomputeSla(t.distanceTotal, kmFalta, t.windowEnd ? new Date(t.windowEnd) : null, t.windowStart ? new Date(t.windowStart) : null, now)
      const atraso = live.atrasoHoras ?? t.adiantamentoHoras ?? null
      return { ...t, eta: (live.eta ?? t.eta) as Trip['eta'], adiantamentoHoras: atraso, atrasoLabel: formatarAtraso(atraso), slaStatus: (live.slaStatus ?? t.slaStatus) as Trip['slaStatus'] }
    })
  }, [active, now])
}

export function TripsInProgressTable() {
  const navigate = useNavigate()
  // Todas as viagens em andamento (ativas) ao vivo, ordenadas do MAIS ATRASADO → adiantado.
  const mapped = useLiveTrips({ status: 'in_progress' })
  const ordered = useMemo(
    () => [...mapped].sort((a, b) => (b.adiantamentoHoras ?? Number.NEGATIVE_INFINITY) - (a.adiantamentoHoras ?? Number.NEGATIVE_INFINITY)),
    [mapped],
  )

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-foreground">Viagens em andamento</h3>
        <span className="text-xs text-muted-foreground">{ordered.length} em rota · mais atrasadas primeiro</span>
      </div>
      <DataTable
        data={ordered}
        columns={tripProgressColumns}
        pageSize={10}
        onRowClick={(t) => navigate(`/viagens?trip=${t.id}`)}
      />
    </div>
  )
}
