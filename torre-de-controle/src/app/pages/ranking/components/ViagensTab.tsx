import { useMemo, useState } from 'react'
import { Pencil } from 'lucide-react'
import type { ColumnDef } from '@tanstack/react-table'
import { DataTable } from '@/components/domain/DataTable'
import { StatusBadge, type SlaStatus } from '@/components/domain/StatusBadge'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useRankingTrips, type Trip } from '@/hooks/useRanking'
import { fixMojibake } from '@/lib/mojibake'
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
      {value > 0 ? `+${value}` : value}
    </span>
  )
}

export function ViagensTab() {
  const { data: trips, isLoading } = useRankingTrips()
  const [evaluatingTripId, setEvaluatingTripId] = useState<string | null>(null)

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
      cell: ({ row }) => (
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
      ),
    },
  ], [])

  return (
    <>
      <DataTable<Trip>
        data={trips}
        columns={columns}
        title="Viagens"
        subtitle={isLoading ? 'Carregando…' : `${trips.length} viagens`}
        emptyMessage={isLoading ? 'Carregando viagens…' : 'Nenhuma viagem fechada encontrada.'}
      />
      <EvaluationFormDialog
        tripId={evaluatingTripId}
        open={!!evaluatingTripId}
        onOpenChange={(o) => { if (!o) setEvaluatingTripId(null) }}
      />
    </>
  )
}
