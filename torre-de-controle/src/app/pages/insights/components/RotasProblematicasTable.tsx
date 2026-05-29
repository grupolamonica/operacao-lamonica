import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { type ColumnDef } from '@tanstack/react-table'
import { DataTable } from '@/components/domain/DataTable'
import type { ProblematicRoute } from '@/hooks/useInsights'

interface Props {
  data:        ProblematicRoute[]
  isLoading?:  boolean
  dateFilter?: string | null
}

// DataTable exige { id: string } — mapear routeId → id
type RouteRow = ProblematicRoute & { id: string }

/**
 * Top routes ordered by alert count. Click em linha navega para
 * /viagens?route=CODE (CONTEXT D-05 drill-down).
 * dateFilter prop: aceito mas backend não filtra por dia (banner visual no
 * parent indica filtro ativo).
 */
export function RotasProblematicasTable({ data, isLoading }: Props) {
  const navigate = useNavigate()

  const rows = useMemo<RouteRow[]>(
    () => data.map(r => ({ ...r, id: r.routeId })),
    [data],
  )

  const columns: ColumnDef<RouteRow>[] = [
    {
      id: 'route', header: 'Rota', size: 220,
      cell: ({ row }) => (
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground truncate">{row.original.code}</p>
          <p className="text-xs text-muted-foreground truncate">{row.original.name}</p>
        </div>
      ),
    },
    {
      accessorKey: 'alerts',
      header:      'Alertas',
      cell: (i) => <span className="text-sm tabular-nums text-foreground">{i.getValue<number>()}</span>,
    },
    {
      accessorKey: 'avgDelay',
      header:      'Atraso médio (min)',
      cell: (i) => {
        const v = i.getValue<number>()
        return <span className="text-sm tabular-nums text-foreground">{v > 0 ? v.toFixed(1) : '—'}</span>
      },
    },
    {
      accessorKey: 'slaPercent',
      header:      'SLA',
      cell: (i) => {
        const v = i.getValue<number>()
        return <span className="text-sm tabular-nums text-foreground">{(v * 100).toFixed(1)}%</span>
      },
    },
  ]

  if (isLoading) {
    return (
      <div className="bg-card overflow-hidden w-full" style={{ borderRadius: '1rem', boxShadow: '0 0 2rem 0 rgba(136, 152, 170, 0.15)' }}>
        <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
          <h3 className="text-sm font-semibold text-foreground">Rotas Problemáticas</h3>
        </div>
        <p className="text-sm text-muted-foreground py-8 text-center">Carregando...</p>
      </div>
    )
  }

  return (
    <DataTable<RouteRow>
      data={rows}
      columns={columns}
      pageSize={10}
      title="Rotas Problemáticas"
      subtitle="Top 20 por alertas"
      emptyMessage="Sem dados no período."
      onRowClick={(r) => navigate(`/viagens?route=${encodeURIComponent(r.code)}`)}
    />
  )
}
