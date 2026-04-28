import { KPICard } from '@/components/domain/KPICard'
import { useDashboardKPIs } from '@/hooks/useDashboardKPIs'
import { formatPercent } from '@/lib/formatters'

export function DashboardKPIRow() {
  const { data: kpis } = useDashboardKPIs()

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
      <KPICard
        title="Entregas no prazo"
        value={kpis.entregas.onTime}
        total={kpis.entregas.total}
        percent={formatPercent(kpis.entregas.pct)}
        progressValue={kpis.entregas.pct}
        color="green"
      />
      <KPICard
        title="% SLA"
        value={formatPercent(kpis.sla.pct)}
        subtitle={`Meta: ${kpis.sla.meta}%`}
        progressValue={kpis.sla.pct}
        color="blue"
      />
      <KPICard
        title="Motoristas em risco"
        value={kpis.motoristasEmRisco.count}
        total={kpis.motoristasEmRisco.total}
        sparklineData={kpis.motoristasEmRisco.sparkline}
        color="orange"
      />
      <KPICard
        title="Atrasos críticos"
        value={kpis.atrasosCriticos.count}
        total={kpis.atrasosCriticos.total}
        sparklineData={kpis.atrasosCriticos.sparkline}
        color="red"
      />
      <KPICard
        title="Paradas não planejadas"
        value={kpis.paradasNaoPlanejadas.count}
        total={kpis.paradasNaoPlanejadas.total}
        sparklineData={kpis.paradasNaoPlanejadas.sparkline}
        color="purple"
      />
    </div>
  )
}
