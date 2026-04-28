import { KPICard } from '@/components/domain/KPICard'
import { useTorreKPIs } from '@/hooks/useDashboardKPIs'

export function TorreKPIRow() {
  const { data: k } = useTorreKPIs()
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
      <KPICard
        title="Viagens ativas"
        value={k.viagensAtivas.count}
        total={k.viagensAtivas.total}
        color="blue"
      />
      <KPICard
        title="Em risco"
        value={k.emRisco.count}
        total={k.emRisco.total}
        color="orange"
      />
      <KPICard
        title="Atrasos críticos"
        value={k.atrasosCriticos.count}
        total={k.atrasosCriticos.total}
        color="red"
      />
      <KPICard
        title="Sem sinal"
        value={k.semSinal.count}
        total={k.semSinal.total}
        color="gray"
      />
      <KPICard
        title="Ocorrências abertas"
        value={k.ocorrencias.criticas + k.ocorrencias.medias}
        subtitle={`${k.ocorrencias.criticas} críticas · ${k.ocorrencias.medias} médias`}
        color="purple"
      />
    </div>
  )
}
