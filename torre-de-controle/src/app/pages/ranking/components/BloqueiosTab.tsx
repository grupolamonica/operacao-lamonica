import { useMemo } from 'react'
import { ShieldAlert, Unlock } from 'lucide-react'
import type { ColumnDef } from '@tanstack/react-table'
import { DataTable } from '@/components/domain/DataTable'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useRankingBlocks, type DriverBlockRecord } from '@/hooks/useRanking'
import { fixMojibake } from '@/lib/mojibake'

/**
 * BloqueiosTab — aba Bloqueios (PHASE8-TAB-BLOQUEIOS). Recria a BlocksList do
 * ride-rank no design Torre: DataTable de DriverBlockRecord (somente bloqueios
 * ATIVOS — o endpoint /api/ranking/blocks ja filtra) com Motorista, Tipo,
 * Motivo, Inicio, Status, Criado por e a acao Desbloquear.
 *
 * READ-ONLY (CONTEXT D-V2-03): a acao "Desbloquear" do ride-rank era uma escrita
 * (mutacao de desbloqueio). Aqui ela aparece DESABILITADA com aviso de Phase 9 e
 * NAO possui handler de API — nenhuma chamada de escrita acontece nesta fase (a
 * escrita + RBAC sao Phase 9, D-V2-06).
 *
 * STATUS BADGE (desvio do plano): o StatusBadge compartilhado do Torre so aceita
 * as chaves de SLA (no_prazo/em_risco/atrasado/sem_sinal) e nao comporta o label
 * "BLOQUEADO". Para nao alterar esse componente (fora de escopo desta wave), o
 * status usa um Badge inline com as CSS vars de status do tema (mesmo padrao do
 * DriverStatusBadge da RankingTab). Todas as linhas sao ativas => "BLOQUEADO".
 *
 * ID estavel: DriverBlockRecord.id e opcional (id?). A DataTable exige `{ id:
 * string }`, entao os dados sao mapeados para um shape com id deterministico
 * (`driver_id`-indice) antes de serem passados.
 */

/** Linha da tabela: DriverBlockRecord + id estavel garantido. */
type BlockRow = DriverBlockRecord & { id: string }

/** Badge do tipo de bloqueio (NO_SHOW / MANUAL), tom mono como no ride-rank. */
function TipoBadge({ tipo }: { tipo: string }) {
  return (
    <Badge variant="outline" className="text-[10px] font-mono">
      {tipo}
    </Badge>
  )
}

/** Badge de status do bloqueio. Todas as linhas sao ativas => BLOQUEADO (vermelho). */
function BloqueioStatusBadge() {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap"
      style={{ backgroundColor: 'var(--status-atrasado-bg)', color: 'var(--status-atrasado-fg)' }}
    >
      <ShieldAlert className="h-3 w-3" />
      BLOQUEADO
    </span>
  )
}

export function BloqueiosTab() {
  const { data: blocks, isLoading, isError } = useRankingBlocks()

  // id estavel: id? do backend ou fallback deterministico (driver_id + indice).
  const data = useMemo<BlockRow[]>(
    () => blocks.map((b, i) => ({ ...b, id: b.id ?? `${b.driver_id}-${i}` })),
    [blocks],
  )

  const columns = useMemo<ColumnDef<BlockRow, unknown>[]>(
    () => [
      {
        id: 'driver_name',
        header: 'Motorista',
        cell: ({ row }) => (
          <span className="font-medium">{fixMojibake(row.original.driver_name)}</span>
        ),
      },
      {
        id: 'tipo',
        header: 'Tipo',
        cell: ({ row }) => <TipoBadge tipo={row.original.tipo} />,
      },
      {
        id: 'motivo',
        header: 'Motivo',
        cell: ({ row }) => (
          <span className="block max-w-[220px] truncate text-muted-foreground" title={fixMojibake(row.original.motivo)}>
            {fixMojibake(row.original.motivo) || '—'}
          </span>
        ),
      },
      {
        id: 'data_inicio',
        header: 'Início',
        cell: ({ row }) => (
          <span className="font-mono text-xs text-muted-foreground">
            {row.original.data_inicio || '—'}
          </span>
        ),
      },
      {
        id: 'status',
        header: 'Status',
        cell: () => <BloqueioStatusBadge />,
      },
      {
        id: 'created_by',
        header: 'Criado por',
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">{fixMojibake(row.original.created_by) || '—'}</span>
        ),
      },
      {
        id: 'acao',
        header: 'Ação',
        cell: () => (
          // READ-ONLY: desabilitado e SEM onClick. A escrita de desbloqueio e Phase 9.
          <Button
            size="sm"
            variant="outline"
            className="h-7 gap-1 text-xs"
            disabled
            title="Disponível na Phase 9"
          >
            <Unlock className="h-3 w-3" />
            Desbloquear
          </Button>
        ),
      },
    ],
    [],
  )

  const subtitle = isLoading
    ? 'Carregando…'
    : isError
      ? 'Falha ao carregar'
      : `${blocks.length} ativos`

  return (
    <DataTable<BlockRow>
      data={data}
      columns={columns}
      title="Bloqueios"
      subtitle={subtitle}
      emptyMessage={
        isLoading
          ? 'Carregando bloqueios…'
          : isError
            ? 'Não foi possível carregar os bloqueios.'
            : 'Nenhum bloqueio ativo'
      }
    />
  )
}
