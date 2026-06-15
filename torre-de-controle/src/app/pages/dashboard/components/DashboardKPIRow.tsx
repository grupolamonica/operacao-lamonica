import { KPICard } from '@/components/domain/KPICard'
import { useDashboardKPIs } from '@/hooks/useDashboardKPIs'
import { formatPercent } from '@/lib/formatters'
import { type PrazoRange, rangeLabel } from '@/components/domain/PrazoFinalFilter'

// Phase 13 — métricas iguais ao painel GAS:
// Total · No Prazo · Atrasadas · Concluídas · Alertas · Tickets Pendentes · % No Prazo
export function DashboardKPIRow({ range }: { range: PrazoRange }) {
  const { data: k } = useDashboardKPIs(range)

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
      <KPICard title="Total de Viagens" value={k.total} color="blue" />
      <KPICard title="No Prazo" value={k.noPrazo} color="green" />
      <KPICard title="Atrasadas" value={k.atrasadas} color="red" />
      <KPICard title="Concluídas" value={k.concluidas} color="green" />
      <KPICard title="Alertas" value={k.alertas} color="orange" />
      <KPICard title="🎫 Tickets Pendentes" value={k.ticketsPendentes} color="purple" />
      <KPICard
        title="% No Prazo"
        value={formatPercent(k.pctNoPrazo ?? 0)}
        subtitle={`${k.noPrazo ?? 0} de ${k.aferidas ?? 0} aferidas · ${rangeLabel(range)}`}
        progressValue={k.pctNoPrazo ?? 0}
        color="blue"
      />
    </div>
  )
}
