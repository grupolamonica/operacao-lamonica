import { type ColumnDef } from '@tanstack/react-table'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { DataTable } from '@/components/domain/DataTable'
import { StatusBadge } from '@/components/domain/StatusBadge'
import { DriverAvatar } from '@/components/domain/DriverAvatar'
import { ProgressBar } from '@/components/domain/ProgressBar'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
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
// Os prazos (window_*) chegam como "hora-de-Brasília rotulada como UTC" (a planilha é
// horário local; o backend grava o wall-clock e o formatDate exibe em UTC). Para o SLA
// bater com o painel, o "agora" tem que estar no MESMO convênio: pega o wall-clock local
// do navegador e rotula como UTC. Sem isto havia 3h de descompasso (atrasos absurdos/errados).
function toBrasiliaWall(d: Date): Date {
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds()))
}

export function useLiveTrips(filter: TripFilters): Trip[] {
  const now = useNow(5000)
  // limit alto: o universo de viagens ativas (~155) passa do default 100 do servidor —
  // sem isso, atrasadas com janela mais antiga eram cortadas e sumiam da tabela (D-14 fix).
  const { data: active } = useTrips({ ...filter, limit: 2000 })
  return useMemo(() => {
    const agora = toBrasiliaWall(now)
    return active.map((t): Trip => {
      const kmFalta = t.kmFalta ?? Math.max(0, t.distanceTotal - t.distanceDone)
      const live = recomputeSla(t.distanceTotal, kmFalta, t.windowEnd ? new Date(t.windowEnd) : null, t.windowStart ? new Date(t.windowStart) : null, agora)
      const atraso = live.atrasoHoras ?? t.adiantamentoHoras ?? null
      return { ...t, eta: (live.eta ?? t.eta) as Trip['eta'], adiantamentoHoras: atraso, atrasoLabel: formatarAtraso(atraso), slaStatus: (live.slaStatus ?? t.slaStatus) as Trip['slaStatus'] }
    })
  }, [active, now])
}

export function TripsInProgressTable() {
  const navigate = useNavigate()
  // Todas as viagens em andamento (ativas) ao vivo, ordenadas do MAIS ATRASADO → adiantado.
  // Ordena pelo atraso em MINUTOS (não horas-fração) + desempate estável por id: evita a
  // tabela "pular"/reordenar a cada recálculo de 5s por diferenças de segundos (bug reportado).
  const mapped = useLiveTrips({ status: 'in_progress' })
  // Filtro de cliente (Casas Bahia, Nestlé, Shopee, B2W...) — opções dos próprios dados em rota.
  const [cliente, setCliente] = useState<string>('__all')
  const clientes = useMemo(
    () => [...new Set(mapped.map((t) => t.clientName).filter(Boolean))].sort(),
    [mapped],
  )
  const ordered = useMemo(() => {
    const k = (t: Trip) => (t.adiantamentoHoras == null ? -1e9 : Math.round(t.adiantamentoHoras * 60))
    return [...mapped]
      .filter((t) => cliente === '__all' || t.clientName === cliente)
      .sort((a, b) => { const d = k(b) - k(a); return d !== 0 ? d : a.id.localeCompare(b.id) })
  }, [mapped, cliente])

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-base font-semibold text-foreground shrink-0">Viagens em andamento</h3>
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs text-muted-foreground hidden sm:inline">{ordered.length} em rota · mais atrasadas primeiro</span>
          <Select value={cliente} onValueChange={setCliente}>
            <SelectTrigger className="h-8 w-[150px] text-xs"><SelectValue placeholder="Cliente" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">Todos clientes</SelectItem>
              {clientes.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
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
