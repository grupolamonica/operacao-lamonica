import { KPICard } from '@/components/domain/KPICard'
import { useViagensKPIs } from '@/hooks/useDashboardKPIs'
import { formatPercent } from '@/lib/formatters'

export function ViagensKPIRow() {
  const { data: k } = useViagensKPIs()
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
      <KPICard title="Total viagens"   value={k.total.count}        color="blue"   />
      <KPICard title="No prazo"         value={k.noPrazo.count}      percent={formatPercent(k.noPrazo.pct)}     color="green"  />
      <KPICard title="Em risco"         value={k.emRisco.count}      percent={formatPercent(k.emRisco.pct)}     color="orange" />
      <KPICard title="Atrasadas"        value={k.atrasadas.count}    percent={formatPercent(k.atrasadas.pct)}   color="red"    />
      <KPICard title="Progresso médio"  value={formatPercent(k.progressoMedio.pct, 0)} progressValue={k.progressoMedio.pct} color="purple" />
    </div>
  )
}
