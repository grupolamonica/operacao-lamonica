import { useMemo } from 'react'
import { Plus } from 'lucide-react'
import type { ColumnDef } from '@tanstack/react-table'
import { DataTable } from '@/components/domain/DataTable'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  useRankingRouteScores,
  useRankingTrips,
  type RouteScoreRecord,
} from '@/hooks/useRanking'
import { fixMojibake } from '@/lib/mojibake'
import { formatDate } from '@/lib/formatters'

/**
 * RotasTab — aba Rotas (PHASE8-TAB-ROTAS). Recria a RouteScores do ride-rank no
 * design Torre, em MODO LEITURA: tabela de RouteScoreRecord com Origem, Destino,
 * Viagens (contagem cruzada com /trips), Pontuacao, Periodo e Observacao.
 *
 * READ-ONLY (CONTEXT D-V2-03): o ride-rank tinha CRUD completo (criar/editar/
 * remover pontuacao) + dialog de historico — tudo escrita. Aqui essas acoes sao
 * OMITIDAS; o unico vestigio e um botao "Nova Pontuacao" DESABILITADO no toolbar
 * sinalizando que a edicao chega na Phase 9. Nenhuma chamada de escrita acontece
 * nesta fase (criar/editar/remover pontuacao de rota ausentes).
 *
 * VIAGENS (coluna opcional do plano): o ride-rank deriva a contagem agrupando as
 * viagens por origem->destino. Mantemos esse comportamento cruzando
 * useRankingTrips() num mapa `origin->destination` -> count; rotas sem viagem
 * mostram 0. E somente leitura e barato (memoizado).
 *
 * ID estavel: RouteScoreRecord.id e opcional (id?). A DataTable exige `{ id:
 * string }`, entao mapeamos para um id deterministico
 * (`origin`-`destination`-`data_inicio`) antes de passar.
 */

/** Linha da tabela: RouteScoreRecord + id estavel garantido. */
type RouteRow = RouteScoreRecord & { id: string }

export function RotasTab() {
  const { data: routeScores, isLoading, isError } = useRankingRouteScores()
  const { data: trips } = useRankingTrips()

  // Contagem de viagens por rota (origin->destination), como no ride-rank.
  const tripCountByRoute = useMemo(() => {
    const map = new Map<string, number>()
    for (const t of trips) {
      if (!t.origin_code || !t.destination_code) continue
      const key = `${t.origin_code}→${t.destination_code}`
      map.set(key, (map.get(key) ?? 0) + 1)
    }
    return map
  }, [trips])

  // id estavel: id? do backend ou fallback deterministico (origem-destino-inicio).
  const data = useMemo<RouteRow[]>(
    () =>
      routeScores.map((rs) => ({
        ...rs,
        id: rs.id ?? `${rs.origin_code}-${rs.destination_code}-${rs.data_inicio}`,
      })),
    [routeScores],
  )

  const columns = useMemo<ColumnDef<RouteRow, unknown>[]>(
    () => [
      {
        id: 'origin_code',
        header: 'Origem',
        cell: ({ row }) => (
          <span className="font-mono text-xs font-medium">{row.original.origin_code}</span>
        ),
      },
      {
        id: 'destination_code',
        header: 'Destino',
        cell: ({ row }) => (
          <span className="font-mono text-xs font-medium">{row.original.destination_code}</span>
        ),
      },
      {
        id: 'viagens',
        header: 'Viagens',
        cell: ({ row }) => {
          const key = `${row.original.origin_code}→${row.original.destination_code}`
          return (
            <span className="block text-right font-mono tabular-nums text-muted-foreground">
              {tripCountByRoute.get(key) ?? 0}
            </span>
          )
        },
      },
      {
        id: 'pontuacao',
        header: 'Pontuação',
        cell: ({ row }) => (
          <Badge variant="default" className="font-mono text-xs">
            {row.original.pontuacao} pt
          </Badge>
        ),
      },
      {
        id: 'periodo',
        header: 'Período',
        cell: ({ row }) => (
          <span className="font-mono text-xs text-muted-foreground">
            {row.original.data_inicio ? formatDate(row.original.data_inicio, 'dd/MM/yyyy') : '—'}
            {row.original.data_fim ? ` → ${formatDate(row.original.data_fim, 'dd/MM/yyyy')}` : ' → atual'}
          </span>
        ),
      },
      {
        id: 'observacao',
        header: 'Obs.',
        cell: ({ row }) => {
          const obs = fixMojibake(row.original.observacao)
          return (
            <span className="block max-w-[220px] truncate text-xs text-muted-foreground" title={obs}>
              {obs || '—'}
            </span>
          )
        },
      },
    ],
    [tripCountByRoute],
  )

  const subtitle = isLoading
    ? 'Carregando…'
    : isError
      ? 'Falha ao carregar'
      : `${routeScores.length} rotas`

  // Toolbar: vestigio da escrita (Phase 9), DESABILITADO e sem handler.
  const toolbar = (
    <Button size="sm" className="h-8 gap-1.5 text-xs" disabled title="Disponível na Phase 9">
      <Plus className="h-3.5 w-3.5" />
      Nova Pontuação
    </Button>
  )

  return (
    <DataTable<RouteRow>
      data={data}
      columns={columns}
      toolbar={toolbar}
      title="Rotas"
      subtitle={subtitle}
      emptyMessage={
        isLoading
          ? 'Carregando rotas…'
          : isError
            ? 'Não foi possível carregar as rotas.'
            : 'Nenhuma pontuação de rota cadastrada.'
      }
    />
  )
}
