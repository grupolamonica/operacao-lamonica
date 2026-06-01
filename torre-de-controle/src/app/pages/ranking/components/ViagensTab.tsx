import { useMemo, useState } from 'react'
import { Pencil } from 'lucide-react'
import type { ColumnDef } from '@tanstack/react-table'
import { DataTable } from '@/components/domain/DataTable'
import { StatusBadge, type SlaStatus } from '@/components/domain/StatusBadge'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useRankingTrips, useRankingDrivers, useCanWriteRanking, type Trip } from '@/hooks/useRanking'
import { fixMojibake } from '@/lib/mojibake'
import { getDriverVinculoLabel, getRouteKey, getRouteLabel, parseTripDate } from '@/lib/driverInsights'
import { EvaluationFormDialog } from './EvaluationFormDialog'

/**
 * ViagensTab — aba Viagens (PHASE8-TAB-VIAGENS, 08-05 / Wave 3).
 *
 * Recria o `TripList` do ride-rank no design Torre: uma `DataTable<Trip>` com as
 * viagens reais FECHADA de `GET /api/ranking/trips` (o backend ja filtra por
 * status_agrupado === 'FECHADA' — 07-04). Read-only: nenhuma mutacao parte daqui.
 * O botao "Avaliar"/"Editar" apenas ABRE o `EvaluationFormDialog` em modo shell;
 * o submit dentro do modal e que fica desabilitado (escrita = Phase 9).
 *
 * Decisoes de mapeamento (documentadas no 08-05-SUMMARY):
 *   - Coluna "Vinculo" do ride-rank e OMITIDA: o tipo `Trip` (07-04) nao carrega
 *     vinculo — ele vive em `Driver.vinculo` e o ride-rank cruzava trips×drivers
 *     via um Map. Cruzar aqui adicionaria um segundo hook (useRankingDrivers) fora
 *     do escopo desta aba; fica para uma iteracao futura se necessario.
 *   - Coluna "Pontuacao" mostra apenas `score_final` (mono, cor por sinal), nao
 *     `score/max`. O `maxScore` do ride-rank dependia de `getRouteBasePoints` (logica
 *     data-dependente sobre route-scores nao portada ao Torre). Exibir so o score_final
 *     ja computado pelo backend evita reimplementar essa regra na camada de view.
 *   - `status_eta` / `status_eta_destino` sao strings livres do CSV (ON TIME / EARLY /
 *     DELAY / "—" / vazio). `etaToSlaStatus` normaliza para o `SlaStatus` semantico do
 *     Torre; valores desconhecidos caem para um span "—" (igual ao ride-rank).
 *
 * @see C:\...\ride-rank-buddy\src\components\TripList.tsx — comportamento original
 * @see torre-de-controle/src/hooks/useRanking.ts — useRankingTrips (FECHADA only)
 */

/** Normaliza o status_eta livre do CSV para o SlaStatus semantico do Torre. */
function etaToSlaStatus(raw: string): SlaStatus | null {
  const s = (raw ?? '').trim().toUpperCase()
  if (s === 'ON TIME' || s === 'EARLY' || s === 'NO PRAZO' || s === 'ADIANTADO') return 'no_prazo'
  if (s === 'DELAY' || s === 'ATRASADO' || s === 'ATRASO') return 'atrasado'
  if (s === 'EM RISCO' || s === 'RISCO') return 'em_risco'
  return null
}

/** Celula de status ETA: StatusBadge quando reconhecido, senao "—" mudo. */
function EtaCell({ status }: { status: string }) {
  const sla = etaToSlaStatus(status)
  if (sla) return <StatusBadge status={sla} />
  return <span className="text-xs text-muted-foreground">{status?.trim() || '—'}</span>
}

/** Celula de pontuacao final (mono, cor por sinal). */
function ScoreCell({ value }: { value: number }) {
  const color =
    value > 0 ? 'var(--status-no-prazo-fg)'
    : value < 0 ? 'var(--status-atrasado-fg)'
    : 'var(--muted-foreground)'
  return (
    <span className="font-mono font-bold tabular-nums" style={{ color }}>
      {value > 0 ? `+${value.toFixed(1)}` : value.toFixed(1)}
    </span>
  )
}

export function ViagensTab() {
  const { data: trips, isLoading } = useRankingTrips()
  const { data: drivers } = useRankingDrivers()
  const [evaluatingTripId, setEvaluatingTripId] = useState<string | null>(null)
  const canWrite = useCanWriteRanking()

  const [vinculoFilter, setVinculoFilter] = useState<string>('all')
  const [rotaFilter, setRotaFilter] = useState<string>('all')
  const [occFilter, setOccFilter] = useState<'all' | 'with' | 'without'>('all')
  const [fromDate, setFromDate] = useState<string>('')
  const [toDate, setToDate] = useState<string>('')

  // Cross trips × drivers by driver_id to surface the vínculo (the Trip contract
  // carries no vinculo — it lives on RankedDriver, enriched from the vinculo sheet).
  const vinculoByDriver = useMemo(
    () => new Map(drivers.map((d) => [d.id, d.vinculo])),
    [drivers],
  )

  const vinculoOptions = useMemo(() => {
    const set = new Set<string>()
    for (const t of trips) set.add(getDriverVinculoLabel(vinculoByDriver.get(t.driver_id)))
    return [...set].sort((a, b) => a.localeCompare(b))
  }, [trips, vinculoByDriver])

  const rotaOptions = useMemo(() => {
    const map = new Map<string, string>()
    for (const t of trips) map.set(getRouteKey(t.origin_code, t.destination_code), getRouteLabel(t.origin_code, t.destination_code))
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [trips])

  const filteredTrips = useMemo(() => {
    const from = fromDate ? new Date(`${fromDate}T00:00:00`) : null
    const to = toDate ? new Date(`${toDate}T23:59:59`) : null
    return trips.filter((t) => {
      if (vinculoFilter !== 'all' && getDriverVinculoLabel(vinculoByDriver.get(t.driver_id)) !== vinculoFilter) return false
      if (rotaFilter !== 'all' && getRouteKey(t.origin_code, t.destination_code) !== rotaFilter) return false
      if (occFilter === 'with' && !t.ocorrencia) return false
      if (occFilter === 'without' && t.ocorrencia) return false
      if (from || to) {
        const d = parseTripDate(t.data)
        if (!d) return false
        if (from && d < from) return false
        if (to && d > to) return false
      }
      return true
    })
  }, [trips, vinculoByDriver, vinculoFilter, rotaFilter, occFilter, fromDate, toDate])

  const columns = useMemo<ColumnDef<Trip, unknown>[]>(() => [
    {
      accessorKey: 'id',
      header: 'ID Viagem',
      cell: ({ row }) => (
        <span
          className="font-mono text-xs text-muted-foreground block max-w-[120px] truncate"
          title={row.original.id}
        >
          {row.original.id}
        </span>
      ),
    },
    {
      accessorKey: 'driverName',
      header: 'Motorista',
      cell: ({ row }) => (
        <span className="font-medium whitespace-nowrap">
          {fixMojibake(row.original.driverName)}
        </span>
      ),
    },
    {
      id: 'vinculo',
      header: 'Vínculo',
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          {getDriverVinculoLabel(vinculoByDriver.get(row.original.driver_id))}
        </span>
      ),
    },
    {
      id: 'rota',
      header: 'Rota',
      cell: ({ row }) => (
        <span className="font-mono text-xs whitespace-nowrap">
          {row.original.origin_code || '—'} → {row.original.destination_code || '—'}
        </span>
      ),
    },
    {
      accessorKey: 'data',
      header: 'Data',
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          {row.original.data || '—'}
        </span>
      ),
    },
    {
      accessorKey: 'status_eta',
      header: 'ETA Orig.',
      cell: ({ row }) => <EtaCell status={row.original.status_eta} />,
    },
    {
      accessorKey: 'status_eta_destino',
      header: 'ETA Dest.',
      cell: ({ row }) => <EtaCell status={row.original.status_eta_destino} />,
    },
    {
      id: 'ocorrencia',
      header: 'Ocorr.',
      cell: ({ row }) =>
        row.original.ocorrencia ? (
          <Badge variant="destructive" className="text-[10px]">
            {row.original.ocorrencia_count}
          </Badge>
        ) : (
          <span className="text-xs text-muted-foreground">-</span>
        ),
    },
    {
      accessorKey: 'score_final',
      header: 'Pontuação',
      cell: ({ row }) => <ScoreCell value={row.original.score_final} />,
    },
    {
      id: 'acao',
      header: 'Ação',
      cell: ({ row }) => {
        if (!canWrite) {
          return <span className="text-xs text-muted-foreground">—</span>
        }
        return (
          <Button
            size="sm"
            variant={row.original.evaluated ? 'ghost' : 'outline'}
            className="h-7 gap-1 text-xs"
            onClick={() => setEvaluatingTripId(row.original.id)}
          >
            {row.original.evaluated ? (
              <>
                <Pencil className="h-3 w-3" /> Editar
              </>
            ) : (
              'Avaliar'
            )}
          </Button>
        )
      },
    },
  ], [canWrite, vinculoByDriver])

  const hasFilter =
    vinculoFilter !== 'all' || rotaFilter !== 'all' || occFilter !== 'all' || !!fromDate || !!toDate

  const toolbar = (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={vinculoFilter} onValueChange={setVinculoFilter}>
        <SelectTrigger size="sm" className="h-8 w-[170px]"><SelectValue placeholder="Vínculo" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todos os vínculos</SelectItem>
          {vinculoOptions.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}
        </SelectContent>
      </Select>
      <Select value={rotaFilter} onValueChange={setRotaFilter}>
        <SelectTrigger size="sm" className="h-8 w-[200px]"><SelectValue placeholder="Rota" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todas as rotas</SelectItem>
          {rotaOptions.map(([key, label]) => <SelectItem key={key} value={key}>{label}</SelectItem>)}
        </SelectContent>
      </Select>
      <Select value={occFilter} onValueChange={(v) => setOccFilter(v as 'all' | 'with' | 'without')}>
        <SelectTrigger size="sm" className="h-8 w-[180px]"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todas ocorrências</SelectItem>
          <SelectItem value="with">Com ocorrências</SelectItem>
          <SelectItem value="without">Sem ocorrências</SelectItem>
        </SelectContent>
      </Select>
      <input
        type="date"
        value={fromDate}
        onChange={(e) => setFromDate(e.target.value)}
        title="Período: de"
        className="h-8 rounded-md border border-input bg-transparent px-2 text-xs text-foreground"
      />
      <input
        type="date"
        value={toDate}
        onChange={(e) => setToDate(e.target.value)}
        title="Período: até"
        className="h-8 rounded-md border border-input bg-transparent px-2 text-xs text-foreground"
      />
    </div>
  )

  return (
    <>
      <DataTable<Trip>
        data={filteredTrips}
        columns={columns}
        toolbar={toolbar}
        title="Viagens"
        subtitle={
          isLoading
            ? 'Carregando…'
            : hasFilter
              ? `${filteredTrips.length} de ${trips.length} viagens`
              : `${trips.length} viagens`
        }
        emptyMessage={isLoading ? 'Carregando viagens…' : 'Nenhuma viagem para os filtros.'}
      />
      <EvaluationFormDialog
        tripId={evaluatingTripId}
        open={!!evaluatingTripId}
        onOpenChange={(o) => { if (!o) setEvaluatingTripId(null) }}
      />
    </>
  )
}
