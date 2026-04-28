import { useDashboardKPIs } from '@/hooks/useDashboardKPIs'
import { useTrips } from '@/hooks/useTrips'

export function OperationalSummary() {
  const { data: kpis } = useDashboardKPIs()
  const { data: inProgress } = useTrips({ status: 'in_progress' })
  const { data: planned } = useTrips({ status: 'planned' })
  const { data: completed } = useTrips({ status: 'completed' })

  const rows = [
    { label: 'Viagens em andamento', value: inProgress.length, accent: '' },
    { label: 'Viagens planejadas',   value: planned.length,    accent: '' },
    { label: 'Concluídas hoje',      value: completed.length,  accent: '' },
    { label: 'Atrasos críticos',     value: kpis.atrasosCriticos.count, accent: 'text-red-600' },
    { label: 'Motoristas em risco',  value: kpis.motoristasEmRisco.count, accent: 'text-orange-600' },
  ]

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <h3 className="text-sm font-semibold text-gray-900 mb-3">Resumo operacional</h3>
      <ul className="space-y-2.5">
        {rows.map(r => (
          <li key={r.label} className="flex items-center justify-between text-sm">
            <span className="text-gray-600">{r.label}</span>
            <span className={`font-semibold tabular-nums ${r.accent || 'text-gray-900'}`}>
              {r.value}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
