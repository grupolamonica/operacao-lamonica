import { useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, ChevronsUpDown, AlertCircle } from 'lucide-react'
import type { ColumnDef } from '@tanstack/react-table'
import { DataTable } from '@/components/domain/DataTable'
import { useRankingDrivers, type RankedDriver, type RankingFilterOpts } from '@/hooks/useRanking'
import { fixMojibake } from '@/lib/mojibake'
import { getDriverVinculoLabel } from '@/lib/driverInsights'
import { cn } from '@/lib/utils'
import { toneText } from '@/lib/statusColors'
import { DriverDetailsDialog } from './DriverDetailsDialog'

/**
 * RankingTab — aba Ranking (PHASE8-TAB-RANKING). Recria a tabela de ranking do
 * ride-rank (DriverRanking.tsx) no design Torre: DataTable de RankedDriver com
 * rank, nome, pontuacao, vinculo, viagens, ocorrencias, status e as 6 metricas
 * ETA (Origem/Destino × On Time/Early/Delay). Clicar numa linha abre o
 * DriverDetailsDialog em modo somente-leitura.
 *
 * ORDENACAO (decisao de escopo): a DataTable compartilhada do Torre NAO inclui
 * `getSortedRowModel` e nao pode ser editada nesta wave (pertence a outro
 * escopo). Para entregar ordenacao por colunas numericas sem tocar nesse
 * arquivo, mantemos `sortKey`/`sortDir` locais e passamos o array JA ORDENADO
 * para a DataTable (default: pontuacao desc). Os cabecalhos numericos sao
 * botoes que alternam asc/desc (3 estados: clicar numa nova coluna -> desc;
 * reclicar -> asc; reclicar -> volta ao default pontuacao desc).
 *
 * READ-ONLY (CONTEXT D-V2-03): sem edicao de nome / avaliacao (isso era escrita
 * no ride-rank e fica para a Phase 9). Nenhuma chamada POST/PATCH/DELETE.
 */

/** Chaves numericas ordenaveis (acessadas via accessorFn/sortFn). */
type SortKey =
  | 'rank'
  | 'pontuacao'
  | 'totalViagens'
  | 'ocorrencias'
  | 'etaOrig.onTime'
  | 'etaOrig.early'
  | 'etaOrig.delay'
  | 'etaDest.onTime'
  | 'etaDest.early'
  | 'etaDest.delay'

type SortDir = 'asc' | 'desc'

const DEFAULT_SORT: SortKey = 'pontuacao'
const DEFAULT_DIR: SortDir = 'desc'

/** Extrai o valor numerico de uma RankedDriver para a chave de ordenacao. */
function sortValue(d: RankedDriver, key: SortKey): number {
  switch (key) {
    case 'rank':
      // BLOQUEADO (rank null) sempre no fim, independente da direcao.
      return d.rank ?? Number.POSITIVE_INFINITY
    case 'pontuacao':
      return d.pontuacao
    case 'totalViagens':
      return d.totalViagens
    case 'ocorrencias':
      return d.ocorrencias
    case 'etaOrig.onTime':
      return d.etaOrigMetrics.onTime
    case 'etaOrig.early':
      return d.etaOrigMetrics.early
    case 'etaOrig.delay':
      return d.etaOrigMetrics.delay
    case 'etaDest.onTime':
      return d.etaDestMetrics.onTime
    case 'etaDest.early':
      return d.etaDestMetrics.early
    case 'etaDest.delay':
      return d.etaDestMetrics.delay
  }
}

/** Cor das metricas ETA: onTime = verde, early = azul, delay = vermelho. */
function metricClass(kind: 'onTime' | 'early' | 'delay'): string {
  if (kind === 'onTime') return toneText.success
  if (kind === 'early') return toneText.info
  return toneText.danger
}

function MetricCell({ value, kind }: { value: number; kind: 'onTime' | 'early' | 'delay' }) {
  return (
    <span className={cn('font-mono text-xs tabular-nums', metricClass(kind))}>
      {value.toFixed(1)}%
    </span>
  )
}

/** Badge de status do motorista (ATIVO=verde / BLOQUEADO=vermelho), tom Argon. */
function DriverStatusBadge({ status }: { status: RankedDriver['status'] }) {
  const isActive = status === 'ATIVO'
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap"
      style={
        isActive
          ? { backgroundColor: 'var(--status-no-prazo-bg)', color: 'var(--status-no-prazo-fg)' }
          : { backgroundColor: 'var(--status-atrasado-bg)', color: 'var(--status-atrasado-fg)' }
      }
    >
      {status}
    </span>
  )
}

export function RankingTab({ opts, vinculo }: { opts?: RankingFilterOpts; vinculo: string }) {
  const { data: drivers, isLoading, isError } = useRankingDrivers(opts)
  const [selectedDriver, setSelectedDriver] = useState<RankedDriver | null>(null)
  const [sortKey, setSortKey] = useState<SortKey>(DEFAULT_SORT)
  const [sortDir, setSortDir] = useState<SortDir>(DEFAULT_DIR)

  /** Alterna o sort de uma coluna: nova coluna -> desc; mesma -> desc->asc->default. */
  function toggleSort(key: SortKey) {
    if (sortKey !== key) {
      setSortKey(key)
      setSortDir('desc')
      return
    }
    if (sortDir === 'desc') {
      setSortDir('asc')
      return
    }
    // asc -> volta ao default (pontuacao desc)
    setSortKey(DEFAULT_SORT)
    setSortDir(DEFAULT_DIR)
  }

  const sortedDrivers = useMemo(() => {
    const arr = [...drivers]
    arr.sort((a, b) => {
      const av = sortValue(a, sortKey)
      const bv = sortValue(b, sortKey)
      if (av === bv) return 0
      const cmp = av < bv ? -1 : 1
      return sortDir === 'asc' ? cmp : -cmp
    })
    return arr
  }, [drivers, sortKey, sortDir])

  /** Filtro de Vínculo (client-side) vindo da barra de filtros do topo. */
  const filteredDrivers = useMemo(
    () =>
      vinculo === 'all'
        ? sortedDrivers
        : sortedDrivers.filter((d) => getDriverVinculoLabel(d.vinculo) === vinculo),
    [sortedDrivers, vinculo],
  )

  /** Header clicavel para colunas numericas, com indicador de sort. */
  const SortHeader = useMemo(
    () =>
      function SortHeaderInner({ label, sortKeyFor }: { label: string; sortKeyFor: SortKey }) {
        const active = sortKey === sortKeyFor
        const Icon = !active ? ChevronsUpDown : sortDir === 'asc' ? ArrowUp : ArrowDown
        return (
          <button
            type="button"
            onClick={() => toggleSort(sortKeyFor)}
            className={cn(
              'inline-flex items-center gap-1 select-none uppercase tracking-[0.08em]',
              active ? 'text-foreground' : 'text-inherit',
            )}
            style={{ font: 'inherit', letterSpacing: 'inherit' }}
          >
            {label}
            <Icon className="h-3 w-3 opacity-70" />
          </button>
        )
      },
    // toggleSort/sortDir/sortKey closure — recreate when sort state changes
    [sortKey, sortDir],
  )

  const columns = useMemo<ColumnDef<RankedDriver, unknown>[]>(
    () => [
      {
        id: 'rank',
        header: () => <SortHeader label="#" sortKeyFor="rank" />,
        cell: ({ row }) => {
          const rank = row.original.rank
          const isTop3 = rank !== null && rank <= 3
          return (
            <span
              className={cn(
                'font-mono font-bold text-xs tabular-nums',
                isTop3 ? 'text-primary' : 'text-muted-foreground',
              )}
            >
              {rank !== null ? String(rank).padStart(2, '0') : '—'}
            </span>
          )
        },
      },
      {
        id: 'nome',
        header: 'Motorista',
        cell: ({ row }) => (
          <span className="font-medium">{fixMojibake(row.original.nome)}</span>
        ),
      },
      {
        id: 'pontuacao',
        header: () => <SortHeader label="Pontos" sortKeyFor="pontuacao" />,
        cell: ({ row }) => (
          <span className="block text-right font-mono font-bold tabular-nums">
            {row.original.pontuacao.toFixed(1)}
          </span>
        ),
      },
      {
        id: 'vinculo',
        header: 'Vínculo',
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">{fixMojibake(row.original.vinculo)}</span>
        ),
      },
      {
        id: 'totalViagens',
        header: () => <SortHeader label="Viagens" sortKeyFor="totalViagens" />,
        cell: ({ row }) => (
          <span className="block text-right font-mono tabular-nums text-muted-foreground">
            {row.original.totalViagens}
          </span>
        ),
      },
      {
        id: 'ocorrencias',
        header: () => <SortHeader label="Ocorr." sortKeyFor="ocorrencias" />,
        cell: ({ row }) => {
          const n = row.original.ocorrencias
          return n > 0 ? (
            <span className="flex items-center justify-end gap-1 font-mono font-medium text-red-500">
              <AlertCircle className="h-3 w-3" /> {n}
            </span>
          ) : (
            <span className="block text-right font-mono text-muted-foreground">0</span>
          )
        },
      },
      {
        id: 'status',
        header: 'Status',
        cell: ({ row }) => <DriverStatusBadge status={row.original.status} />,
      },
      // --- ETA Origem (On Time / Early / Delay) ---
      {
        id: 'etaOrig.onTime',
        accessorFn: (row) => row.etaOrigMetrics.onTime,
        header: () => <SortHeader label="Orig OnTime" sortKeyFor="etaOrig.onTime" />,
        cell: ({ row }) => (
          <span className="block text-center">
            <MetricCell value={row.original.etaOrigMetrics.onTime} kind="onTime" />
          </span>
        ),
      },
      {
        id: 'etaOrig.early',
        accessorFn: (row) => row.etaOrigMetrics.early,
        header: () => <SortHeader label="Orig Early" sortKeyFor="etaOrig.early" />,
        cell: ({ row }) => (
          <span className="block text-center">
            <MetricCell value={row.original.etaOrigMetrics.early} kind="early" />
          </span>
        ),
      },
      {
        id: 'etaOrig.delay',
        accessorFn: (row) => row.etaOrigMetrics.delay,
        header: () => <SortHeader label="Orig Delay" sortKeyFor="etaOrig.delay" />,
        cell: ({ row }) => (
          <span className="block text-center">
            <MetricCell value={row.original.etaOrigMetrics.delay} kind="delay" />
          </span>
        ),
      },
      // --- ETA Destino (On Time / Early / Delay) ---
      {
        id: 'etaDest.onTime',
        accessorFn: (row) => row.etaDestMetrics.onTime,
        header: () => <SortHeader label="Dest OnTime" sortKeyFor="etaDest.onTime" />,
        cell: ({ row }) => (
          <span className="block text-center">
            <MetricCell value={row.original.etaDestMetrics.onTime} kind="onTime" />
          </span>
        ),
      },
      {
        id: 'etaDest.early',
        accessorFn: (row) => row.etaDestMetrics.early,
        header: () => <SortHeader label="Dest Early" sortKeyFor="etaDest.early" />,
        cell: ({ row }) => (
          <span className="block text-center">
            <MetricCell value={row.original.etaDestMetrics.early} kind="early" />
          </span>
        ),
      },
      {
        id: 'etaDest.delay',
        accessorFn: (row) => row.etaDestMetrics.delay,
        header: () => <SortHeader label="Dest Delay" sortKeyFor="etaDest.delay" />,
        cell: ({ row }) => (
          <span className="block text-center">
            <MetricCell value={row.original.etaDestMetrics.delay} kind="delay" />
          </span>
        ),
      },
    ],
    [SortHeader],
  )

  const subtitle = isLoading
    ? 'Carregando…'
    : isError
      ? 'Falha ao carregar'
      : vinculo !== 'all'
        ? `${filteredDrivers.length} de ${drivers.length} motoristas`
        : `${drivers.length} motoristas`

  return (
    <>
      <DataTable<RankedDriver>
        data={filteredDrivers}
        columns={columns}
        onRowClick={(d) => setSelectedDriver(d)}
        selectedId={selectedDriver?.id ?? null}
        title="Ranking de Motoristas"
        subtitle={subtitle}
        emptyMessage={
          isLoading
            ? 'Carregando ranking…'
            : isError
              ? 'Não foi possível carregar o ranking.'
              : 'Nenhum motorista no ranking.'
        }
      />

      <DriverDetailsDialog
        driver={selectedDriver}
        open={!!selectedDriver}
        onOpenChange={(o) => {
          if (!o) setSelectedDriver(null)
        }}
      />
    </>
  )
}
