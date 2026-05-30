import { useMemo } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { DataTable } from '@/components/domain/DataTable'
import { Badge } from '@/components/ui/badge'
import { fixMojibake } from '@/lib/mojibake'
// Tipo do contrato Phase 7 (re-exportado pelo App type). Importado por path
// relativo — mesmo padrao de tipo-do-contrato usado por src/hooks/useRanking.ts
// (`../../../api/...`). NAO ha hook de logs nesta fase: o endpoint de leitura de
// evaluation_logs e Phase 9 (ver abaixo).
import type { EvaluationLogRecord } from '../../../../../../api/src/modules/ranking/ranking.types'

/**
 * LogsTab — aba Logs (PHASE8-TAB-LOGS). Recria a auditoria do ride-rank
 * (EvaluationLogList.tsx) no design Torre: uma DataTable com as colunas
 * Data/Hora, Acao, Viagem, Motorista, Operador e Detalhes (diff antes/depois).
 *
 * SHELL HONESTO (restricao real, NAO reducao de escopo): o modulo ranking do
 * Phase 7 expoe apenas 5 endpoints — drivers, trips, blocks, route-scores, stats
 * (ranking.plugin.ts / 07-04-SUMMARY). NAO existe `GET /api/ranking/logs`; a
 * leitura de `evaluation_logs` esta planejada para a Phase 9
 * (MILESTONE-v2-ROADMAP). Por isso esta aba monta a tabela + o render de diff
 * PRONTOS, mas alimenta com um array vazio e exibe um aviso de que a auditoria
 * sera habilitada na Phase 9 — sem chamar endpoint inexistente, sem criar
 * `useRankingLogs` e sem fetch. A Phase 9 so precisa trocar `const logs = []`
 * por um hook de dados.
 *
 * READ-ONLY por natureza: auditoria e somente leitura.
 */

/** Linha da tabela: EvaluationLogRecord + `id` estavel exigido pela DataTable. */
type LogRow = EvaluationLogRecord & { id: string }

/** Chaves de identificacao mostradas em colunas proprias — excluidas do diff. */
const DIFF_OMIT_KEYS = ['trip_id', 'driver_id', 'driver_name', 'operador'] as const

/**
 * Badge de acao no tom Argon (mesma abordagem de cor inline do DriverStatusBadge
 * em RankingTab — a Badge shadcn nao tem variante `success`).
 * CRIACAO=verde, EDICAO=azul, DESBLOQUEIO=ambar, default=outline.
 */
function ActionBadge({ acao }: { acao: string }) {
  const upper = (acao ?? '').toUpperCase()
  if (upper === 'CRIAÇÃO' || upper === 'CRIACAO') {
    return (
      <Badge
        className="text-[10px]"
        style={{
          backgroundColor: 'var(--status-no-prazo-bg)',
          color: 'var(--status-no-prazo-fg)',
        }}
      >
        {acao}
      </Badge>
    )
  }
  if (upper === 'EDIÇÃO' || upper === 'EDICAO') {
    return (
      <Badge className="text-[10px] bg-blue-500/15 text-blue-600 border-blue-500/20">
        {acao}
      </Badge>
    )
  }
  if (upper === 'DESBLOQUEIO') {
    return (
      <Badge className="text-[10px] bg-amber-500/15 text-amber-600 border-amber-500/20">
        {acao}
      </Badge>
    )
  }
  return (
    <Badge variant="outline" className="text-[10px]">
      {acao || '—'}
    </Badge>
  )
}

/** Serializa um valor de diff como texto puro (auto-escape do JSX — T-08-15). */
function stringifyDiffValue(value: unknown): string {
  if (value == null) return '—'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

/**
 * renderDiff — render do DIFF antes/depois de um log de auditoria.
 *
 * Para cada chave relevante (excluindo as de identificacao em DIFF_OMIT_KEYS):
 *   - se ha valor anterior e posterior distintos -> `chave: antes → depois`
 *   - se so ha `dados_depois`                     -> `chave: valor`
 *
 * Renderizado como texto JSX (sem dangerouslySetInnerHTML) — os valores sao
 * escapados pelo React, mitigando XSS quando os dados existirem na Phase 9
 * (threat T-08-15). Pronto para receber dados reais sem alteracao.
 */
function renderDiff(
  dadosAntes: EvaluationLogRecord['dados_antes'],
  dadosDepois: EvaluationLogRecord['dados_depois'],
): React.ReactNode {
  const before = dadosAntes ?? {}
  const after = dadosDepois ?? {}
  const keys = Array.from(
    new Set([...Object.keys(before), ...Object.keys(after)]),
  ).filter((k) => !(DIFF_OMIT_KEYS as readonly string[]).includes(k))

  if (keys.length === 0) {
    return <span className="text-muted-foreground">—</span>
  }

  return (
    <span className="flex flex-col gap-0.5">
      {keys.map((key) => {
        const hasBefore = Object.prototype.hasOwnProperty.call(before, key)
        const beforeText = stringifyDiffValue(before[key])
        const afterText = stringifyDiffValue(after[key])
        return (
          <span key={key} className="font-mono text-[11px] leading-tight">
            <span className="text-muted-foreground">{key}:</span>{' '}
            {hasBefore ? (
              <>
                <span className="text-red-500 line-through">{beforeText}</span>
                <span className="text-muted-foreground"> → </span>
                <span className="text-emerald-500">{afterText}</span>
              </>
            ) : (
              <span className="text-foreground">{afterText}</span>
            )}
          </span>
        )
      })}
    </span>
  )
}

/** Formata `created_at` ISO -> data + hora pt-BR (igual ao EvaluationLogList). */
function formatLogDate(createdAt?: string): string {
  if (!createdAt) return '—'
  const date = new Date(createdAt)
  if (Number.isNaN(date.getTime())) return '—'
  return `${date.toLocaleDateString('pt-BR')} ${date.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  })}`
}

export function LogsTab() {
  // Sem dados nesta fase: a leitura de evaluation_logs e Phase 9. A tabela e o
  // render de diff ja estao prontos — a Phase 9 troca esta linha por um hook.
  const logs: EvaluationLogRecord[] = []

  const rows = useMemo<LogRow[]>(
    () =>
      logs.map((log, i) => ({
        ...log,
        id: log.id ?? `${log.trip_id ?? 'log'}-${i}`,
      })),
    [logs],
  )

  const columns = useMemo<ColumnDef<LogRow, unknown>[]>(
    () => [
      {
        id: 'created_at',
        header: 'Data/Hora',
        cell: ({ row }) => (
          <span className="font-mono text-xs text-muted-foreground whitespace-nowrap">
            {formatLogDate(row.original.created_at)}
          </span>
        ),
      },
      {
        id: 'acao',
        header: 'Ação',
        cell: ({ row }) => <ActionBadge acao={row.original.acao} />,
      },
      {
        id: 'trip_id',
        header: 'Viagem',
        cell: ({ row }) => (
          <span className="font-mono text-xs">{row.original.trip_id || '—'}</span>
        ),
      },
      {
        id: 'driver_name',
        header: 'Motorista',
        cell: ({ row }) => (
          <span className="text-sm">{fixMojibake(row.original.driver_name) || '—'}</span>
        ),
      },
      {
        id: 'operador',
        header: 'Operador',
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">{row.original.operador || '—'}</span>
        ),
      },
      {
        id: 'detalhes',
        header: 'Detalhes',
        cell: ({ row }) => (
          <div className="max-w-[320px]">
            {renderDiff(row.original.dados_antes, row.original.dados_depois)}
          </div>
        ),
      },
    ],
    [],
  )

  return (
    <DataTable<LogRow>
      data={rows}
      columns={columns}
      title="Log de Auditoria"
      subtitle="Auditoria habilitada na Phase 9 (evaluation_logs)"
      emptyMessage="Auditoria será habilitada na Phase 9 (leitura de evaluation_logs). A tabela e o diff antes/depois já estão prontos para receber os dados."
    />
  )
}
