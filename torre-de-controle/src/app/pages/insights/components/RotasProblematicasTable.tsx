import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { type ColumnDef } from '@tanstack/react-table'
import { DataTable } from '@/components/domain/DataTable'
import { PanelCard } from '@/components/domain/PanelCard'
import type { ProblematicRoute } from '@/hooks/useInsights'

interface Props {
  data:        ProblematicRoute[]
  isLoading?:  boolean
  dateFilter?: string | null
}

// DataTable exige { id: string } — mapear routeId → id
type RouteRow = ProblematicRoute & { id: string }

/**
 * Top routes ordered by atrasos/alertas. Click em linha navega para
 * /viagens?route=ORIGEM → DESTINO (CONTEXT D-05 drill-down — casa com o
 * filtro de rota da ViagensTable, que aceita par origem→destino).
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
      <PanelCard title="Rotas Problemáticas" subtitle="Top 20 por atrasos e alertas" noPadding>
        <p className="text-sm text-muted-foreground py-8 text-center">Carregando...</p>
      </PanelCard>
    )
  }

  return (
    <DataTable<RouteRow>
      data={rows}
      columns={columns}
      pageSize={10}
      title="Rotas Problemáticas"
      subtitle="Top 20 por atrasos e alertas"
      emptyMessage="Sem dados no período."
      onRowClick={(r) => navigate(`/viagens?route=${encodeURIComponent(`${r.code} → ${r.name}`)}`)}
    />
  )
}
