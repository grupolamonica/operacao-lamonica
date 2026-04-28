import { KPICard } from '@/components/domain/KPICard'
import { useAlertasKPIs } from '@/hooks/useDashboardKPIs'
import { SLAGauge } from './SLAGauge'

export function AlertasKPIRow() {
  const { data: k } = useAlertasKPIs()
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <KPICard title="Críticos"        value={k.criticos.count}       color="red"   />
      <KPICard title="Abertos"          value={k.abertos.count}        color="orange"/>
      <KPICard title="Resolvidos hoje"  value={k.resolvidosHoje.count} color="green" />

      <div className="bg-card rounded-lg shadow-md p-4 flex items-center justify-between border border-border hover:shadow-lg transition-shadow duration-200">
        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">SLA das tratativas</span>
          <span className="text-2xl font-bold text-foreground tabular-nums">{k.slaTratativas.pct}%</span>
          <span className="text-[10px] text-muted-foreground">Tempo médio dentro da meta</span>
        </div>
        <SLAGauge value={k.slaTratativas.pct} size={64} color="#0f62fe" />
      </div>
    </div>
  )
}
