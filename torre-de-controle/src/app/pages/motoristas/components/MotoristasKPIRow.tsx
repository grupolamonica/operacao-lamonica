import { KPICard } from '@/components/domain/KPICard'
import { useMotoristasKPIs } from '@/hooks/useDashboardKPIs'

export function MotoristasKPIRow() {
  const { data: k } = useMotoristasKPIs()
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
      <KPICard title="Motoristas ativos"     value={k.ativos.count}             total={k.ativos.total} color="blue"   />
      <KPICard title="Disponíveis"            value={k.disponiveis.count}        color="green"  />
      <KPICard title="Em rota"                value={k.emRota.count}             color="purple" />
      <KPICard title="Com atraso"             value={k.comAtraso.count}          color="orange" />
      <KPICard title="Documentos vencendo"    value={k.documentosVencendo.count} color="red"    />
    </div>
  )
}
